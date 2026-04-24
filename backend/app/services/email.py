"""Outbound email via Resend.

Uses Resend's simple HTTP API directly (no SDK needed). Each send returns
the Resend message id on success, which we log for traceability.

Required env:
    RESEND_API_KEY
    RESEND_FROM  (e.g. `"Cambridge Invoice Portal <noreply@cambridgebg.com>"`)
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)

RESEND_ENDPOINT = "https://api.resend.com/emails"


class EmailError(Exception):
    """Generic email send failure."""


class EmailNotConfigured(EmailError):
    """RESEND_API_KEY is not set."""


async def send_email(
    *,
    to: str,
    subject: str,
    html: str,
    text: str | None = None,
    reply_to: str | None = None,
) -> str:
    """Send an email via Resend. Returns the Resend message id."""
    settings = get_settings()
    if not settings.resend_api_key:
        raise EmailNotConfigured(
            "RESEND_API_KEY is not set. Add it to .env and restart the backend."
        )

    payload: dict[str, Any] = {
        "from": settings.resend_from,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if text:
        payload["text"] = text
    if reply_to:
        payload["reply_to"] = reply_to

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            RESEND_ENDPOINT,
            headers={
                "Authorization": f"Bearer {settings.resend_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if resp.status_code >= 400:
        # Resend returns JSON errors like {"name": "...", "message": "..."}
        body: Any
        try:
            body = resp.json()
        except ValueError:
            body = resp.text
        log.warning("Resend send failed: %s", body)
        raise EmailError(f"Resend send failed ({resp.status_code}): {body!r}")

    data = resp.json()
    message_id = data.get("id", "<unknown>")
    log.info("Resend email sent to %s (id=%s)", to, message_id)
    return message_id
