import sys
import uuid
import time
from typing import Dict, Any
from contextvars import ContextVar

import structlog
from fastapi import FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from .config import get_settings

settings = get_settings()

# Context variable for request ID
request_id: ContextVar[str] = ContextVar("request_id", default="")


def configure_logging() -> None:
    """Configure structlog based on environment."""
    # Common processors
    processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    # Add different renderers based on environment
    if settings.DEBUG:
        processors.append(
            structlog.dev.ConsoleRenderer(
                colors=True,
                pad_event=30,
            )
        )
    else:
        processors.append(structlog.processors.JSONRenderer())

    # Configure structlog
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(*args, **kwargs):
    """Get structured logger instance."""
    return structlog.get_logger(*args, **kwargs)


class LoggingMiddleware(BaseHTTPMiddleware):
    """Middleware for structured request logging."""

    async def dispatch(self, request: Request, call_next) -> Response:
        # Generate request ID
        req_id = str(uuid.uuid4())
        request_id.set(req_id)

        # Bind context variables
        structlog.contextvars.bind_contextvars(
            request_id=req_id,
            method=request.method,
            path=request.url.path,
        )

        logger = get_logger("http.request")
        start_time = time.time()

        try:
            response = await call_next(request)
            duration_ms = (time.time() - start_time) * 1000

            logger.info(
                "Request completed",
                status_code=response.status_code,
                duration_ms=round(duration_ms, 2),
            )
            return response
        except Exception as exc:
            duration_ms = (time.time() - start_time) * 1000
            logger.error(
                "Request failed",
                exc_info=exc,
                duration_ms=round(duration_ms, 2),
            )
            raise


def init_sentry() -> None:
    """Initialize Sentry SDK if DSN is configured."""
    if settings.SENTRY_DSN:
        import sentry_sdk

        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            traces_sample_rate=0.1,
            environment="development" if settings.DEBUG else "production",
        )