import asyncio
import json
import logging
from functools import lru_cache
from typing import Optional
from urllib.parse import urlparse

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


class StorageService:
    """MinIO/S3 存储服务封装"""

    # 项目所需的存储桶
    BUCKETS = {
        "assets": "Lianghuo-assets",
        "thumbnails": "Lianghuo-thumbnails",
        "exports": "Lianghuo-exports",
        "covers": "Lianghuo-covers",
    }

    def __init__(self):
        """初始化 S3 客户端"""
        self.s3_client = boto3.client(
            "s3",
            endpoint_url=(
                f"http{'s' if settings.MINIO_SECURE else ''}://{settings.MINIO_ENDPOINT}"
            ),
            aws_access_key_id=settings.MINIO_ACCESS_KEY,
            aws_secret_access_key=settings.MINIO_SECRET_KEY,
            config=Config(signature_version="s3v4"),
        )

    # ========== Presigned URLs ==========

    def generate_presigned_upload_url(
        self,
        bucket: str,
        key: str,
        expires_seconds: int = 3600,
    ) -> str:
        """
        生成 PUT 方法的预签名 URL，用于前端直传文件到 MinIO

        Args:
            bucket: 存储桶名称
            key: 对象键
            expires_seconds: URL 过期时间（秒）

        Returns:
            预签名 URL 字符串
        """
        try:
            url = self.s3_client.generate_presigned_url(
                ClientMethod="put_object",
                Params={
                    "Bucket": bucket,
                    "Key": key,
                    "ContentType": "application/octet-stream",
                },
                ExpiresIn=expires_seconds,
            )
            # 替换 host 为浏览器可访问的地址
            if settings.MINIO_PUBLIC_ENDPOINT:
                parsed = urlparse(url)
                public_parsed = urlparse(
                    f"http{'s' if settings.MINIO_SECURE else ''}://{settings.MINIO_PUBLIC_ENDPOINT}"
                )
                url = url.replace(
                    f"{parsed.scheme}://{parsed.netloc}",
                    f"{public_parsed.scheme}://{public_parsed.netloc}",
                )
            return url
        except ClientError as e:
            logger.error(f"Failed to generate presigned upload URL: {e}")
            raise

    def generate_presigned_download_url(
        self,
        bucket: str,
        key: str,
        expires_seconds: int = 3600,
    ) -> str:
        """
        生成 GET 方法的预签名 URL，用于前端播放/下载文件

        Args:
            bucket: 存储桶名称
            key: 对象键
            expires_seconds: URL 过期时间（秒）

        Returns:
            预签名 URL 字符串
        """
        try:
            url = self.s3_client.generate_presigned_url(
                ClientMethod="get_object",
                Params={"Bucket": bucket, "Key": key},
                ExpiresIn=expires_seconds,
            )
            # 替换 host 为浏览器可访问的地址
            if settings.MINIO_PUBLIC_ENDPOINT:
                parsed = urlparse(url)
                public_parsed = urlparse(
                    f"http{'s' if settings.MINIO_SECURE else ''}://{settings.MINIO_PUBLIC_ENDPOINT}"
                )
                url = url.replace(
                    f"{parsed.scheme}://{parsed.netloc}",
                    f"{public_parsed.scheme}://{public_parsed.netloc}",
                )
            return url
        except ClientError as e:
            logger.error(f"Failed to generate presigned download URL: {e}")
            raise

    # ========== Upload Operations ==========

    def upload_bytes(
        self,
        bucket: str,
        key: str,
        data: bytes,
        content_type: str,
    ) -> None:
        """
        服务端直接上传字节数据

        Args:
            bucket: 存储桶名称
            key: 对象键
            data: 字节数据
            content_type: 内容类型
        """
        try:
            self.s3_client.put_object(
                Bucket=bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
            )
        except ClientError as e:
            logger.error(f"Failed to upload bytes to {bucket}/{key}: {e}")
            raise

    def upload_file(
        self,
        bucket: str,
        key: str,
        file_path: str,
        content_type: str,
    ) -> None:
        """
        服务端上传本地文件

        Args:
            bucket: 存储桶名称
            key: 对象键
            file_path: 本地文件路径
            content_type: 内容类型
        """
        try:
            self.s3_client.upload_file(
                Filename=file_path,
                Bucket=bucket,
                Key=key,
                ExtraArgs={"ContentType": content_type},
            )
        except ClientError as e:
            logger.error(f"Failed to upload file to {bucket}/{key}: {e}")
            raise

    # ========== Delete Operations ==========

    def delete_object(self, bucket: str, key: str) -> None:
        """
        删除单个对象

        Args:
            bucket: 存储桶名称
            key: 对象键
        """
        try:
            self.s3_client.delete_object(Bucket=bucket, Key=key)
        except ClientError as e:
            logger.error(f"Failed to delete object {bucket}/{key}: {e}")
            raise

    def delete_objects_by_prefix(self, bucket: str, prefix: str) -> None:
        """
        列出所有指定前缀的对象并批量删除

        Args:
            bucket: 存储桶名称
            prefix: 对象键前缀
        """
        try:
            # 列出所有匹配的对象
            paginator = self.s3_client.get_paginator("list_objects_v2")
            objects_to_delete = []
            for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
                if "Contents" in page:
                    objects_to_delete.extend(
                        [{"Key": obj["Key"]} for obj in page["Contents"]]
                    )

            # 批量删除
            if objects_to_delete:
                self.s3_client.delete_objects(
                    Bucket=bucket,
                    Delete={"Objects": objects_to_delete},
                )
        except ClientError as e:
            logger.error(f"Failed to delete objects with prefix {prefix}: {e}")
            raise

    # ========== Utility Methods ==========

    def object_exists(self, bucket: str, key: str) -> bool:
        """
        检查对象是否存在

        Args:
            bucket: 存储桶名称
            key: 对象键

        Returns:
            True 如果对象存在，否则 False
        """
        try:
            self.s3_client.head_object(Bucket=bucket, Key=key)
            return True
        except ClientError as e:
            if e.response["Error"]["Code"] == "404":
                return False
            raise

    def ensure_buckets_exist(self) -> None:
        """
        检查并创建项目所需的存储桶，设置公开只读策略给 thumbnails 桶
        """
        for bucket_name in self.BUCKETS.values():
            try:
                self.s3_client.head_bucket(Bucket=bucket_name)
                logger.info(f"Bucket already exists: {bucket_name}")
            except ClientError as e:
                if e.response["Error"]["Code"] == "404":
                    # 存储桶不存在，创建它
                    self.s3_client.create_bucket(Bucket=bucket_name)
                    logger.info(f"Created bucket: {bucket_name}")
                else:
                    raise

        # 设置 thumbnails 桶的公开只读策略
        thumbnails_bucket = self.BUCKETS["thumbnails"]
        try:
            self.s3_client.put_bucket_policy(
                Bucket=thumbnails_bucket,
                Policy=json.dumps({
                    "Version": "2012-10-17",
                    "Statement": [
                        {
                            "Effect": "Allow",
                            "Principal": "*",
                            "Action": ["s3:GetObject"],
                            "Resource": f"arn:aws:s3:::{thumbnails_bucket}/*",
                        }
                    ],
                }),
            )
            logger.info(f"Set public read policy for bucket: {thumbnails_bucket}")
        except ClientError as e:
            logger.warning(f"Failed to set public read policy for {thumbnails_bucket}: {e}")


# ========== FastAPI Dependency ==========

@lru_cache
def get_storage_service() -> StorageService:
    """获取 StorageService 单例实例"""
    return StorageService()


