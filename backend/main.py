import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException, WebSocket
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import sentry_sdk

import asyncio
import json
import redis.asyncio as redis

from core.config import get_settings
from services.ws_manager import manager
from core.logging import (
    configure_logging,
    LoggingMiddleware,
    init_sentry,
    request_id,
    get_logger,
)
from api.v1.routers import health, assets, timelines, projects
from services.storage import get_storage_service

settings = get_settings()


async def start_redis_listener():
    """Redis Pub/Sub listener for WebSocket notifications."""
    logger = get_logger("ws.redis_listener")

    # 创建Redis客户端
    redis_client = redis.from_url(str(settings.REDIS_URL))
    pubsub = redis_client.pubsub()

    # 订阅Redis频道（带ws:前缀）
    redis_channel = f"ws:user:{settings.MOCK_USER_ID}"
    # WebSocket广播频道（不带ws:前缀）
    ws_channel = f"user:{settings.MOCK_USER_ID}"

    await pubsub.subscribe(redis_channel)
    logger.info(f"Subscribed to Redis channel: {redis_channel}")

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    # 转发到WebSocket连接（使用WebSocket频道名）
                    await manager.broadcast(ws_channel, data)
                    logger.debug(f"Forwarded message to WebSocket: {data.get('type')}")
                except json.JSONDecodeError as e:
                    logger.error(f"Invalid JSON message from Redis: {e}")
                except Exception as e:
                    logger.error(f"Failed to forward WebSocket message: {e}")
    except asyncio.CancelledError:
        logger.info("Redis listener cancelled")
        raise
    except Exception as e:
        logger.error(f"Redis listener error: {e}")
        raise
    finally:
        await pubsub.unsubscribe(redis_channel)
        await pubsub.aclose()
        await redis_client.aclose()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan events for startup and shutdown."""
    # Startup
    configure_logging()
    init_sentry()
    logger = get_logger("app.startup")
    logger.info("Starting lianghuo API", version="0.1.0")

    # Initialize MinIO buckets
    try:
        storage_service = get_storage_service()
        await asyncio.to_thread(storage_service.ensure_buckets_exist)
        logger.info("MinIO buckets initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize MinIO buckets: {e}")
        # Don't raise - allow API to start without buckets (they'll be created on first use)

    # Start Redis Pub/Sub listener for WebSocket notifications
    redis_listener_task = None
    try:
        redis_listener_task = asyncio.create_task(start_redis_listener())
        logger.info("Redis WebSocket listener started")
    except Exception as e:
        logger.error(f"Failed to start Redis listener: {e}")

    yield

    # Shutdown
    logger.info("Shutting down lianghuo API")

    # Cancel Redis listener task
    if redis_listener_task:
        redis_listener_task.cancel()
        try:
            await redis_listener_task
        except asyncio.CancelledError:
            pass
        logger.info("Redis WebSocket listener stopped")

# Create FastAPI app
app = FastAPI(
    title="lianghuo API",
    version="0.1.0",
    docs_url="/api/docs" if settings.DEBUG else None,
    redoc_url="/api/redoc" if settings.DEBUG else None,
    openapi_url="/api/openapi.json" if settings.DEBUG else None,
    lifespan=lifespan,
)


# ========== Middleware ==========

from starlette.middleware.base import BaseHTTPMiddleware


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Middleware to add request ID to headers and context."""

    async def dispatch(self, request: Request, call_next):
        # Get or generate request ID
        req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request_id.set(req_id)

        response = await call_next(request)
        response.headers["X-Request-ID"] = req_id
        return response


# Order matters: RequestID → Logging → CORS
app.add_middleware(RequestIDMiddleware)
app.add_middleware(LoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ========== Exception Handlers ==========

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTP exceptions with consistent format."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": "HTTP_ERROR",
            "message": str(exc.detail),
            "code": exc.status_code,
        },
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """Handle all unhandled exceptions."""
    # Log the error
    logger = get_logger("app.error")
    logger.error("Unhandled exception", exc_info=exc)

    # Send to Sentry if configured
    if settings.SENTRY_DSN:
        sentry_sdk.capture_exception(exc)

    return JSONResponse(
        status_code=500,
        content={
            "error": "INTERNAL_SERVER_ERROR",
            "message": "Server internal error",
            "code": 500,
        },
    )


# ========== Routes ==========

# Include routers
app.include_router(health.router, prefix=settings.API_V1_PREFIX)
app.include_router(assets.router, prefix=settings.API_V1_PREFIX)
app.include_router(timelines.router, prefix=settings.API_V1_PREFIX)
app.include_router(projects.router, prefix=settings.API_V1_PREFIX)

# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "name": "lianghuo API",
        "version": "0.1.0",
        "docs": "/api/docs" if settings.DEBUG else None,
        "health": "/api/v1/health",
    }


# WebSocket notifications
@app.websocket("/ws/notifications")
async def websocket_notifications(websocket: WebSocket):
    """WebSocket endpoint for real-time notifications."""
    channel = f"user:{settings.MOCK_USER_ID}"
    await manager.connect(websocket, channel)
    try:
        while True:
            data = await websocket.receive_text()
            # 处理心跳消息
            try:
                message = json.loads(data)
                if message.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except json.JSONDecodeError:
                pass
    except Exception as e:
        logger = get_logger("ws.notifications")
        logger.error(f"WebSocket error: {e}")
    finally:
        await manager.disconnect(websocket, channel)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        log_config=None,  # Use structlog instead of default uvicorn logging
    )