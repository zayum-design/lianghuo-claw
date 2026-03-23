import uuid
from typing import List, Optional
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    status,
)
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as redis

from core.config import get_settings
from core.dependencies import get_current_user, CurrentUser
from core.database import get_db
from models.asset import Asset
from schemas.asset import (
    AssetPresignRequest,
    AssetPresignResponse,
    AssetListItem,
    AssetListResponse,
    AssetResponse,
)
from services.storage import get_storage_service, StorageService
from core.logging import get_logger
from tasks.process_asset import process_asset_task

router = APIRouter(tags=["assets"])
logger = get_logger("assets")
settings = get_settings()

# Redis 客户端（用于缓存）
_redis_client: Optional[redis.Redis] = None


async def get_redis_client() -> redis.Redis:
    """获取 Redis 客户端单例"""
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(str(settings.REDIS_URL))
    return _redis_client


# ========== Helper Functions ==========

def get_file_extension(filename: str) -> str:
    """提取文件扩展名（小写，不带点）"""
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def is_allowed_file_format(filename: str) -> bool:
    """检查文件格式是否在允许的白名单中"""
    allowed_extensions = {
        "mp4", "mov", "avi", "mkv", "webm",  # 视频
        "mp3", "wav", "aac", "m4a",  # 音频
    }
    ext = get_file_extension(filename)
    return ext in allowed_extensions


def generate_storage_key(user_id: uuid.UUID, asset_id: uuid.UUID, filename: str) -> str:
    """生成 MinIO 存储路径"""
    ext = get_file_extension(filename)
    return f"assets/{user_id}/{asset_id}/original.{ext}"


def generate_thumbnail_url(asset_id: uuid.UUID) -> str:
    """生成缩略图 URL（从缓存或新生成）"""
    # 实际实现需要调用 StorageService，这里返回占位符
    return f"/thumbnails/{asset_id}/cover.jpg"


# ========== API Endpoints ==========

@router.post("/assets/presign", response_model=AssetPresignResponse)
async def create_presigned_url(
    request: AssetPresignRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    storage_service: StorageService = Depends(get_storage_service),
) -> AssetPresignResponse:
    """
    生成预签名上传 URL

    校验文件格式和大小，创建 Asset 记录，返回预签名 URL。
    """
    # 校验文件格式
    if not is_allowed_file_format(request.name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的文件格式。支持格式: mp4, mov, avi, mkv, webm, mp3, wav, aac, m4a",
        )

    # 校验文件大小（上限 10GB）
    MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 * 1024  # 10GB
    if request.file_size_bytes > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"文件大小超过限制（最大 10GB）",
        )

    # 创建 Asset 记录
    user_id = uuid.UUID(current_user["id"])
    asset_id = uuid.uuid4()
    storage_key = generate_storage_key(user_id, asset_id, request.name)

    asset = Asset(
        id=asset_id,
        user_id=user_id,
        project_id=request.project_id,
        name=request.name,
        file_size_bytes=request.file_size_bytes,
        status="uploading",
        storage_key=storage_key,
    )

    db.add(asset)
    await db.commit()
    await db.refresh(asset)

    # 生成预签名 URL
    upload_url = storage_service.generate_presigned_upload_url(
        bucket=storage_service.BUCKETS["assets"],
        key=storage_key,
        expires_seconds=3600,
    )

    return AssetPresignResponse(
        asset_id=asset_id,
        upload_url=upload_url,
        expires_in=3600,
    )


@router.post("/assets/{asset_id}/confirm")
async def confirm_upload(
    asset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    storage_service: StorageService = Depends(get_storage_service),
) -> dict:
    """
    确认上传完成，触发异步处理任务
    """
    user_id = uuid.UUID(current_user["id"])

    # 查询 Asset
    result = await db.execute(
        select(Asset).where(Asset.id == asset_id, Asset.user_id == user_id)
    )
    asset = result.scalar_one_or_none()

    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="素材不存在",
        )

    # 校验状态
    if asset.status != "uploading":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"素材状态为 {asset.status}，无法确认上传",
        )

    # 验证文件已上传到 MinIO
    if not storage_service.object_exists(storage_service.BUCKETS["assets"], asset.storage_key):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="文件尚未上传成功，请先完成上传",
        )

    # 更新状态为 processing
    asset.status = "processing"
    await db.commit()

    # 触发 Celery 异步处理任务
    process_asset_task.apply_async(args=[str(asset_id)], queue='media')
    logger.info(f"Asset {asset_id} confirmed, processing task queued")

    return {
        "asset_id": asset_id,
        "status": "processing",
        "message": "素材已确认，开始处理",
    }


@router.get("/assets", response_model=AssetListResponse)
async def list_assets(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    project_id: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    storage_service: StorageService = Depends(get_storage_service),
) -> AssetListResponse:
    """
    分页查询当前用户的素材列表
    """
    user_id = uuid.UUID(current_user["id"])
    offset = (page - 1) * page_size

    # 构建查询
    query = select(Asset).where(Asset.user_id == user_id)

    if status_filter:
        query = query.where(Asset.status == status_filter)
    if project_id:
        query = query.where(Asset.project_id == project_id)

    # 总数
    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar_one()

    # 分页数据
    query = query.order_by(desc(Asset.created_at)).offset(offset).limit(page_size)
    result = await db.execute(query)
    assets = result.scalars().all()

    # 转换为列表项
    items = []
    for asset in assets:
        thumbnail_url = None
        if asset.status == "ready" and asset.thumbnail_key:
            # 从缓存获取或生成缩略图 URL
            redis_client = await get_redis_client()
            cache_key = f"asset:thumbnail:{asset.id}"
            cached_url = await redis_client.get(cache_key)
            if cached_url:
                thumbnail_url = cached_url.decode()
            else:
                thumbnail_url = storage_service.generate_presigned_download_url(
                    bucket=storage_service.BUCKETS["thumbnails"],
                    key=asset.thumbnail_key,
                    expires_seconds=14400,  # 4 小时
                )
                await redis_client.setex(cache_key, 14400, thumbnail_url)

        items.append(
            AssetListItem(
                id=asset.id,
                name=asset.name,
                status=asset.status,
                duration_ms=asset.duration_ms,
                width=asset.width,
                height=asset.height,
                format=asset.format,
                thumbnail_url=thumbnail_url,
                created_at=asset.created_at,
            )
        )

    return AssetListResponse(
        data=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/assets/{asset_id}", response_model=AssetResponse)
async def get_asset(
    asset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    storage_service: StorageService = Depends(get_storage_service),
) -> AssetResponse:
    """
    获取素材详情
    """
    user_id = uuid.UUID(current_user["id"])

    result = await db.execute(
        select(Asset).where(Asset.id == asset_id, Asset.user_id == user_id)
    )
    asset = result.scalar_one_or_none()

    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="素材不存在",
        )

    # 动态生成 URL
    thumbnail_url = None
    stream_url = None

    if asset.status == "ready":
        if asset.thumbnail_key:
            thumbnail_url = storage_service.generate_presigned_download_url(
                bucket=storage_service.BUCKETS["thumbnails"],
                key=asset.thumbnail_key,
                expires_seconds=3600,
            )

        # 生成流媒体 URL（1 小时有效期）
        stream_url = storage_service.generate_presigned_download_url(
            bucket=storage_service.BUCKETS["assets"],
            key=asset.storage_key,
            expires_seconds=3600,
        )

    # 转换为响应模型
    return AssetResponse(
        **{k: getattr(asset, k) for k in AssetResponse.model_fields.keys() if hasattr(asset, k)},
        thumbnail_url=thumbnail_url,
        stream_url=stream_url,
    )


@router.delete("/assets/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset(
    asset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    storage_service: StorageService = Depends(get_storage_service),
):
    """
    删除素材及其相关文件
    """
    user_id = uuid.UUID(current_user["id"])

    result = await db.execute(
        select(Asset).where(Asset.id == asset_id, Asset.user_id == user_id)
    )
    asset = result.scalar_one_or_none()

    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="素材不存在",
        )

    # 删除 MinIO 文件
    try:
        # 删除原始文件
        storage_service.delete_object(storage_service.BUCKETS["assets"], asset.storage_key)

        # 删除缩略图相关文件（按前缀批量删除）
        if asset.thumbnail_key:
            prefix = f"{asset.id}/"
            storage_service.delete_objects_by_prefix(storage_service.BUCKETS["thumbnails"], prefix)
    except Exception as e:
        logger.error(f"Failed to delete storage objects for asset {asset_id}: {e}")
        # 继续删除数据库记录

    # 清除 Redis 缓存
    try:
        redis_client = await get_redis_client()
        await redis_client.delete(f"asset:thumbnail:{asset_id}")
    except Exception as e:
        logger.error(f"Failed to clear Redis cache for asset {asset_id}: {e}")

    # 删除数据库记录
    await db.delete(asset)
    await db.commit()


@router.get("/assets/{asset_id}/stream-url")
async def get_stream_url(
    asset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    storage_service: StorageService = Depends(get_storage_service),
) -> dict:
    """
    生成视频流预签名 URL
    """
    user_id = uuid.UUID(current_user["id"])

    result = await db.execute(
        select(Asset).where(Asset.id == asset_id, Asset.user_id == user_id)
    )
    asset = result.scalar_one_or_none()

    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="素材不存在",
        )

    if asset.status != "ready":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="素材尚未处理完成",
        )

    stream_url = storage_service.generate_presigned_download_url(
        bucket=storage_service.BUCKETS["assets"],
        key=asset.storage_key,
        expires_seconds=3600,
    )

    return {"stream_url": stream_url}


# 需要导入 func
from sqlalchemy import func