import uuid
from typing import List, Optional
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    status,
)
from sqlalchemy import desc, func, select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_user, CurrentUser
from core.database import get_db
from models.project import Project
from models.timeline import ProjectTimeline
from models.asset import Asset
from models.export_task import ExportTask
from schemas.project import (
    ProjectCreateRequest,
    ProjectCreateResponse,
    ProjectUpdateRequest,
    ProjectDetailResponse,
    ProjectListItem,
    ProjectListResponse,
    ProjectDuplicateRequest,
)
from services.storage import get_storage_service, StorageService
from core.logging import get_logger

router = APIRouter(tags=["projects"])
logger = get_logger("projects")


# ========== Helper Functions ==========

async def get_project_by_id(
    db: AsyncSession,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Optional[Project]:
    """根据ID和用户ID获取项目，如果不存在或无权访问则返回None"""
    stmt = select(Project).where(
        Project.id == project_id,
        Project.user_id == user_id,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_project_timeline(
    db: AsyncSession,
    project_id: uuid.UUID,
) -> Optional[ProjectTimeline]:
    """获取项目关联的时间线"""
    stmt = select(ProjectTimeline).where(ProjectTimeline.project_id == project_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_asset_count_for_project(
    db: AsyncSession,
    project_id: uuid.UUID,
) -> int:
    """统计项目关联的素材数量"""
    stmt = select(func.count(Asset.id)).where(Asset.project_id == project_id)
    result = await db.execute(stmt)
    return result.scalar() or 0


async def delete_project_assets(
    db: AsyncSession,
    storage_service: StorageService,
    project_id: uuid.UUID,
):
    """删除项目关联的所有素材（MinIO文件 + 数据库记录）"""
    stmt = select(Asset).where(Asset.project_id == project_id)
    result = await db.execute(stmt)
    assets = result.scalars().all()

    for asset in assets:
        # 删除MinIO文件
        try:
            await storage_service.delete_object(storage_service.BUCKETS["assets"], asset.storage_key)
            if asset.thumbnail_key:
                await storage_service.delete_object(storage_service.BUCKETS["thumbnails"], asset.thumbnail_key)
            if asset.preview_frames_prefix:
                await storage_service.delete_objects_by_prefix(storage_service.BUCKETS["thumbnails"], asset.preview_frames_prefix)
            if asset.waveform_key:
                await storage_service.delete_object(storage_service.BUCKETS["thumbnails"], asset.waveform_key)
        except Exception as e:
            logger.warning(f"Failed to delete asset files for asset {asset.id}: {e}")
        # 删除数据库记录
        await db.delete(asset)

    await db.flush()


# ========== API Endpoints ==========

@router.get("/projects", response_model=ProjectListResponse)
async def list_projects(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1, description="页码，从1开始"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    q: Optional[str] = Query(None, description="搜索关键词（项目名称）"),
    order_by: str = Query("updated_at_desc", description="排序方式：updated_at_desc, created_at_desc, name_asc"),
):
    """获取项目列表（分页+搜索+排序）"""
    # 构建查询
    stmt = select(Project).where(Project.user_id == current_user.id)

    # 搜索过滤
    if q and q.strip():
        search_term = f"%{q.strip()}%"
        stmt = stmt.where(Project.name.ilike(search_term))

    # 排序
    if order_by == "updated_at_desc":
        stmt = stmt.order_by(desc(Project.updated_at))
    elif order_by == "created_at_desc":
        stmt = stmt.order_by(desc(Project.created_at))
    elif order_by == "name_asc":
        stmt = stmt.order_by(Project.name)
    else:
        stmt = stmt.order_by(desc(Project.updated_at))  # 默认

    # 分页
    offset = (page - 1) * page_size
    stmt = stmt.offset(offset).limit(page_size)

    # 执行查询
    result = await db.execute(stmt)
    projects = result.scalars().all()

    # 获取总数（用于分页）
    count_stmt = select(func.count(Project.id)).where(Project.user_id == current_user.id)
    if q and q.strip():
        search_term = f"%{q.strip()}%"
        count_stmt = count_stmt.where(Project.name.ilike(search_term))
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    # 转换为响应模型并获取素材数量
    project_items = []
    for project in projects:
        asset_count = await get_asset_count_for_project(db, project.id)
        project_dict = {**project.__dict__, "asset_count": asset_count}
        # 移除SQLAlchemy内部属性
        project_dict.pop("_sa_instance_state", None)
        project_items.append(ProjectListItem(**project_dict))

    return ProjectListResponse(
        data=project_items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/projects", response_model=ProjectCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    request: ProjectCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """创建新项目（同时创建空时间线）"""
    # 创建项目记录
    project = Project(
        user_id=current_user.id,
        name=request.name,
        description=None,
        cover_image_url=None,
        duration_ms=0,
        resolution_width=request.resolution_width,
        resolution_height=request.resolution_height,
        fps=request.fps,
        status="draft",
    )
    db.add(project)
    await db.flush()  # 获取ID

    # 创建关联的空时间线（使用Task-07的初始格式）
    timeline = ProjectTimeline(
        project_id=project.id,
        timeline_data={
            "id": str(uuid.uuid4()),
            "fps": request.fps,
            "resolution": {
                "width": request.resolution_width,
                "height": request.resolution_height,
            },
            "duration_ms": 0,
            "tracks": [],
        },
        version=1,
    )
    db.add(timeline)

    await db.commit()
    await db.refresh(project)

    return ProjectCreateResponse(**project.__dict__)


@router.get("/projects/{project_id}", response_model=ProjectDetailResponse)
async def get_project(
    project_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取项目详情"""
    project = await get_project_by_id(db, project_id, current_user.id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    # 获取时间线版本号
    timeline = await get_project_timeline(db, project_id)
    timeline_version = timeline.version if timeline else 1

    project_dict = {**project.__dict__, "timeline_version": timeline_version}
    project_dict.pop("_sa_instance_state", None)
    return ProjectDetailResponse(**project_dict)


@router.put("/projects/{project_id}", response_model=ProjectDetailResponse)
async def update_project(
    project_id: uuid.UUID,
    request: ProjectUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """更新项目信息"""
    project = await get_project_by_id(db, project_id, current_user.id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    # 更新字段
    if request.name is not None:
        project.name = request.name.strip()
    if request.description is not None:
        project.description = request.description.strip() if request.description.strip() else None

    project.updated_at = func.now()

    await db.commit()
    await db.refresh(project)

    # 获取时间线版本号
    timeline = await get_project_timeline(db, project_id)
    timeline_version = timeline.version if timeline else 1

    project_dict = {**project.__dict__, "timeline_version": timeline_version}
    project_dict.pop("_sa_instance_state", None)
    return ProjectDetailResponse(**project_dict)


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    storage_service: StorageService = Depends(get_storage_service),
):
    """删除项目（关联时间线、素材、导出任务）"""
    project = await get_project_by_id(db, project_id, current_user.id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    # 1. 删除关联的素材（MinIO文件 + 数据库记录）
    await delete_project_assets(db, storage_service, project_id)

    # 2. 删除关联的时间线（CASCADE外键会自动处理，但显式删除确保顺序）
    timeline = await get_project_timeline(db, project_id)
    if timeline:
        await db.delete(timeline)

    # 3. 删除关联的导出任务记录（MinIO导出文件保留，由生命周期规则清理）
    stmt = select(ExportTask).where(ExportTask.project_id == project_id)
    result = await db.execute(stmt)
    export_tasks = result.scalars().all()
    for export_task in export_tasks:
        await db.delete(export_task)

    # 4. 删除项目本身
    await db.delete(project)

    await db.commit()


@router.post("/projects/{project_id}/duplicate", response_model=ProjectCreateResponse)
async def duplicate_project(
    project_id: uuid.UUID,
    request: ProjectDuplicateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """复制项目"""
    # 获取原项目
    source_project = await get_project_by_id(db, project_id, current_user.id)
    if not source_project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source project not found",
        )

    # 获取原时间线
    source_timeline = await get_project_timeline(db, project_id)
    if not source_timeline:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source project timeline not found",
        )

    # 创建新项目（名称加" (副本)"后缀）
    new_project = Project(
        user_id=current_user.id,
        name=f"{source_project.name} (副本)",
        description=source_project.description,
        cover_image_url=source_project.cover_image_url,
        duration_ms=source_project.duration_ms,
        resolution_width=source_project.resolution_width,
        resolution_height=source_project.resolution_height,
        fps=source_project.fps,
        status="draft",
    )
    db.add(new_project)
    await db.flush()  # 获取新项目ID

    # 复制时间线JSON（更新ID和各Clip的ID为新UUID）
    import copy
    timeline_data = copy.deepcopy(source_timeline.timeline_data)
    timeline_data["id"] = str(uuid.uuid4())

    # 递归更新所有Clip ID
    def update_clip_ids(timeline_obj):
        if "tracks" in timeline_obj:
            for track in timeline_obj["tracks"]:
                if "clips" in track:
                    for clip in track["clips"]:
                        clip["id"] = str(uuid.uuid4())
        return timeline_obj

    timeline_data = update_clip_ids(timeline_data)

    # 创建新时间线
    new_timeline = ProjectTimeline(
        project_id=new_project.id,
        timeline_data=timeline_data,
        version=1,
    )
    db.add(new_timeline)

    # 复制素材引用（创建新的Asset记录共享相同storage_key）
    stmt = select(Asset).where(Asset.project_id == project_id)
    result = await db.execute(stmt)
    source_assets = result.scalars().all()

    for source_asset in source_assets:
        new_asset = Asset(
            user_id=current_user.id,
            project_id=new_project.id,
            name=source_asset.name,
            file_size_bytes=source_asset.file_size_bytes,
            duration_ms=source_asset.duration_ms,
            width=source_asset.width,
            height=source_asset.height,
            fps=source_asset.fps,
            format=source_asset.format,
            codec_video=source_asset.codec_video,
            codec_audio=source_asset.codec_audio,
            status="ready",  # 直接标记为ready，因为文件已存在
            storage_key=source_asset.storage_key,
            thumbnail_key=source_asset.thumbnail_key,
            preview_frames_prefix=source_asset.preview_frames_prefix,
            waveform_key=source_asset.waveform_key,
        )
        db.add(new_asset)

    await db.commit()
    await db.refresh(new_project)

    return ProjectCreateResponse(**new_project.__dict__)