"""SQLAlchemy models for Alembic detection."""

from core.database import Base

# Import all models here when they are created
from .asset import Asset
# from .project_timeline import ProjectTimeline
# from .export_task import ExportTask
from .project import Project

# This ensures Base.metadata includes all model metadata
__all__ = ["Base"]