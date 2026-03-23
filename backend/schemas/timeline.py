import uuid
from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field


# ========== 时间线数据结构（与前端约定） ==========

class TimelineResolution(BaseModel):
    """时间线分辨率"""
    width: int = Field(..., description="宽度（像素）")
    height: int = Field(..., description="高度（像素）")


class ClipFilter(BaseModel):
    """Clip 滤镜"""
    type: str = Field(..., description="滤镜类型")
    params: dict = Field(default_factory=dict, description="滤镜参数")


class Clip(BaseModel):
    """时间线 Clip"""
    id: uuid.UUID = Field(..., description="Clip ID")
    asset_id: uuid.UUID = Field(..., description="素材 ID")
    timeline_start_ms: int = Field(..., description="在时间线上的起始位置（毫秒）")
    source_start_ms: int = Field(..., description="原视频的裁剪入点（毫秒）")
    source_end_ms: int = Field(..., description="原视频的裁剪出点（毫秒）")
    duration_ms: int = Field(..., description="时长（毫秒） = source_end_ms - source_start_ms")
    speed: float = Field(1.0, description="播放速度倍率")
    volume: float = Field(1.0, description="音量倍率（0-2）")
    filters: List[ClipFilter] = Field(default_factory=list, description="滤镜列表")


class Track(BaseModel):
    """时间线轨道"""
    id: uuid.UUID = Field(..., description="轨道 ID")
    type: Literal['video', 'audio', 'subtitle'] = Field(..., description="轨道类型")
    name: str = Field(..., description="轨道名称")
    index: int = Field(..., description="轨道顺序，视频轨 index 越大渲染层级越高")
    is_muted: bool = Field(False, description="是否静音")
    is_locked: bool = Field(False, description="是否锁定")
    height_px: int = Field(64, description="轨道高度（像素）")
    clips: List[Clip] = Field(default_factory=list, description="轨道中的 Clip 列表")


class Timeline(BaseModel):
    """时间线完整数据"""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID = Field(..., description="时间线 ID")
    fps: float = Field(30.0, description="项目帧率")
    resolution: TimelineResolution = Field(..., description="时间线分辨率")
    duration_ms: int = Field(..., description="整个时间线总时长（毫秒）")
    tracks: List[Track] = Field(default_factory=list, description="轨道列表")


# ========== API 请求/响应 Schema ==========

class TimelineSaveRequest(BaseModel):
    """保存时间线请求"""
    timeline_data: Timeline = Field(..., description="时间线数据")
    client_version: int = Field(..., description="客户端持有的版本号")


class TimelineResponse(BaseModel):
    """时间线 API 响应"""
    timeline_data: Timeline = Field(..., description="时间线数据")
    version: int = Field(..., description="服务器端版本号")