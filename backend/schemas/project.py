import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


# ========== Request Schemas ==========

class ProjectCreateRequest(BaseModel):
    """创建项目请求"""
    name: str = Field(..., description="项目名称", max_length=50)
    resolution_width: int = Field(1920, description="分辨率宽度")
    resolution_height: int = Field(1080, description="分辨率高度")
    fps: float = Field(30.0, description="帧率")

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Project name cannot be empty")
        return v


class ProjectUpdateRequest(BaseModel):
    """更新项目请求"""
    name: Optional[str] = Field(None, description="项目名称", max_length=50)
    description: Optional[str] = Field(None, description="项目描述")


class ProjectDuplicateRequest(BaseModel):
    """复制项目请求（暂无字段，保留结构）"""
    pass


# ========== Response Schemas ==========

class ProjectListItem(BaseModel):
    """项目列表项（简略信息）"""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    description: Optional[str]
    cover_image_url: Optional[str]
    duration_ms: int
    resolution_width: int
    resolution_height: int
    fps: float
    status: str
    created_at: datetime
    updated_at: datetime
    asset_count: int = Field(0, description="关联素材数量")


class ProjectDetailResponse(BaseModel):
    """项目详情响应"""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    description: Optional[str]
    cover_image_url: Optional[str]
    duration_ms: int
    resolution_width: int
    resolution_height: int
    fps: float
    status: str
    created_at: datetime
    updated_at: datetime
    timeline_version: int = Field(..., description="关联时间线版本号")


class ProjectListResponse(BaseModel):
    """项目列表响应（分页）"""
    data: List[ProjectListItem]
    total: int
    page: int
    page_size: int


class ProjectCreateResponse(BaseModel):
    """创建项目响应"""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    description: Optional[str]
    cover_image_url: Optional[str]
    duration_ms: int
    resolution_width: int
    resolution_height: int
    fps: float
    status: str
    created_at: datetime
    updated_at: datetime