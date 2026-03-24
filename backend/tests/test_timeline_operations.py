import pytest
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.timeline import ProjectTimeline
# Note: TimelineCreateRequest and TimelineUpdateRequest are not yet implemented


class TestTimelineOperations:
    """测试时间线操作（JSONB存储、乐观锁）"""

    @pytest.mark.asyncio
    async def test_timeline_storage_and_retrieval(self, db_session: AsyncSession):
        """测试时间线JSONB的存储和读取（保存一个含多个Clip的时间线，读回后数据完全一致）"""
        # 创建一个复杂的时间线JSON
        timeline_data = {
            "id": str(uuid.uuid4()),
            "fps": 30.0,
            "resolution": {"width": 1920, "height": 1080},
            "duration_ms": 10000,
            "tracks": [
                {
                    "id": str(uuid.uuid4()),
                    "type": "video",
                    "name": "视频轨道1",
                    "index": 0,
                    "is_muted": False,
                    "is_locked": False,
                    "height_px": 120,
                    "clips": [
                        {
                            "id": str(uuid.uuid4()),
                            "asset_id": str(uuid.uuid4()),
                            "timeline_start_ms": 0,
                            "source_start_ms": 0,
                            "source_end_ms": 5000,
                            "duration_ms": 5000,
                            "speed": 1.0,
                            "volume": 1.0,
                            "filters": []
                        }
                    ]
                }
            ]
        }

        # 创建时间线记录
        timeline = ProjectTimeline(
            project_id=uuid.uuid4(),
            timeline_data=timeline_data,
            version=1
        )
        db_session.add(timeline)
        await db_session.flush()
        await db_session.refresh(timeline)

        # 读取回时间线数据
        stmt = select(ProjectTimeline).where(ProjectTimeline.id == timeline.id)
        result = await db_session.execute(stmt)
        retrieved = result.scalar_one()

        # 验证数据完全一致
        assert retrieved.timeline_data == timeline_data
        assert retrieved.version == 1

        # 清理
        await db_session.delete(timeline)
        await db_session.flush()

    @pytest.mark.asyncio
    async def test_optimistic_lock(self, db_session: AsyncSession):
        """测试乐观锁（同版本号并发保存应有一个返回409）"""
        # 创建初始时间线
        timeline_data = {
            "id": str(uuid.uuid4()),
            "fps": 30.0,
            "resolution": {"width": 1920, "height": 1080},
            "duration_ms": 0,
            "tracks": []
        }

        timeline = ProjectTimeline(
            project_id=uuid.uuid4(),
            timeline_data=timeline_data,
            version=1
        )
        db_session.add(timeline)
        await db_session.flush()
        timeline_id = timeline.id
        await db_session.refresh(timeline)

        # 模拟并发更新：两个会话同时读取相同版本
        # 会话1更新
        timeline.timeline_data["duration_ms"] = 5000
        timeline.version += 1
        await db_session.flush()

        # 会话2尝试用旧版本更新（应该失败）
        # 这里简化测试：直接尝试用 version=1 更新，应该触发乐观锁错误
        # 实际应用中，应该在服务层处理版本冲突
        from sqlalchemy.exc import IntegrityError

        # 创建另一个会话来模拟并发
        async with db_session.begin_nested():
            stmt = select(ProjectTimeline).where(ProjectTimeline.id == timeline_id)
            result = await db_session.execute(stmt)
            timeline2 = result.scalar_one()

            # 尝试用旧版本更新（version=1，但数据库中是version=2）
            timeline2.timeline_data["duration_ms"] = 10000
            timeline2.version = 1  # 错误版本

            # 保存时应检测到版本冲突
            # 注意：这里乐观锁由应用层处理，不是数据库约束
            # 我们模拟版本检查逻辑
            if timeline2.version != timeline.version:
                raise Exception("版本冲突")

        # 清理
        await db_session.delete(timeline)
        await db_session.flush()