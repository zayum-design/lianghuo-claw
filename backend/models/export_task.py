import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import (
    BigInteger,
    Column,
    Float,
    Index,
    Integer,
    String,
    Text,
    TIMESTAMP,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from core.database import Base


class ExportTask(Base):
    """导出任务模型"""
    __tablename__ = "export_tasks"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    project_id = Column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    status = Column(
        String(50),
        nullable=False,
        default='queued',
        server_default='queued',
    )
    progress = Column(
        Integer,
        nullable=False,
        default=0,
        server_default='0',
    )
    format = Column(
        String(50),
        nullable=False,
        default='mp4',
        server_default='mp4',
    )
    resolution_width = Column(
        Integer,
        nullable=True,
    )
    resolution_height = Column(
        Integer,
        nullable=True,
    )
    fps = Column(
        Float,
        nullable=True,
    )
    video_bitrate_kbps = Column(
        Integer,
        nullable=False,
        default=4000,
        server_default='4000',
    )
    output_key = Column(
        Text,
        nullable=True,
    )
    download_url = Column(
        Text,
        nullable=True,
    )
    error_message = Column(
        Text,
        nullable=True,
    )
    started_at = Column(
        TIMESTAMP(timezone=True),
        nullable=True,
    )
    completed_at = Column(
        TIMESTAMP(timezone=True),
        nullable=True,
    )
    created_at = Column(
        TIMESTAMP(timezone=True),
        nullable=False,
        default=func.now(),
        server_default=func.now(),
    )

    __table_args__ = (
        Index('ix_export_tasks_user_status', 'user_id', 'status'),
    )

    def __repr__(self) -> str:
        return f"<ExportTask(id={self.id}, project_id={self.project_id}, status='{self.status}', progress={self.progress})>"