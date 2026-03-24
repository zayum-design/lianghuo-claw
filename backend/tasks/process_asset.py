import json
import os
import tempfile
import uuid
from pathlib import Path
from typing import Optional
import subprocess
import struct
import redis

import ffmpeg
from celery import shared_task
from sqlalchemy import select, update, create_engine, func
from sqlalchemy.orm import sessionmaker

from core.celery_app import celery_app
from core.database import SessionLocal
from core.config import get_settings
from core.logging import get_logger
from models.asset import Asset
from services.storage import get_storage_service

logger = get_logger("tasks.process_asset")
storage_service = get_storage_service()
settings = get_settings()


def update_asset_status(asset_id: uuid.UUID, status: str, error_message: str = None, **fields):
    """更新素材状态和字段（同步数据库操作）"""
    # 创建同步数据库会话（Celery任务中不能使用async）
    engine = create_engine(str(settings.DATABASE_URL).replace("asyncpg", "psycopg2"))
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        # 构建更新字典
        update_data = {"status": status, "updated_at": func.now()}
        if error_message:
            update_data["error_message"] = error_message
        update_data.update(fields)

        # 执行更新
        stmt = (
            update(Asset)
            .where(Asset.id == asset_id)
            .values(**update_data)
        )
        session.execute(stmt)
        session.commit()
        logger.info(f"Asset {asset_id} status updated to {status}")
    except Exception as e:
        logger.error(f"Failed to update asset {asset_id} status: {e}")
        session.rollback()
        raise
    finally:
        session.close()


def publish_ws_message(user_id: uuid.UUID, message: dict):
    """通过Redis Pub/Sub发布WebSocket消息"""
    try:
        redis_client = redis.from_url(str(settings.REDIS_URL))
        channel = f"ws:user:{user_id}"
        redis_client.publish(channel, json.dumps(message))
        logger.info(f"Published WebSocket message to {channel}: {message.get('type')}")
    except Exception as e:
        logger.error(f"Failed to publish WebSocket message: {e}")


def download_file_from_minio(storage_key: str, local_path: Path) -> bool:
    """从MinIO下载文件到本地"""
    try:
        # 使用StorageService同步下载
        # 注意：StorageService是同步的boto3客户端
        with open(local_path, "wb") as f:
            response = storage_service.s3_client.get_object(
                Bucket=storage_service.BUCKETS["assets"],
                Key=storage_key,
            )
            for chunk in response["Body"].iter_chunks(chunk_size=8192):
                f.write(chunk)
        return True
    except Exception as e:
        logger.error(f"Failed to download file from MinIO: {e}")
        return False


def extract_metadata(video_path: Path) -> dict:
    """使用FFprobe提取视频元数据"""
    try:
        probe = ffmpeg.probe(str(video_path))
        metadata = {
            "duration_ms": 0,
            "width": 0,
            "height": 0,
            "fps": 0,
            "format": "",
            "codec_video": "",
            "codec_audio": "",
        }

        # 获取格式信息
        format_info = probe.get("format", {})
        if format_info:
            metadata["format"] = format_info.get("format_name", "")
            duration = float(format_info.get("duration", 0))
            metadata["duration_ms"] = int(duration * 1000)

        # 获取视频流信息
        video_stream = next((s for s in probe.get("streams", []) if s.get("codec_type") == "video"), None)
        if video_stream:
            metadata["width"] = int(video_stream.get("width", 0))
            metadata["height"] = int(video_stream.get("height", 0))
            metadata["codec_video"] = video_stream.get("codec_name", "")

            # 计算帧率
            fps_str = video_stream.get("avg_frame_rate", "0/1")
            if "/" in fps_str:
                num, den = fps_str.split("/")
                if den and float(den) != 0:
                    metadata["fps"] = float(num) / float(den)

        # 获取音频流信息
        audio_stream = next((s for s in probe.get("streams", []) if s.get("codec_type") == "audio"), None)
        if audio_stream:
            metadata["codec_audio"] = audio_stream.get("codec_name", "")

        return metadata
    except Exception as e:
        logger.error(f"Failed to extract metadata: {e}")
        return {}


def generate_thumbnail(video_path: Path, output_path: Path, asset_id: uuid.UUID) -> bool:
    """生成封面缩略图（640x360）"""
    try:
        # 获取视频时长
        probe = ffmpeg.probe(str(video_path))
        duration = float(probe["format"]["duration"])

        # 选择截图时间点（第1秒或50%时长）
        seek_time = min(1.0, duration * 0.5) if duration > 0 else 0

        (
            ffmpeg
            .input(str(video_path), ss=seek_time)
            .filter("scale", 640, 360, force_original_aspect_ratio="decrease")
            .filter("pad", 640, 360, "(ow-iw)/2", "(oh-ih)/2")
            .output(str(output_path), vframes=1, loglevel="error")
            .run(overwrite_output=True, capture_stdout=True, capture_stderr=True)
        )

        # 上传到MinIO
        thumbnail_key = f"{asset_id}/cover.jpg"
        with open(output_path, "rb") as f:
            storage_service.upload_bytes(
                bucket=storage_service.BUCKETS["thumbnails"],
                key=thumbnail_key,
                data=f.read(),
                content_type="image/jpeg"
            )

        return thumbnail_key
    except Exception as e:
        logger.error(f"Failed to generate thumbnail: {e}")
        return None


def generate_frame_sequence(video_path: Path, temp_dir: Path, asset_id: uuid.UUID) -> Optional[str]:
    """生成时间线帧序列（每秒1帧，160x90）"""
    try:
        # 创建帧序列输出目录
        frames_dir = temp_dir / "frames"
        frames_dir.mkdir(exist_ok=True)

        # 使用FFmpeg提取帧序列（每秒1帧）
        output_pattern = frames_dir / "frame_%04d.jpg"
        (
            ffmpeg
            .input(str(video_path))
            .filter("fps", fps=1)
            .filter("scale", 160, 90, force_original_aspect_ratio="decrease")
            .filter("pad", 160, 90, "(ow-iw)/2", "(oh-ih)/2")
            .output(str(output_pattern), loglevel="error")
            .run(overwrite_output=True, capture_stdout=True, capture_stderr=True)
        )

        # 上传所有帧文件到MinIO
        frame_files = sorted(frames_dir.glob("frame_*.jpg"))
        if not frame_files:
            logger.warning(f"No frame files generated for asset {asset_id}")
            return None

        for i, frame_file in enumerate(frame_files, start=1):
            frame_key = f"{asset_id}/frames/frame_{i:04d}.jpg"
            with open(frame_file, "rb") as f:
                storage_service.upload_bytes(
                    bucket=storage_service.BUCKETS["thumbnails"],
                    key=frame_key,
                    data=f.read(),
                    content_type="image/jpeg"
                )

        # 返回帧序列前缀（用于数据库存储）
        return f"{asset_id}/frames/"

    except Exception as e:
        logger.error(f"Failed to generate frame sequence: {e}")
        return None


def generate_waveform(video_path: Path, asset_id: uuid.UUID) -> Optional[str]:
    """生成音频波形数据（峰值数组）"""
    try:
        # 使用FFmpeg提取音频为PCM RAW格式
        pcm_path = video_path.parent / "audio.pcm"
        (
            ffmpeg
            .input(str(video_path))
            .output(str(pcm_path),
                   ac=1, ar=8000, f='s16le', acodec='pcm_s16le',
                   loglevel="error")
            .run(overwrite_output=True, capture_stdout=True, capture_stderr=True)
        )

        # 读取PCM数据（16位有符号整数，小端序）
        with open(pcm_path, "rb") as f:
            pcm_data = f.read()

        # 将字节数据解析为int16数组
        # 每2个字节为一个采样点
        sample_count = len(pcm_data) // 2
        samples = []
        for i in range(0, len(pcm_data), 2):
            sample = struct.unpack('<h', pcm_data[i:i+2])[0]  # 有符号16位整数
            samples.append(sample)

        # 每80个采样取绝对值最大值作为一个峰值点
        window_size = 80
        peaks = []
        for i in range(0, len(samples), window_size):
            window = samples[i:i+window_size]
            if window:
                peak = max(abs(s) for s in window)
                peaks.append(peak)

        # 将峰值数组保存为JSON
        waveform_json = json.dumps(peaks)
        waveform_key = f"{asset_id}/waveform.json"

        # 上传到MinIO
        storage_service.upload_bytes(
            bucket=storage_service.BUCKETS["thumbnails"],
            key=waveform_key,
            data=waveform_json.encode('utf-8'),
            content_type="application/json"
        )

        return waveform_key

    except Exception as e:
        logger.error(f"Failed to generate waveform: {e}")
        return None


@shared_task(bind=True, name="process_asset_task", queue="media")
def process_asset_task(self, asset_id: str) -> None:
    """
    Celery 异步处理素材任务
    """
    logger.info(f"Starting asset processing: {asset_id}")
    asset_uuid = uuid.UUID(asset_id)

    # 临时目录
    temp_dir = Path(tempfile.mkdtemp(prefix=f"asset_{asset_id}_"))
    local_file_path = None
    user_id = None

    try:
        # 1. 获取素材信息
        engine = create_engine(str(settings.DATABASE_URL).replace("asyncpg", "psycopg2"))
        Session = sessionmaker(bind=engine)
        session = Session()

        asset = session.query(Asset).filter(Asset.id == asset_uuid).first()
        if not asset:
            logger.error(f"Asset {asset_id} not found")
            return

        user_id = asset.user_id
        storage_key = asset.storage_key

        # 2. 下载文件
        local_file_path = temp_dir / "original"
        if not download_file_from_minio(storage_key, local_file_path):
            raise Exception("Failed to download file from MinIO")

        # 3. 提取元数据
        metadata = extract_metadata(local_file_path)
        if not metadata:
            raise Exception("Failed to extract metadata")

        # 4. 生成缩略图（如果有视频流）
        thumbnail_key = None
        if metadata.get("width", 0) > 0:  # 有视频流
            thumbnail_path = temp_dir / "thumbnail.jpg"
            thumbnail_key = generate_thumbnail(local_file_path, thumbnail_path, asset_uuid)

        # 5. 生成帧序列（如果有视频流）
        preview_frames_prefix = None
        if metadata.get("width", 0) > 0:  # 有视频流
            preview_frames_prefix = generate_frame_sequence(local_file_path, temp_dir, asset_uuid)

        # 6. 生成波形数据（如果有音频流）
        waveform_key = None
        if metadata.get("codec_audio"):  # 有音频流
            waveform_key = generate_waveform(local_file_path, asset_uuid)

        # 7. 更新数据库
        update_fields = {
            "duration_ms": metadata["duration_ms"],
            "width": metadata["width"],
            "height": metadata["height"],
            "fps": metadata["fps"],
            "format": metadata["format"],
            "codec_video": metadata["codec_video"],
            "codec_audio": metadata["codec_audio"],
            "thumbnail_key": thumbnail_key,
            "preview_frames_prefix": preview_frames_prefix,
            "waveform_key": waveform_key,
            "status": "ready",
        }
        update_asset_status(asset_uuid, "ready", **update_fields)

        # 6. 发布WebSocket通知
        if user_id:
            message = {
                "type": "asset_ready",
                "asset_id": asset_id,
                "thumbnail_url": f"/thumbnails/{asset_id}/cover.jpg" if thumbnail_key else None,
            }
            publish_ws_message(user_id, message)

        logger.info(f"Asset {asset_id} processing completed successfully")

    except Exception as e:
        logger.error(f"Asset processing failed: {e}", exc_info=True)

        # 更新错误状态
        update_asset_status(asset_uuid, "error", str(e))

        # 发布错误通知
        if user_id:
            message = {
                "type": "asset_error",
                "asset_id": asset_id,
                "error": str(e)[:200],  # 截断长错误消息
            }
            publish_ws_message(user_id, message)

        # 不重新抛出异常，避免Celery重试
    finally:
        # 清理临时目录
        import shutil
        if temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)

        # 清理完成