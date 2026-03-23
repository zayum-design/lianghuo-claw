import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


# ========== Request Schemas ==========

class ExportCreateRequest(BaseModel):
    """创建导出任务请求"""
    resolution_width: Optional[int] = Field(None, description="输出视频宽度（像素）")
    resolution_height: Optional[int] = Field(None, description="输出视频高度（像素）")
    fps: Optional[float] = Field(None, description="输出视频帧率")
    video_bitrate_kbps: int = Field(4000, description="视频码率（kbps）")
    format: str = Field("mp4", description="输出格式")
    burn_subtitles: bool = Field(False, description="是否烧录字幕（第二阶段使用）")

    @field_validator("video_bitrate_kbps")
    @classmethod
    def validate_bitrate(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("Bitrate must be positive")
        return v

    @field_validator("format")
    @classmethod
    def validate_format(cls, v: str) -> str:
        allowed_formats = ["mp4", "mov", "avi"]
        if v.lower() not in allowed_formats:
            raise ValueError(f"Format must be one of {allowed_formats}")
        return v.lower()


# ========== Response Schemas ==========

class ExportTaskResponse(BaseModel):
    """导出任务响应（单个）"""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID
    status: str
    progress: int
    format: str
    resolution_width: Optional[int] = None
    resolution_height: Optional[int] = None
    fps: Optional[float] = None
    video_bitrate_kbps: int
    output_key: Optional[str] = None
    download_url: Optional[str] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime


class ExportCreateResponse(BaseModel):
    """创建导出任务响应"""
    export_id: uuid.UUID = Field(..., description="导出任务ID")
    status: str = Field(..., description="任务状态")


class ExportListResponse(BaseModel):
    """导出任务列表响应"""
    data: List[ExportTaskResponse]
    total: int
    page: int
    page_size: int