import uuid
from datetime import datetime
from sqlalchemy import Column, String, TIMESTAMP, func
from sqlalchemy.dialects.postgresql import UUID

from core.database import Base


class Project(Base):
    """项目模型（占位符，待 Task-14 完善）"""
    __tablename__ = "projects"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    name = Column(
        String(200),
        nullable=False,
        default="Untitled Project",
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

    def __repr__(self) -> str:
        return f"<Project(id={self.id}, name='{self.name}')>"