"""Resend inbound email helpers.

Resend's inbound webhook is a *notification*, not a full content delivery.
The webhook payload contains email metadata (from / subject / attachment
ids) but no body and no attachment binaries. To get the actual content we
have to call back to Resend's API:

  GET /emails/receiving/{id}              → text + html + parsed headers
  GET /emails/receiving/{id}/attachments  → list each with download_url

Then download each attachment from its (signed, short-lived) ``download_url``.

Webhooks are signed Svix-style. Verification: HMAC-SHA256 over
``{svix-id}.{svix-timestamp}.{raw_body}`` using the (base64-decoded)
webhook secret. The ``svix-signature`` header may carry multiple
space-separated ``v1,<sig>`` pairs for key rotation.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parseaddr
from typing import Any

import httpx

log = logging.getLogger(__name__)

API_BASE = "https://api.resend.com"

# Webhook events older than this are rejected to mitigate replay attacks.
# Svix's reference implementation uses 5 minutes. We keep that.
MAX_WEBHOOK_AGE_SECONDS = 5 * 60


class ResendInboundError(Exception):
    """Resend Inbound API or signature problem."""


@dataclass(frozen=True)
class EmailContent:
    text: str | None
    html: str | None
    # Parsed headers as dict (Resend pre-parses common headers for us).
    headers: dict[str, Any] | None


@dataclass(frozen=True)
class InboundAttachment:
    id: str
    filename: str
    content_type: str
    content: bytes


# ---------------------------------------------------------------------------
# Signature verification (Svix HMAC-SHA256)
# ---------------------------------------------------------------------------


def verify_signature(
    *,
    secret: str,
    svix_id: str | None,
    svix_timestamp: str | None,
    svix_signature: str | None,
    raw_body: bytes,
) -> bool:
    """Verify a Svix-signed Resend webhook.

    Returns True iff:
      - all three headers are present,
      - svix-timestamp is within MAX_WEBHOOK_AGE_SECONDS of now,
      - at least one ``v1,<sig>`` entry in svix-signature matches the
        HMAC-SHA256 of ``{id}.{timestamp}.{body}`` using the decoded
        webhook secret.

    Returns False on any failure — never raises.
    """
    if not (secret and svix_id and svix_timestamp and svix_signature):
        return False

    # Reject obviously stale or future-dated payloads.
    try:
        ts = int(svix_timestamp)
    except (TypeError, ValueError):
        return False
    now = int(datetime.now(timezone.utc).timestamp())
    if abs(now - ts) > MAX_WEBHOOK_AGE_SECONDS:
        return False

    # Resend secrets follow the Svix convention: `whsec_<base64-key>`.
    # Strip the prefix if present, then decode.
    key_str = secret[len("whsec_"):] if secret.startswith("whsec_") else secret
    try:
        key = base64.b64decode(key_str)
    except Exception:
        return False

    signed_payload = f"{svix_id}.{svix_timestamp}.".encode() + raw_body
    expected = base64.b64encode(
        hmac.new(key, signed_payload, hashlib.sha256).digest()
    ).decode()

    # ``svix-signature`` may carry multiple space-separated ``v1,<sig>``
    # entries to support secret rotation. Match any.
    for pair in svix_signature.split():
        if not pair.startswith("v1,"):
            continue
        received = pair[len("v1,"):]
        if hmac.compare_digest(received, expected):
            return True

    return False


# ---------------------------------------------------------------------------
# REST API
# ---------------------------------------------------------------------------


async def fetch_email_content(api_key: str, email_id: str) -> EmailContent:
    """``GET /emails/receiving/{id}`` → text + html + headers."""
    if not api_key:
        raise ResendInboundError("RESEND_API_KEY not configured")

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{API_BASE}/emails/receiving/{email_id}",
            headers={"Authorization": f"Bearer {api_key}"},
        )

    if resp.status_code >= 400:
        raise ResendInboundError(
            f"GET /emails/receiving/{email_id} returned {resp.status_code}: "
            f"{resp.text[:300]}"
        )

    data = resp.json()
    headers = data.get("headers")
    return EmailContent(
        text=(data.get("text") or None),
        html=(data.get("html") or None),
        headers=headers if isinstance(headers, dict) else None,
    )


async def fetch_attachments(
    api_key: str, email_id: str
) -> list[InboundAttachment]:
    """List attachments and download each.

    Returns an empty list when the email has no attachments. Individual
    download failures are logged and skipped — we never abort the whole
    batch over one bad attachment.
    """
    if not api_key:
        raise ResendInboundError("RESEND_API_KEY not configured")

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.get(
            f"{API_BASE}/emails/receiving/{email_id}/attachments",
            headers={"Authorization": f"Bearer {api_key}"},
        )
        if resp.status_code >= 400:
            raise ResendInboundError(
                f"GET attachments for {email_id} returned {resp.status_code}: "
                f"{resp.text[:300]}"
            )

        listing = resp.json()
        # Resend wraps list responses; tolerate either {data: [...]} or {[...]}.
        items = listing.get("data") if isinstance(listing, dict) else listing
        if not isinstance(items, list):
            items = []

        out: list[InboundAttachment] = []
        for item in items:
            url = item.get("download_url")
            filename = item.get("filename") or "attachment"
            if not url:
                log.warning(
                    "Resend attachment %s has no download_url; skipping",
                    filename,
                )
                continue

            try:
                # download_url is signed — no Authorization header needed.
                dl = await client.get(url)
            except httpx.HTTPError:
                log.exception(
                    "Failed to GET Resend attachment %s for email %s",
                    filename,
                    email_id,
                )
                continue

            if dl.status_code >= 400:
                log.warning(
                    "Failed to download Resend attachment %s for email %s: %s",
                    filename,
                    email_id,
                    dl.status_code,
                )
                continue

            out.append(
                InboundAttachment(
                    id=item.get("id") or "",
                    filename=filename,
                    content_type=item.get("content_type") or "application/octet-stream",
                    content=dl.content,
                )
            )

    return out


def filter_pdfs(items: list[InboundAttachment]) -> list[InboundAttachment]:
    """Keep only attachments that look like PDFs."""
    pdfs: list[InboundAttachment] = []
    for a in items:
        ct = (a.content_type or "").lower()
        if ct == "application/pdf" or a.filename.lower().endswith(".pdf"):
            pdfs.append(a)
    return pdfs


# ---------------------------------------------------------------------------
# Helpers for parsing webhook fields
# ---------------------------------------------------------------------------


def parse_received_at(value: str | None):
    """Parse Resend's ISO 8601 timestamp; falls back to now() on failure."""
    if not value:
        return datetime.now(timezone.utc)
    try:
        # Python 3.11+ accepts trailing 'Z' via this swap.
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return datetime.now(timezone.utc)


def parse_sender_email(from_field: str | None) -> str | None:
    """Pull the bare email out of a 'Display Name <addr@host>' string.

    Returns None if input is empty. Returns the original string when no
    angle brackets — Resend will sometimes send just the address.
    """
    if not from_field:
        return None
    _name, addr = parseaddr(from_field)
    return addr or from_field
