import os
from typing import List, Optional
from functools import lru_cache

from pydantic import Field, PostgresDsn, RedisDsn, field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from .env file and environment variables."""

    # Database
    DATABASE_URL: PostgresDsn = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/lianghuo",
        description="PostgreSQL async connection URL",
    )

    # Redis
    REDIS_URL: RedisDsn = Field(
        default="redis://localhost:6379/0",
        description="Redis connection URL",
    )

    # MinIO
    MINIO_ENDPOINT: str = Field(
        default="localhost:9000",
        description="MinIO server endpoint",
    )
    MINIO_ACCESS_KEY: str = Field(
        default="minioadmin",
        description="MinIO access key",
    )
    MINIO_SECRET_KEY: str = Field(
        default="minioadmin",
        description="MinIO secret key",
    )
    MINIO_SECURE: bool = Field(
        default=False,
        description="Use HTTPS for MinIO connections",
    )
    MINIO_PUBLIC_ENDPOINT: Optional[str] = Field(
        default=None,
        description="Public MinIO endpoint for browser access (defaults to MINIO_ENDPOINT)",
    )

    # Sentry
    SENTRY_DSN: Optional[str] = Field(
        default=None,
        description="Sentry DSN for error tracking",
    )

    # CORS
    CORS_ORIGINS: List[str] = Field(
        default=["http://localhost:5173"],
        description="Allowed CORS origins",
    )

    # Debug
    DEBUG: bool = Field(
        default=False,
        description="Enable debug mode",
    )

    # Mock user
    MOCK_USER_ID: str = Field(
        default="00000000-0000-0000-0000-000000000001",
        description="Mock user ID for authentication bypass",
    )

    # Application
    API_V1_PREFIX: str = Field(
        default="/api/v1",
        description="API v1 prefix",
    )

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str | List[str]) -> List[str]:
        """Parse CORS_ORIGINS from comma-separated string or list."""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v

    @field_validator("MINIO_PUBLIC_ENDPOINT")
    @classmethod
    def set_minio_public_endpoint(cls, v: Optional[str], info) -> str:
        """Set default MINIO_PUBLIC_ENDPOINT if not provided."""
        if v is None:
            return info.data.get("MINIO_ENDPOINT", "localhost:9000")
        return v

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()