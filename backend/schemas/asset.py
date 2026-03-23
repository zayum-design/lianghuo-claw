import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator

from core.config import get_settings

settings = get_settings()


# ========== Request Schemas ==========

class AssetPresignRequest(BaseModel):
    """上传预签名请求"""
    name: str = Field(..., description="原始文件名")
    file_size_bytes: int = Field(..., description="文件大小（字节）")
    project_id: Optional[uuid.UUID] = Field(None, description="所属项目ID")

    @field_validator("file_size_bytes")
    @classmethod
    def validate_file_size(cls, v: int) -> int:
        """校验文件大小不超过 10GB"""
        max_size = 10 * 1024 * 1024 * 1024  # 10GB
        if v > max_size:
            raise ValueError(f"File size cannot exceed {max_size} bytes")
        if v <= 0:
            raise ValueError("File size must be positive")
        return v


# ========== Response Schemas ==========

class AssetPresignResponse(BaseModel):
    """预签名上传响应"""
    asset_id: uuid.UUID = Field(..., description="素材ID")
    upload_url: str = Field(..., description="MinIO 预签名 PUT URL")
    upload_method: str = Field("PUT", description="上传方法")
    expires_in: int = Field(..., description="过期时间（秒）")


class AssetListItem(BaseModel):
    """素材列表项（简略信息）"""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    status: str
    duration_ms: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    format: Optional[str] = None
    thumbnail_url: Optional[str] = None
    created_at: datetime


class AssetListResponse(BaseModel):
    """分页列表响应"""
    data: List[AssetListItem]
    total: int
    page: int
    page_size: int


class AssetResponse(BaseModel):
    """完整素材信息"""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    project_id: Optional[uuid.UUID] = None
    name: str
    file_size_bytes: int
    duration_ms: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    fps: Optional[float] = None
    format: Optional[str] = None
    codec_video: Optional[str] = None
    codec_audio: Optional[str] = None
    status: str
    storage_key: str
    thumbnail_key: Optional[str] = None
    preview_frames_prefix: Optional[str] = None
    waveform_key: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    # 动态生成的 URL
    thumbnail_url: Optional[str] = None
    stream_url: Optional[str] = None