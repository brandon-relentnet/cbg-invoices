"""Helpers for processing Postmark inbound email webhooks.

Postmark inbound webhooks are typically authenticated via HTTP Basic Auth:
you set a URL like `https://user:secret@example.com/api/webhooks/postmark`
in the Postmark UI. We verify that the password matches POSTMARK_WEBHOOK_SECRET
(username is ignored), using a constant-time comparison.
"""
from __future__ import annotations

import base64
import binascii
import hmac
import logging
from datetime import UTC, datetime
from typing import Any

from dateutil import parser as date_parser

log = logging.getLogger(__name__)


def verify_basic_auth(authorization_header: str | None, secret: str | None) -> bool:
    """Return True if the Authorization header's Basic Auth password matches secret.

    If no secret is configured we return True with a warning — this makes local
    dev easier but is a loud signal to configure a secret in any real deployment.
    """
    if not secret:
        log.warning(
            "POSTMARK_WEBHOOK_SECRET is not set — accepting unauthenticated webhook "
            "(do not do this in production)"
        )
        return True
    if not authorization_header or not authorization_header.startswith("Basic "):
        return False
    try:
        decoded = base64.b64decode(authorization_header[len("Basic "):]).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        return False
    if ":" not in decoded:
        return False
    _user, provided = decoded.split(":", 1)
    return hmac.compare_digest(provided, secret)


def parse_received_at(raw: Any) -> datetime:
    """Best-effort parse of Postmark's `Date` field. Fall back to now(UTC)."""
    if not raw:
        return datetime.now(UTC)
    try:
        return date_parser.parse(str(raw))
    except (ValueError, TypeError):
        return datetime.now(UTC)


def extract_pdf_attachments(attachments: list[dict[str, Any]]) -> list[tuple[str, bytes]]:
    """Return [(filename, bytes), ...] for every PDF attachment.

    Postmark delivers attachment content as base64. Non-PDF attachments
    (images in signatures, Word docs, etc.) are ignored.
    """
    out: list[tuple[str, bytes]] = []
    for att in attachments or []:
        content_type = (att.get("ContentType") or "").lower()
        name = att.get("Name") or "attachment.pdf"
        b64 = att.get("Content")
        if not b64:
            continue
        is_pdf = content_type.startswith("application/pdf") or name.lower().endswith(".pdf")
        if not is_pdf:
            continue
        try:
            data = base64.b64decode(b64)
        except binascii.Error:
            log.warning("Could not base64-decode attachment %s", name)
            continue
        if not data:
            continue
        out.append((name, data))
    return out
