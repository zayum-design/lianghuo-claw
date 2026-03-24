import uuid
from typing import Optional
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_user, CurrentUser
from core.database import get_db
from models.timeline import ProjectTimeline
from models.project import Project
from schemas.timeline import (
    Timeline,
    TimelineResolution,
    Track,
    Clip,
    ClipFilter,
    TimelineSaveRequest,
    TimelineResponse,
)

router = APIRouter(tags=["timelines"])

# Mock 常量（与 MEMORY.md 一致）
MOCK_PROJECT_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")
MOCK_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


def create_initial_timeline() -> Timeline:
    """创建初始空时间线数据（一条空视频轨）"""
    timeline_id = uuid.uuid4()
    track_id = uuid.uuid4()
    return Timeline(
        id=timeline_id,
        fps=30.0,
        resolution=TimelineResolution(width=1920, height=1080),
        duration_ms=0,
        tracks=[
            Track(
                id=track_id,
                type="video",
                name="视频轨 1",
                index=0,
                is_muted=False,
                is_locked=False,
                height_px=64,
                clips=[],
            )
        ],
    )


@router.get("/timelines/default")
async def get_default_timeline() -> RedirectResponse:
    """
    重定向到默认项目的时间线（向后兼容）
    """
    return RedirectResponse(
        url=f"/api/v1/projects/{MOCK_PROJECT_ID}/timeline",
        status_code=status.HTTP_301_MOVED_PERMANENTLY,
    )


@router.put("/timelines/default")
async def save_default_timeline() -> RedirectResponse:
    """
    重定向到默认项目的时间线保存接口（向后兼容）
    """
    return RedirectResponse(
        url=f"/api/v1/projects/{MOCK_PROJECT_ID}/timeline",
        status_code=status.HTTP_301_MOVED_PERMANENTLY,
    )


@router.get("/projects/{project_id}/timeline", response_model=TimelineResponse)
async def get_project_timeline(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> TimelineResponse:
    """
    获取指定项目的时间线

    如果不存在则创建一条空时间线（含一条空视频轨）。
    """
    # 验证项目归属
    project_stmt = select(Project).where(
        Project.id == project_id,
        Project.user_id == current_user.id
    )
    project_result = await db.execute(project_stmt)
    project = project_result.scalar_one_or_none()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )

    # 查询现有时间线
    result = await db.execute(
        select(ProjectTimeline).where(ProjectTimeline.project_id == project_id)
    )
    timeline_record = result.scalar_one_or_none()

    if timeline_record is None:
        # 创建初始时间线记录
        initial_timeline = create_initial_timeline()
        timeline_record = ProjectTimeline(
            project_id=project_id,
            timeline_data=initial_timeline.model_dump(),
            version=1,
        )
        db.add(timeline_record)
        try:
            await db.commit()
            await db.refresh(timeline_record)
        except IntegrityError:
            # 并发插入冲突，其他请求已经创建了时间线
            await db.rollback()
            # 重新查询
            result = await db.execute(
                select(ProjectTimeline).where(ProjectTimeline.project_id == project_id)
            )
            timeline_record = result.scalar_one_or_none()
            # 此时 timeline_record 应该存在
            if timeline_record is None:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="时间线创建失败，请重试",
                )
            timeline_data = Timeline(**timeline_record.timeline_data)
            version = timeline_record.version
        else:
            timeline_data = initial_timeline
            version = 1
    else:
        # 从 JSONB 加载时间线数据
        timeline_data = Timeline(**timeline_record.timeline_data)
        version = timeline_record.version

    return TimelineResponse(timeline_data=timeline_data, version=version)


@router.put("/projects/{project_id}/timeline", response_model=TimelineResponse)
async def save_project_timeline(
    project_id: uuid.UUID,
    request: TimelineSaveRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> TimelineResponse:
    """
    保存指定项目的时间线（乐观锁版本控制）
    """
    # 验证项目归属
    project_stmt = select(Project).where(
        Project.id == project_id,
        Project.user_id == current_user.id
    )
    project_result = await db.execute(project_stmt)
    project = project_result.scalar_one_or_none()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )

    # 查询现有时间线
    result = await db.execute(
        select(ProjectTimeline).where(ProjectTimeline.project_id == project_id)
    )
    timeline_record = result.scalar_one_or_none()

    if timeline_record is None:
        # 理论上 GET 接口会创建，但以防万一
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="时间线不存在，请先调用 GET 接口",
        )

    # 乐观锁校验
    if timeline_record.version != request.client_version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "VERSION_CONFLICT",
                "message": "时间线已被其他操作修改，请刷新后重试",
                "server_version": timeline_record.version,
            },
        )

    # 更新数据
    timeline_record.timeline_data = request.timeline_data.model_dump()
    timeline_record.version += 1
    await db.commit()
    await db.refresh(timeline_record)

    # 返回更新后的时间线
    timeline_data = Timeline(**timeline_record.timeline_data)
    return TimelineResponse(timeline_data=timeline_data, version=timeline_record.version)


