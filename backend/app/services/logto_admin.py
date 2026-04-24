"""Logto Management API client for user administration.

Uses the M2M application credentials configured during logto_setup.py. Tokens
are fetched on demand and cached until shortly before expiry.

Required env:
    LOGTO_M2M_APP_ID
    LOGTO_M2M_APP_SECRET

The Management API resource indicator for self-hosted Logto is the constant
`MGMT_API_RESOURCE` below.
"""
from __future__ import annotations

import logging
import secrets
import string
import time
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)

MGMT_API_RESOURCE = "https://default.logto.app/api"
# Refresh the access token when it's within this buffer of expiry
TOKEN_REFRESH_BUFFER_SECONDS = 60


class LogtoAdminError(Exception):
    """Raised when the Management API returns an unexpected response."""

    def __init__(self, message: str, status_code: int | None = None, body: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


class LogtoAdminNotConfigured(LogtoAdminError):
    """Raised when M2M credentials haven't been set."""


@dataclass
class _TokenCache:
    access_token: str
    expires_at: float  # epoch seconds


_token_cache: _TokenCache | None = None


async def _get_mgmt_token(client: httpx.AsyncClient) -> str:
    """Fetch a Management API token via client credentials. Cached in-process."""
    global _token_cache
    settings = get_settings()
    if not settings.logto_m2m_app_id or not settings.logto_m2m_app_secret:
        raise LogtoAdminNotConfigured(
            "LOGTO_M2M_APP_ID / LOGTO_M2M_APP_SECRET are not set. Run `make logto-setup` "
            "after creating the Bootstrap M2M app in the Logto admin console."
        )

    now = time.time()
    if _token_cache and _token_cache.expires_at - TOKEN_REFRESH_BUFFER_SECONDS > now:
        return _token_cache.access_token

    log.info("Fetching new Logto Management API token")
    token_url = f"{settings.logto_internal_endpoint.rstrip('/')}/oidc/token"
    resp = await client.post(
        token_url,
        data={
            "grant_type": "client_credentials",
            "resource": MGMT_API_RESOURCE,
            "scope": "all",
        },
        auth=(settings.logto_m2m_app_id, settings.logto_m2m_app_secret),
    )
    if resp.status_code != 200:
        raise LogtoAdminError(
            f"Failed to fetch Logto Management token: {resp.text}",
            status_code=resp.status_code,
            body=resp.text,
        )
    payload = resp.json()
    _token_cache = _TokenCache(
        access_token=payload["access_token"],
        expires_at=now + int(payload.get("expires_in", 3600)),
    )
    return _token_cache.access_token


async def _request(method: str, path: str, **kwargs: Any) -> Any:
    settings = get_settings()
    base = settings.logto_internal_endpoint.rstrip("/")
    async with httpx.AsyncClient(timeout=10.0) as client:
        token = await _get_mgmt_token(client)
        headers = kwargs.pop("headers", {}) or {}
        headers["Authorization"] = f"Bearer {token}"
        resp = await client.request(method, f"{base}{path}", headers=headers, **kwargs)
    if resp.status_code >= 400:
        body: Any
        try:
            body = resp.json()
        except ValueError:
            body = resp.text
        raise LogtoAdminError(
            f"Logto {method} {path} failed ({resp.status_code}): {body!r}",
            status_code=resp.status_code,
            body=body,
        )
    if resp.status_code == 204 or not resp.content:
        return None
    return resp.json()


# ---------- Public API ----------


@dataclass
class LogtoUser:
    id: str
    primary_email: str | None
    name: str | None
    username: str | None
    created_at: int  # epoch ms from Logto
    last_sign_in_at: int | None

    @classmethod
    def from_api(cls, raw: dict[str, Any]) -> "LogtoUser":
        return cls(
            id=raw["id"],
            primary_email=raw.get("primaryEmail"),
            name=raw.get("name"),
            username=raw.get("username"),
            created_at=raw.get("createdAt", 0),
            last_sign_in_at=raw.get("lastSignInAt"),
        )


async def list_users(*, limit: int = 100) -> list[LogtoUser]:
    """Return up to `limit` users, newest first. No pagination cursor yet."""
    data = await _request("GET", f"/api/users?page=1&page_size={limit}")
    if not isinstance(data, list):
        return []
    # Logto returns newest first by default
    return [LogtoUser.from_api(u) for u in data]


async def get_user(user_id: str) -> LogtoUser | None:
    try:
        data = await _request("GET", f"/api/users/{user_id}")
    except LogtoAdminError as exc:
        if exc.status_code == 404:
            return None
        raise
    return LogtoUser.from_api(data) if isinstance(data, dict) else None


def _generate_temp_password(length: int = 16) -> str:
    """Generate a password that satisfies Logto's default policy.

    Logto defaults require at least 8 chars, mixed case, digit, and symbol.
    """
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    # Guarantee one of each class, then fill the rest randomly
    parts = [
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.digits),
        secrets.choice("!@#$%^&*"),
    ]
    parts.extend(secrets.choice(alphabet) for _ in range(length - len(parts)))
    secrets.SystemRandom().shuffle(parts)
    return "".join(parts)


async def create_user(
    *, email: str, name: str | None = None, password: str | None = None
) -> tuple[LogtoUser, str]:
    """Create a new user. Returns the user and the generated/provided password.

    The caller is responsible for sharing the password with the new user —
    Logto doesn't send invite emails by default in self-hosted mode.
    """
    temp_password = password or _generate_temp_password()
    body: dict[str, Any] = {
        "primaryEmail": email,
        "password": temp_password,
    }
    if name:
        body["name"] = name
    data = await _request("POST", "/api/users", json=body)
    if not isinstance(data, dict):
        raise LogtoAdminError(f"Unexpected create_user response: {data!r}")
    return LogtoUser.from_api(data), temp_password


async def delete_user(user_id: str) -> None:
    await _request("DELETE", f"/api/users/{user_id}")
