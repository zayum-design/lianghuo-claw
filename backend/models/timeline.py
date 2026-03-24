import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import (
    Column,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    TIMESTAMP,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func

from core.database import Base


class ProjectTimeline(Base):
    """项目时间线模型"""
    __tablename__ = "project_timelines"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    project_id = Column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    timeline_data = Column(
        JSONB,
        nullable=False,
        default=dict,
        server_default='{}',
    )
    version = Column(
        Integer,
        nullable=False,
        default=1,
        server_default='1',
    )
    updated_at = Column(
        TIMESTAMP(timezone=True),
        nullable=False,
        default=func.now(),
        onupdate=func.now(),
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint('project_id', name='uq_project_timelines_project_id'),
        Index('ix_project_timelines_project_id', 'project_id'),
        Index('ix_timeline_data_gin', 'timeline_data', postgresql_using='gin'),
    )

    def __repr__(self) -> str:
        return f"<ProjectTimeline(id={self.id}, project_id={self.project_id}, version={self.version})>"