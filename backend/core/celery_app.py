import os
from celery import Celery

from .config import get_settings

settings = get_settings()

# 创建 Celery 应用实例
celery_app = Celery(
    "lianghuo",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

# 配置
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Shanghai",
    enable_utc=True,
    task_acks_late=True,
    worker_max_tasks_per_child=50,
    task_routes={
        "tasks.process_asset.process_asset_task": {"queue": "media"},
        "tasks.export_project.export_project_task": {"queue": "export"},
        "*": {"queue": "default"},
    },
    task_default_queue="default",
)

# 自动发现任务
celery_app.autodiscover_tasks(["tasks"], force=True)