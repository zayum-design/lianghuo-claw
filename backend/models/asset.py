import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import (
    BigInteger,
    Column,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    TIMESTAMP,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from core.database import Base


class Asset(Base):
    """素材（Asset）模型"""
    __tablename__ = "assets"

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
    project_id = Column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    name = Column(
        String(500),
        nullable=False,
    )
    file_size_bytes = Column(
        BigInteger,
        nullable=False,
    )
    duration_ms = Column(
        Integer,
        nullable=True,
    )
    width = Column(
        Integer,
        nullable=True,
    )
    height = Column(
        Integer,
        nullable=True,
    )
    fps = Column(
        Float,
        nullable=True,
    )
    format = Column(
        String(50),
        nullable=True,
    )
    codec_video = Column(
        String(100),
        nullable=True,
    )
    codec_audio = Column(
        String(100),
        nullable=True,
    )
    status = Column(
        String(50),
        nullable=False,
        default="uploading",
    )
    storage_key = Column(
        Text,
        nullable=False,
    )
    thumbnail_key = Column(
        Text,
        nullable=True,
    )
    preview_frames_prefix = Column(
        Text,
        nullable=True,
    )
    waveform_key = Column(
        Text,
        nullable=True,
    )
    error_message = Column(
        Text,
        nullable=True,
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
        Index("ix_assets_user_id_created_at", "user_id", "created_at"),
        Index("ix_assets_project_id", "project_id"),
    )

    def __repr__(self) -> str:
        return f"<Asset(id={self.id}, name='{self.name}', status='{self.status}')>"