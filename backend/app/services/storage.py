"""Cloudflare R2 (S3-compatible) storage client.

Stores invoice PDFs with keys like `invoices/2025/04/<uuid>.pdf`.
Uses boto3's S3 client since R2 is fully S3-compatible.
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import UUID

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.config import get_settings

log = logging.getLogger(__name__)


class StorageError(Exception):
    """Base class for storage errors that should surface to users."""


class StorageNotConfiguredError(StorageError):
    """R2 credentials or endpoint aren't set in the environment."""


class StorageBucketMissingError(StorageError):
    """The configured R2 bucket doesn't exist or isn't accessible."""


def _client():
    settings = get_settings()
    if not settings.r2_endpoint or not settings.r2_access_key_id:
        raise StorageNotConfiguredError(
            "R2 storage is not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, "
            "R2_SECRET_ACCESS_KEY, and R2_BUCKET in your .env file."
        )
    return boto3.client(
        "s3",
        endpoint_url=settings.r2_endpoint,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name="auto",
        config=Config(
            signature_version="s3v4",
            retries={"max_attempts": 3, "mode": "standard"},
        ),
    )


def build_storage_key(invoice_id: UUID, *, received_at: datetime | None = None) -> str:
    when = received_at or datetime.now(UTC)
    return f"invoices/{when.year:04d}/{when.month:02d}/{invoice_id}.pdf"


def upload_pdf(storage_key: str, content: bytes, *, filename: str | None = None) -> None:
    """Uploads raw PDF bytes to R2. Raises StorageError subclasses on failure."""
    settings = get_settings()
    client = _client()
    extra: dict[str, str] = {"ContentType": "application/pdf"}
    if filename:
        # Content-Disposition gives a friendly name when the signed URL is opened directly
        extra["ContentDisposition"] = f'inline; filename="{_sanitize(filename)}"'
    try:
        client.put_object(
            Bucket=settings.r2_bucket,
            Key=storage_key,
            Body=content,
            **extra,
        )
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code in ("NoSuchBucket", "404"):
            raise StorageBucketMissingError(
                f"R2 bucket '{settings.r2_bucket}' does not exist. "
                f"Create it in the Cloudflare dashboard, or update R2_BUCKET in .env."
            ) from exc
        raise StorageError(f"R2 upload failed ({code}): {exc}") from exc
    except BotoCoreError as exc:
        raise StorageError(f"R2 upload failed: {exc}") from exc
    log.info("Uploaded PDF to R2: %s (%d bytes)", storage_key, len(content))


def download_pdf(storage_key: str) -> bytes:
    settings = get_settings()
    client = _client()
    try:
        resp = client.get_object(Bucket=settings.r2_bucket, Key=storage_key)
        return resp["Body"].read()
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code in ("NoSuchKey", "404"):
            raise StorageError(f"PDF not found in R2 at {storage_key}") from exc
        if code in ("NoSuchBucket",):
            raise StorageBucketMissingError(
                f"R2 bucket '{settings.r2_bucket}' does not exist."
            ) from exc
        raise StorageError(f"R2 download failed ({code}): {exc}") from exc
    except BotoCoreError as exc:
        raise StorageError(f"R2 download failed: {exc}") from exc


def presign_url(storage_key: str, *, ttl_seconds: int = 900) -> str:
    """Returns a signed URL valid for ttl_seconds (default 15 min)."""
    settings = get_settings()
    client = _client()
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.r2_bucket, "Key": storage_key},
        ExpiresIn=ttl_seconds,
    )


def _sanitize(filename: str) -> str:
    """Strip characters that would break a Content-Disposition header."""
    return "".join(c if c.isalnum() or c in "-._ " else "_" for c in filename)[:200]
