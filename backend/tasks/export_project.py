import json
import os
import re
import shutil
import tempfile
import uuid
from pathlib import Path
import subprocess
from typing import Dict, List, Optional, Tuple
import redis
import ffmpeg
from celery import shared_task
from sqlalchemy import create_engine, select, update, func
from sqlalchemy.orm import sessionmaker

from core.celery_app import celery_app
from core.config import get_settings
from core.logging import get_logger
from models.export_task import ExportTask
from models.asset import Asset
from models.timeline import ProjectTimeline
from schemas.timeline import Timeline, Clip, Track
from services.storage import get_storage_service

logger = get_logger("tasks.export_project")
storage_service = get_storage_service()
settings = get_settings()


# ========== Database Helpers ==========

def get_db_session():
    """创建同步数据库会话（Celery任务中不能使用async）"""
    engine = create_engine(str(settings.DATABASE_URL).replace("asyncpg", "psycopg2"))
    Session = sessionmaker(bind=engine)
    return Session()


def update_export_status(
    export_id: uuid.UUID,
    status: str,
    progress: Optional[int] = None,
    error_message: Optional[str] = None,
    **fields,
) -> None:
    """更新导出任务状态和字段"""
    session = get_db_session()
    try:
        # 构建更新字典
        update_data = {"status": status}
        if progress is not None:
            update_data["progress"] = progress
        if error_message:
            update_data["error_message"] = error_message
        update_data.update(fields)

        # 执行更新
        stmt = (
            update(ExportTask)
            .where(ExportTask.id == export_id)
            .values(**update_data)
        )
        session.execute(stmt)
        session.commit()
        logger.info(f"Export {export_id} status updated to {status}, progress {progress}")
    except Exception as e:
        logger.error(f"Failed to update export {export_id} status: {e}")
        session.rollback()
        raise
    finally:
        session.close()


# ========== Redis/WebSocket Helpers ==========

def publish_ws_message(user_id: uuid.UUID, message: dict) -> None:
    """通过Redis Pub/Sub发布WebSocket消息"""
    try:
        redis_client = redis.from_url(str(settings.REDIS_URL))
        channel = f"ws:user:{user_id}"
        redis_client.publish(channel, json.dumps(message))
        logger.debug(f"Published WebSocket message to {channel}: {message.get('type')}")
    except Exception as e:
        logger.error(f"Failed to publish WebSocket message: {e}")


# ========== MinIO Helpers ==========

def download_asset_file(asset_id: uuid.UUID, local_path: Path) -> bool:
    """从MinIO下载素材文件到本地"""
    session = get_db_session()
    try:
        # 获取素材存储路径
        result = session.execute(
            select(Asset).where(Asset.id == asset_id)
        )
        asset = result.scalar_one_or_none()
        if not asset:
            logger.error(f"Asset {asset_id} not found")
            return False

        storage_key = asset.storage_key

        # 使用StorageService同步下载
        with open(local_path, "wb") as f:
            response = storage_service.s3_client.get_object(
                Bucket=storage_service.BUCKETS["assets"],
                Key=storage_key,
            )
            for chunk in response["Body"].iter_chunks(chunk_size=8192):
                f.write(chunk)
        logger.info(f"Downloaded asset {asset_id} to {local_path}")
        return True
    except Exception as e:
        logger.error(f"Failed to download asset {asset_id}: {e}")
        return False
    finally:
        session.close()


def upload_export_file(local_path: Path, export_id: uuid.UUID) -> Optional[str]:
    """上传导出文件到MinIO"""
    try:
        output_key = f"exports/{export_id}/output.mp4"
        with open(local_path, "rb") as f:
            storage_service.upload_bytes(
                bucket=storage_service.BUCKETS["exports"],
                key=output_key,
                data=f.read(),
                content_type="video/mp4",
            )
        logger.info(f"Uploaded export file to {output_key}")
        return output_key
    except Exception as e:
        logger.error(f"Failed to upload export file: {e}")
        return None


def generate_download_url(output_key: str) -> Optional[str]:
    """生成预签名下载URL（7天有效期）"""
    try:
        url = storage_service.generate_presigned_download_url(
            bucket=storage_service.BUCKETS["exports"],
            key=output_key,
            expires_seconds=604800,  # 7 days
        )
        return url
    except Exception as e:
        logger.error(f"Failed to generate download URL: {e}")
        return None


# ========== FFmpeg Helpers ==========

def parse_ffmpeg_progress(stderr_line: str, total_duration_ms: int) -> Optional[int]:
    """
    从FFmpeg stderr解析进度时间码，返回进度百分比（0-100）
    匹配模式：time=01:23:45.67
    """
    pattern = r"time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})"
    match = re.search(pattern, stderr_line)
    if not match:
        return None

    hours, minutes, seconds, centiseconds = map(int, match.groups())
    current_ms = ((hours * 3600) + (minutes * 60) + seconds) * 1000 + centiseconds * 10
    if total_duration_ms == 0:
        return 0

    progress = int((current_ms / total_duration_ms) * 100)
    # 限制在0-100范围内
    return max(0, min(100, progress))


def build_filter_complex(
    clips: List[Clip],
    asset_files: Dict[uuid.UUID, Path],
    total_duration_ms: int,
) -> Tuple[ffmpeg.nodes.Filterable, ffmpeg.nodes.Filterable]:
    """
    构建FFmpeg filter_complex图
    返回 (video_filter, audio_filter) 元组
    """
    video_streams = []
    audio_streams = []

    for clip in clips:
        asset_path = asset_files.get(clip.asset_id)
        if not asset_path or not asset_path.exists():
            raise ValueError(f"Asset file for {clip.asset_id} not found")

        # 输入流
        input_stream = ffmpeg.input(str(asset_path))

        # 视频流处理
        video = input_stream.video
        # trim裁剪
        ss_seconds = clip.source_start_ms / 1000.0
        end_seconds = clip.source_end_ms / 1000.0
        video = video.trim(start=ss_seconds, end=end_seconds).setpts('PTS-STARTPTS')
        # 速度调整
        if clip.speed != 1.0:
            video = video.setpts(f'PTS/{clip.speed}')
        video_streams.append(video)

        # 音频流处理（如果素材有音频）
        try:
            # 尝试获取音频流
            audio = input_stream.audio
            audio = audio.atrim(start=ss_seconds, end=end_seconds).asetpts('PTS-STARTPTS')
            if clip.speed != 1.0:
                audio = audio.atempo(clip.speed)
            audio_streams.append(audio)
        except:
            # 素材没有音频流，跳过
            pass

    # 拼接视频流和音频流
    if not video_streams:
        raise ValueError("No video clips to concatenate")

    video_concat = ffmpeg.concat(*video_streams, v=1, a=0)
    audio_concat = ffmpeg.concat(*audio_streams, v=0, a=1) if audio_streams else None

    return video_concat, audio_concat


# ========== Main Task ==========

@shared_task(bind=True, name="export_project_task", queue="export", soft_time_limit=3600)
def export_project_task(self, export_id: str) -> None:
    """
    Celery 异步导出项目任务
    """
    logger.info(f"Starting export project task: {export_id}")
    export_uuid = uuid.UUID(export_id)
    temp_dir = None
    user_id = None
    project_id = None

    try:
        # ========== 阶段一：准备工作 ==========
        session = get_db_session()

        # 获取导出任务记录
        result = session.execute(
            select(ExportTask).where(ExportTask.id == export_uuid)
        )
        export_task = result.scalar_one_or_none()
        if not export_task:
            logger.error(f"Export task {export_id} not found")
            return

        user_id = export_task.user_id
        project_id = export_task.project_id

        # 获取时间线数据
        timeline_result = session.execute(
            select(ProjectTimeline).where(ProjectTimeline.project_id == project_id)
        )
        timeline_record = timeline_result.scalar_one_or_none()
        if not timeline_record:
            raise ValueError(f"Timeline for project {project_id} not found")

        timeline_data = Timeline.model_validate(timeline_record.timeline_data)
        session.close()

        # 更新状态为 running
        update_export_status(
            export_uuid,
            status="running",
            progress=0,
            started_at=func.now(),
        )

        # 发布进度消息
        publish_ws_message(user_id, {
            "type": "export_progress",
            "export_id": export_id,
            "progress": 0,
            "stage": "准备中",
        })

        # 创建临时目录
        temp_dir = Path(tempfile.mkdtemp(prefix=f"export_{export_id}_"))
        inputs_dir = temp_dir / "inputs"
        output_dir = temp_dir / "output"
        inputs_dir.mkdir(exist_ok=True)
        output_dir.mkdir(exist_ok=True)

        # ========== 阶段二：下载素材文件 ==========
        # 收集所有唯一的 asset_id
        asset_ids = set()
        for track in timeline_data.tracks:
            for clip in track.clips:
                asset_ids.add(clip.asset_id)

        asset_files = {}
        for asset_id in asset_ids:
            local_path = inputs_dir / f"{asset_id}.mp4"  # 假设扩展名为mp4，实际应从Asset记录获取
            if download_asset_file(asset_id, local_path):
                asset_files[asset_id] = local_path
            else:
                raise ValueError(f"Failed to download asset {asset_id}")

        # 发布进度 10%
        update_export_status(export_uuid, status="running", progress=10)
        publish_ws_message(user_id, {
            "type": "export_progress",
            "export_id": export_id,
            "progress": 10,
            "stage": "下载素材完成",
        })

        # ========== 阶段三：构建并运行 FFmpeg ==========
        # 当前仅处理第一条视频轨（多轨道第二阶段扩展）
        video_tracks = [t for t in timeline_data.tracks if t.type == 'video']
        if not video_tracks:
            raise ValueError("No video tracks in timeline")

        first_video_track = video_tracks[0]
        clips = first_video_track.clips
        if not clips:
            raise ValueError("No clips in video track")

        # 构建 filter_complex
        video_filter, audio_filter = build_filter_complex(
            clips, asset_files, timeline_data.duration_ms
        )

        # 输出文件路径
        output_path = output_dir / "output.mp4"

        # 构建FFmpeg命令
        output_args = {
            'c:v': 'libx264',
            'b:v': f'{export_task.video_bitrate_kbps}k',
            'c:a': 'aac' if audio_filter else None,
            'ar': 44100 if audio_filter else None,
        }

        if export_task.resolution_width and export_task.resolution_height:
            output_args['s'] = f'{export_task.resolution_width}x{export_task.resolution_height}'
        if export_task.fps:
            output_args['r'] = export_task.fps

        # 创建输出流
        streams = [video_filter]
        if audio_filter:
            streams.append(audio_filter)

        output = ffmpeg.output(*streams, str(output_path), **{k: v for k, v in output_args.items() if v is not None})

        # 运行FFmpeg（异步，捕获stderr）
        logger.info(f"Starting FFmpeg export to {output_path}")
        process = output.run_async(
            pipe_stderr=True,
            overwrite_output=True,
        )

        # 实时读取进度
        progress = 10  # 起始进度
        while True:
            stderr_line = process.stderr.readline().decode('utf-8', errors='ignore')
            if not stderr_line and process.poll() is not None:
                break

            # 解析进度
            new_progress = parse_ffmpeg_progress(stderr_line, timeline_data.duration_ms)
            if new_progress and new_progress > progress:
                progress = new_progress
                # 映射到总进度范围 10%-90%
                mapped_progress = 10 + int(progress * 0.8)
                update_export_status(export_uuid, status="running", progress=mapped_progress)
                # 每1秒发布一次进度更新
                publish_ws_message(user_id, {
                    "type": "export_progress",
                    "export_id": export_id,
                    "progress": mapped_progress,
                    "stage": "合成视频中",
                })

        # 检查FFmpeg退出码
        return_code = process.wait()
        if return_code != 0:
            raise subprocess.CalledProcessError(return_code, 'ffmpeg')

        # ========== 阶段四：上传输出文件 ==========
        update_export_status(export_uuid, status="running", progress=95)
        publish_ws_message(user_id, {
            "type": "export_progress",
            "export_id": export_id,
            "progress": 95,
            "stage": "上传导出文件",
        })

        output_key = upload_export_file(output_path, export_uuid)
        if not output_key:
            raise ValueError("Failed to upload export file")

        download_url = generate_download_url(output_key)

        # 更新数据库为完成状态
        update_export_status(
            export_uuid,
            status="completed",
            progress=100,
            output_key=output_key,
            download_url=download_url,
            completed_at=func.now(),
        )

        # 发布完成通知
        publish_ws_message(user_id, {
            "type": "export_completed",
            "export_id": export_id,
            "download_url": download_url,
        })

        logger.info(f"Export {export_id} completed successfully")

    except Exception as e:
        logger.error(f"Export {export_id} failed: {e}", exc_info=True)

        # 更新错误状态
        update_export_status(
            export_uuid,
            status="failed",
            error_message=str(e)[:500],
        )

        # 发布失败通知
        if user_id:
            publish_ws_message(user_id, {
                "type": "export_failed",
                "export_id": export_id,
                "error": str(e)[:200],
            })

    finally:
        # ========== 阶段五：清理 ==========
        if temp_dir and temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)
            logger.info(f"Cleaned up temporary directory: {temp_dir}")