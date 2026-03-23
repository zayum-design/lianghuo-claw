from typing import Dict, Any
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as redis

from core.config import get_settings
from core.database import get_db
from core.logging import get_logger

router = APIRouter(tags=["health"])
logger = get_logger("health")
settings = get_settings()


@router.get("/health")
async def health_check(
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Health check endpoint.

    Returns status of all critical dependencies.
    """
    status = {
        "status": "ok",
        "version": "0.1.0",
    }

    # Check database
    try:
        await db.execute("SELECT 1")
        status["database"] = "ok"
    except Exception as e:
        logger.error("Database health check failed", error=str(e))
        status["database"] = "error"
        status["status"] = "error"

    # Check Redis
    try:
        redis_client = redis.from_url(str(settings.REDIS_URL))
        await redis_client.ping()
        await redis_client.close()
        status["redis"] = "ok"
    except Exception as e:
        logger.error("Redis health check failed", error=str(e))
        status["redis"] = "error"
        status["status"] = "error"

    return status