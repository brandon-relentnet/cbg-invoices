"""QuickBooks Online API client.

Responsibilities:
  - OAuth2: build auth URL, exchange code, refresh tokens
  - Transparently refresh the access token when within 5 min of expiry
  - Retry once on 401 by forcing a refresh + retry
  - Provide typed helpers for common resources (vendors, customers, bills, attachments)

All calls are async via httpx.
"""
from __future__ import annotations

import base64
import logging
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlencode
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.qbo_token import QboToken

log = logging.getLogger(__name__)

AUTHORIZATION_URL = "https://appcenter.intuit.com/connect/oauth2"
TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
SCOPE = "com.intuit.quickbooks.accounting"
REFRESH_BUFFER = timedelta(minutes=5)
ACCESS_TOKEN_TTL = timedelta(seconds=3600)
REFRESH_TOKEN_TTL = timedelta(days=100)


class QboNotConnectedError(RuntimeError):
    """Raised when no QBO token is stored."""


class QboApiError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None, body: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


# ---------- OAuth ----------


def build_auth_url(state: str | None = None) -> tuple[str, str]:
    """Return (authorization_url, state). Caller should persist state in session/cookie."""
    settings = get_settings()
    state = state or secrets.token_urlsafe(24)
    params = {
        "client_id": settings.qbo_client_id,
        "response_type": "code",
        "scope": SCOPE,
        "redirect_uri": settings.qbo_redirect_uri,
        "state": state,
    }
    return f"{AUTHORIZATION_URL}?{urlencode(params)}", state


async def exchange_code_for_token(code: str, realm_id: str) -> dict[str, Any]:
    settings = get_settings()
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.qbo_redirect_uri,
            },
            headers=_basic_auth_headers(),
        )
    if resp.status_code != 200:
        raise QboApiError(
            f"OAuth code exchange failed ({resp.status_code})",
            status_code=resp.status_code,
            body=resp.text,
        )
    return resp.json()


async def refresh_access_token(refresh_token: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            TOKEN_URL,
            data={"grant_type": "refresh_token", "refresh_token": refresh_token},
            headers=_basic_auth_headers(),
        )
    if resp.status_code != 200:
        raise QboApiError(
            f"Token refresh failed ({resp.status_code})",
            status_code=resp.status_code,
            body=resp.text,
        )
    return resp.json()


def _basic_auth_headers() -> dict[str, str]:
    settings = get_settings()
    raw = f"{settings.qbo_client_id}:{settings.qbo_client_secret}".encode()
    return {
        "Authorization": f"Basic {base64.b64encode(raw).decode()}",
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
    }


# ---------- Token management ----------


async def get_stored_token(session: AsyncSession) -> QboToken | None:
    result = await session.execute(select(QboToken).where(QboToken.id == 1))
    return result.scalar_one_or_none()


async def save_token(
    session: AsyncSession,
    *,
    realm_id: str,
    access_token: str,
    refresh_token: str,
    expires_in: int,
    x_refresh_token_expires_in: int,
) -> QboToken:
    now = datetime.now(UTC)
    token = await get_stored_token(session)
    if token is None:
        token = QboToken(id=1)
        session.add(token)
    token.realm_id = realm_id
    token.access_token = access_token
    token.refresh_token = refresh_token
    token.expires_at = now + timedelta(seconds=expires_in)
    token.refresh_expires_at = now + timedelta(seconds=x_refresh_token_expires_in)
    await session.flush()
    return token


async def ensure_fresh_token(session: AsyncSession) -> QboToken:
    token = await get_stored_token(session)
    if token is None:
        raise QboNotConnectedError("QBO is not connected")

    now = datetime.now(UTC)
    # SQLAlchemy may return naive datetimes depending on dialect/driver; normalize
    expires_at = token.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)

    if expires_at - REFRESH_BUFFER > now:
        return token

    log.info("Refreshing QBO access token (was to expire %s)", expires_at)
    payload = await refresh_access_token(token.refresh_token)
    token.access_token = payload["access_token"]
    # Intuit may rotate the refresh token
    token.refresh_token = payload.get("refresh_token", token.refresh_token)
    token.expires_at = now + timedelta(seconds=int(payload.get("expires_in", 3600)))
    if "x_refresh_token_expires_in" in payload:
        token.refresh_expires_at = now + timedelta(
            seconds=int(payload["x_refresh_token_expires_in"])
        )
    await session.flush()
    return token


async def revoke_token(session: AsyncSession) -> None:
    """Delete stored QBO token. We don't attempt to notify Intuit."""
    token = await get_stored_token(session)
    if token is not None:
        await session.delete(token)
        await session.flush()


# ---------- Authenticated requests ----------


async def _request(
    session: AsyncSession,
    method: str,
    path: str,
    *,
    params: dict[str, Any] | None = None,
    json_body: Any | None = None,
    files: dict[str, Any] | None = None,
    data: dict[str, Any] | None = None,
    retry: bool = True,
) -> Any:
    token = await ensure_fresh_token(session)
    settings = get_settings()
    url = f"{settings.qbo_api_base}/v3/company/{token.realm_id}{path}"

    headers = {
        "Authorization": f"Bearer {token.access_token}",
        "Accept": "application/json",
    }
    # Don't set Content-Type when sending multipart (httpx does it)
    if json_body is not None and files is None and data is None:
        headers["Content-Type"] = "application/json"

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.request(
            method,
            url,
            headers=headers,
            params=params,
            json=json_body,
            files=files,
            data=data,
        )

    if resp.status_code == 401 and retry:
        log.info("QBO returned 401 — forcing token refresh and retrying once")
        # Force-expire and retry once
        token.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        await session.flush()
        return await _request(
            session, method, path,
            params=params, json_body=json_body, files=files, data=data,
            retry=False,
        )

    if resp.status_code >= 400:
        body_text = resp.text[:2000]
        raise QboApiError(
            f"QBO {method} {path} failed ({resp.status_code})",
            status_code=resp.status_code,
            body=body_text,
        )

    if resp.status_code == 204 or not resp.content:
        return None
    content_type = resp.headers.get("Content-Type", "")
    if "application/json" in content_type:
        return resp.json()
    return resp.content


async def qbo_query(session: AsyncSession, sql: str) -> list[dict[str, Any]]:
    """Run a QBO query. Auto-paginates. `sql` must NOT include STARTPOSITION/MAXRESULTS."""
    results: list[dict[str, Any]] = []
    start = 1
    page = 1000
    while True:
        full = f"{sql} STARTPOSITION {start} MAXRESULTS {page}"
        data = await _request(session, "GET", "/query", params={"query": full})
        qr = (data or {}).get("QueryResponse", {}) if isinstance(data, dict) else {}
        # QBO returns the entity under the entity's class name, e.g. {"Vendor": [...]}
        batch: list[dict[str, Any]] = []
        for key, value in qr.items():
            if isinstance(value, list) and key not in {"startPosition", "maxResults", "totalCount"}:
                batch = value
                break
        results.extend(batch)
        if len(batch) < page:
            break
        start += page
    return results


async def create_bill(session: AsyncSession, payload: dict[str, Any]) -> dict[str, Any]:
    return await _request(session, "POST", "/bill", json_body=payload)


async def upload_attachable_for_bill(
    session: AsyncSession,
    *,
    bill_id: str,
    pdf_bytes: bytes,
    filename: str,
    invoice_uuid: UUID | str | None = None,
) -> dict[str, Any]:
    """Upload a PDF as an Attachable linked to the given Bill.

    QBO's /upload endpoint takes a multipart body with two parts:
      1. file_metadata_0 (application/json): the Attachable definition
      2. file_content_0 (application/pdf): the raw bytes
    """
    attachable = {
        "AttachableRef": [
            {"EntityRef": {"type": "Bill", "value": bill_id}, "IncludeOnSend": False}
        ],
        "FileName": filename,
        "ContentType": "application/pdf",
        "Note": f"Auto-uploaded via Cambridge Invoice Portal (invoice={invoice_uuid})",
    }
    import json as _json

    files = {
        "file_metadata_0": (None, _json.dumps(attachable), "application/json"),
        "file_content_0": (filename, pdf_bytes, "application/pdf"),
    }
    return await _request(session, "POST", "/upload", files=files)


async def fetch_expense_accounts(session: AsyncSession) -> list[dict[str, Any]]:
    """Return active accounts of type Expense / CostOfGoodsSold for the account picker."""
    return await qbo_query(
        session,
        "SELECT * FROM Account WHERE Active = true AND "
        "AccountType IN ('Expense', 'Other Expense', 'Cost of Goods Sold')",
    )
