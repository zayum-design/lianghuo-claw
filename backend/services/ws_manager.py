import asyncio
import json
from typing import Dict, List
from fastapi import WebSocket

from core.logging import get_logger

logger = get_logger("ws.manager")


class ConnectionManager:
    """管理 WebSocket 连接"""

    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, channel: str) -> None:
        """接受 WebSocket 连接并注册到频道"""
        await websocket.accept()
        if channel not in self.active_connections:
            self.active_connections[channel] = []
        self.active_connections[channel].append(websocket)
        logger.info(f"WebSocket connected to channel: {channel}")

    async def disconnect(self, websocket: WebSocket, channel: str) -> None:
        """从频道移除 WebSocket 连接"""
        if channel in self.active_connections:
            self.active_connections[channel].remove(websocket)
            if not self.active_connections[channel]:
                del self.active_connections[channel]
        logger.info(f"WebSocket disconnected from channel: {channel}")

    async def broadcast(self, channel: str, message: dict) -> None:
        """向频道内所有连接广播消息"""
        if channel not in self.active_connections:
            return

        tasks = []
        for connection in self.active_connections[channel]:
            try:
                tasks.append(
                    connection.send_json(message)
                )
            except Exception as e:
                logger.error(f"Failed to send message to WebSocket: {e}")

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)


# 全局连接管理器实例
manager = ConnectionManager()