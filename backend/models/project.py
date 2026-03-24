import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Integer, Float, TIMESTAMP, func, Index
from sqlalchemy.dialects.postgresql import UUID

from core.database import Base


class Project(Base):
    """项目模型"""
    __tablename__ = "projects"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    user_id = Column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    name = Column(
        String(255),
        nullable=False,
        default="Untitled Project",
    )
    description = Column(
        Text,
        nullable=True,
    )
    cover_image_url = Column(
        Text,
        nullable=True,
    )
    duration_ms = Column(
        Integer,
        nullable=False,
        default=0,
        server_default='0',
    )
    resolution_width = Column(
        Integer,
        nullable=False,
        default=1920,
        server_default='1920',
    )
    resolution_height = Column(
        Integer,
        nullable=False,
        default=1080,
        server_default='1080',
    )
    fps = Column(
        Float,
        nullable=False,
        default=30.0,
        server_default='30.0',
    )
    status = Column(
        String(50),
        nullable=False,
        default='draft',
        server_default='draft',
    )
    created_at = Column(
        TIMESTAMP(timezone=True),
        nullable=False,
        default=func.now(),
        server_default=func.now(),
    )
    updated_at = Column(
        TIMESTAMP(timezone=True),
        nullable=False,
        default=func.now(),
        onupdate=func.now(),
        server_default=func.now(),
    )

    __table_args__ = (
        Index('ix_projects_user_updated', 'user_id', 'updated_at'),
    )

    def __repr__(self) -> str:
        return f"<Project(id={self.id}, name='{self.name}', user_id={self.user_id})>"