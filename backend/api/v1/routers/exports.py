import uuid
from typing import List, Optional
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    status,
)
from sqlalchemy import desc, select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import get_settings
from core.dependencies import get_current_user, CurrentUser
from core.database import get_db
from models.export_task import ExportTask
from models.timeline import ProjectTimeline
from schemas.export import (
    ExportCreateRequest,
    ExportCreateResponse,
    ExportTaskResponse,
    ExportListResponse,
)
from schemas.timeline import Timeline
from core.logging import get_logger
from tasks.export_project import export_project_task

router = APIRouter(tags=["exports"])
logger = get_logger("exports")
settings = get_settings()

# Mock project ID (from MEMORY.md)
MOCK_PROJECT_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")


# ========== Helper Functions ==========

def check_timeline_empty(timeline_data: Timeline) -> bool:
    """
    检查时间线是否为空（无 Clip 或 duration_ms == 0）
    """
    if timeline_data.duration_ms == 0:
        return True

    # 检查所有轨道是否有 Clip
    for track in timeline_data.tracks:
        if track.clips:
            return False
    return True


# ========== API Endpoints ==========

@router.post("/exports", response_model=ExportCreateResponse)
async def create_export_task(
    request: ExportCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ExportCreateResponse:
    """
    创建导出任务
    """
    user_id = uuid.UUID(current_user["id"])

    # 使用 Mock 项目 ID（第一阶段只有一个项目）
    mock_project_id = MOCK_PROJECT_ID

    # 查询时间线数据
    result = await db.execute(
        select(ProjectTimeline).where(ProjectTimeline.project_id == mock_project_id)
    )
    timeline_record = result.scalar_one_or_none()

    if not timeline_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="项目时间线不存在",
        )

    # 解析时间线 JSON 数据
    try:
        timeline_data = Timeline.model_validate(timeline_record.timeline_data)
    except Exception as e:
        logger.error(f"Failed to parse timeline data: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="时间线数据格式错误",
        )

    # 检查时间线是否为空
    if check_timeline_empty(timeline_data):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="时间线为空，无法导出",
        )

    # 检查并发导出限制：同一用户同一时间最多一个 running 任务
    result = await db.execute(
        select(ExportTask).where(
            and_(
                ExportTask.user_id == user_id,
                ExportTask.status == "running",
            )
        )
    )
    running_task = result.scalar_one_or_none()

    if running_task:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="已有导出任务正在进行，请等待完成后再次导出",
        )

    # 创建导出任务记录
    export_id = uuid.uuid4()
    export_task = ExportTask(
        id=export_id,
        project_id=mock_project_id,
        user_id=user_id,
        status="queued",
        progress=0,
        format=request.format,
        resolution_width=request.resolution_width,
        resolution_height=request.resolution_height,
        fps=request.fps,
        video_bitrate_kbps=request.video_bitrate_kbps,
    )

    db.add(export_task)
    await db.commit()
    await db.refresh(export_task)

    # 提交 Celery 任务
    export_project_task.apply_async(args=[str(export_id)], queue='export')
    logger.info(f"Export task {export_id} created and queued")

    return ExportCreateResponse(
        export_id=export_id,
        status="queued",
    )


@router.get("/exports/{export_id}", response_model=ExportTaskResponse)
async def get_export_task(
    export_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ExportTaskResponse:
    """
    获取导出任务状态
    """
    user_id = uuid.UUID(current_user["id"])

    result = await db.execute(
        select(ExportTask).where(
            and_(
                ExportTask.id == export_id,
                ExportTask.user_id == user_id,
            )
        )
    )
    export_task = result.scalar_one_or_none()

    if not export_task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="导出任务不存在",
        )

    return ExportTaskResponse.model_validate(export_task)


@router.get("/exports", response_model=ExportListResponse)
async def list_export_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ExportListResponse:
    """
    分页查询当前用户的导出任务列表（最近 10 条）
    """
    user_id = uuid.UUID(current_user["id"])

    # 任务要求返回最近 10 条记录，但支持分页参数
    limit = min(page_size, 10)  # 最多 10 条
    offset = (page - 1) * limit

    # 构建查询
    query = select(ExportTask).where(
        ExportTask.user_id == user_id
    ).order_by(desc(ExportTask.created_at))

    # 总数
    count_query = select(func.count()).select_from(query.subquery())
    count_result = await db.execute(count_query)
    total = count_result.scalar_one()

    # 分页数据
    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    export_tasks = result.scalars().all()

    # 转换为响应模型
    items = []
    for task in export_tasks:
        items.append(ExportTaskResponse.model_validate(task))

    return ExportListResponse(
        data=items,
        total=total,
        page=page,
        page_size=limit,
    )


# 需要导入 func
from sqlalchemy import func