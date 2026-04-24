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
    """Return up to `limit` users, newest first.

    Logto caps `page_size` — values over 100 return a 400
    `guard.invalid_pagination`. We clamp to 100 for safety. Cambridge's team
    will never have more than that; if it does, we'll add a pagination cursor.
    """
    capped = max(1, min(100, limit))
    data = await _request("GET", f"/api/users?page=1&page_size={capped}")
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
    *,
    email: str,
    name: str | None = None,
    password: str | None = None,
    custom_data: dict[str, Any] | None = None,
) -> LogtoUser:
    """Create a new user. Password is optional for magic-link-only accounts.

    `custom_data` is the free-form per-user metadata store in Logto. We use it
    to flag accounts that haven't set a password yet via the
    `needs_password` key so the UI can prompt on first sign-in.
    """
    body: dict[str, Any] = {"primaryEmail": email}
    if password:
        body["password"] = password
    if name:
        body["name"] = name
    if custom_data is not None:
        body["customData"] = custom_data
    data = await _request("POST", "/api/users", json=body)
    if not isinstance(data, dict):
        raise LogtoAdminError(f"Unexpected create_user response: {data!r}")
    return LogtoUser.from_api(data)


async def set_user_password(user_id: str, password: str) -> None:
    """Set/replace a user's password via Management API."""
    await _request(
        "PATCH",
        f"/api/users/{user_id}/password",
        json={"password": password},
    )


async def get_user_custom_data(user_id: str) -> dict[str, Any]:
    data = await _request("GET", f"/api/users/{user_id}/custom-data")
    if isinstance(data, dict):
        return data
    return {}


async def patch_user_custom_data(user_id: str, merge: dict[str, Any]) -> dict[str, Any]:
    """Merge keys into a user's customData. Does NOT replace — PATCH semantics."""
    data = await _request(
        "PATCH",
        f"/api/users/{user_id}/custom-data",
        json={"customData": merge},
    )
    if isinstance(data, dict):
        return data
    return {}


async def delete_user(user_id: str) -> None:
    await _request("DELETE", f"/api/users/{user_id}")


async def find_user_by_email(email: str) -> LogtoUser | None:
    """Look up an existing user by primary email. Case-insensitive."""
    # Logto's list endpoint supports a `search` query that matches across
    # several fields. Use it to find a candidate, then filter locally.
    from urllib.parse import quote

    data = await _request(
        "GET",
        f"/api/users?page=1&page_size=20&search={quote(email)}",
    )
    if not isinstance(data, list):
        return None
    email_lower = email.lower()
    for raw in data:
        if (raw.get("primaryEmail") or "").lower() == email_lower:
            return LogtoUser.from_api(raw)
    return None


# ──────────────────────────────────────────────────────────────────────────
# Roles
#
# We use Logto's native role system with three app roles:
#   - owner  : cannot be removed, can promote/demote anyone, can remove admins
#   - admin  : can invite/remove members, can promote members to admin
#   - member : can work with invoices, no team management
#
# Logto stores role names uppercased; we treat them case-insensitively at our
# boundary and canonicalize to lowercase for storage/comparison.
# ──────────────────────────────────────────────────────────────────────────

APP_ROLE_NAMES = ("owner", "admin", "member")


@dataclass
class LogtoRole:
    id: str
    name: str  # canonical lowercase
    description: str | None

    @classmethod
    def from_api(cls, raw: dict[str, Any]) -> "LogtoRole":
        return cls(
            id=raw["id"],
            name=(raw.get("name") or "").lower(),
            description=raw.get("description"),
        )


async def list_roles() -> list[LogtoRole]:
    data = await _request("GET", "/api/roles?page=1&page_size=100")
    if not isinstance(data, list):
        return []
    return [LogtoRole.from_api(r) for r in data]


async def ensure_app_roles() -> dict[str, LogtoRole]:
    """Create any missing owner/admin/member roles. Idempotent.

    Returns a mapping from canonical lowercase role name → LogtoRole.
    """
    existing = {r.name: r for r in await list_roles()}
    descriptions = {
        "owner":
            "Full control of the invoice portal. Cannot be removed by other "
            "team members. Can promote and demote admins.",
        "admin":
            "Can invite and remove members, and promote members to admin. "
            "Cannot remove or affect the owner.",
        "member":
            "Can review, approve, and post invoices. Cannot manage the team.",
    }
    for name in APP_ROLE_NAMES:
        if name in existing:
            continue
        try:
            data = await _request(
                "POST",
                "/api/roles",
                json={
                    "name": name,
                    "description": descriptions[name],
                    "type": "User",
                },
            )
        except LogtoAdminError as exc:
            # Duplicate name race (e.g., concurrent startup) — re-fetch.
            if exc.status_code == 422:
                continue
            raise
        if isinstance(data, dict):
            existing[name] = LogtoRole.from_api(data)
    # Final refresh to handle race cases
    if any(n not in existing for n in APP_ROLE_NAMES):
        existing = {r.name: r for r in await list_roles()}
    return existing


async def get_user_roles(user_id: str) -> list[LogtoRole]:
    data = await _request("GET", f"/api/users/{user_id}/roles?page=1&page_size=100")
    if not isinstance(data, list):
        return []
    return [LogtoRole.from_api(r) for r in data]


async def assign_user_role(user_id: str, role_id: str) -> None:
    """Add a role to a user. Idempotent — ignores 'already assigned' errors."""
    try:
        await _request(
            "POST",
            f"/api/users/{user_id}/roles",
            json={"roleIds": [role_id]},
        )
    except LogtoAdminError as exc:
        # 422 when the user already has that role — treat as success.
        if exc.status_code in (409, 422):
            return
        raise


async def remove_user_role(user_id: str, role_id: str) -> None:
    try:
        await _request("DELETE", f"/api/users/{user_id}/roles/{role_id}")
    except LogtoAdminError as exc:
        if exc.status_code == 404:
            return
        raise


async def user_app_role(user_id: str) -> str | None:
    """Return the canonical app role name for a user, or None if unset."""
    roles = await get_user_roles(user_id)
    for r in roles:
        if r.name in APP_ROLE_NAMES:
            return r.name
    return None


async def seed_initial_owner() -> str | None:
    """If no user currently holds 'owner', promote the longest-tenured user.

    Runs idempotently on backend startup. Returns the user id that was
    promoted, or None if no change was needed / no users exist yet.
    """
    users = await list_users(limit=100)
    if not users:
        return None
    # Sort oldest-first so the founding account becomes owner deterministically.
    users.sort(key=lambda u: u.created_at or 0)
    # Check if anyone already has owner.
    roles = await ensure_app_roles()
    owner_role = roles.get("owner")
    if owner_role is None:
        return None
    # Gather existing role assignments for each user (parallelizable, but small N).
    existing_owner: str | None = None
    for u in users:
        u_roles = await get_user_roles(u.id)
        if any(r.name == "owner" for r in u_roles):
            existing_owner = u.id
            break
    if existing_owner:
        log.info("Owner already set: %s", existing_owner)
        return None
    seed_user = users[0]
    log.warning(
        "No owner assigned — promoting %s (%s) to owner",
        seed_user.id,
        seed_user.primary_email,
    )
    await replace_user_app_role(seed_user.id, "owner")
    return seed_user.id


async def replace_user_app_role(user_id: str, role_name: str) -> None:
    """Ensure the user has exactly one of owner/admin/member.

    Removes the other app roles if present; adds the target role if missing.
    Leaves non-app roles (e.g., Logto built-ins) untouched.
    """
    target = role_name.lower()
    if target not in APP_ROLE_NAMES:
        raise ValueError(f"Unknown app role: {role_name}")
    roles_by_name = await ensure_app_roles()
    current = await get_user_roles(user_id)
    current_app_names = {r.name for r in current if r.name in APP_ROLE_NAMES}
    # Remove any app roles that aren't the target
    for role in current:
        if role.name in APP_ROLE_NAMES and role.name != target:
            await remove_user_role(user_id, role.id)
    # Add the target if missing
    if target not in current_app_names:
        await assign_user_role(user_id, roles_by_name[target].id)


async def create_one_time_token(
    *, email: str, expires_in_seconds: int = 7 * 24 * 3600
) -> str:
    """Create a one-time token tied to an email.

    Used for magic-link sign-in during invites. Returns the raw token string;
    store it briefly in the invite URL and let Logto's Experience API consume
    it when the user follows the link.
    """
    body = {
        "email": email,
        "expiresIn": expires_in_seconds,
        # Required by Logto's schema even when empty
        "context": {"jitOrganizationIds": []},
    }
    data = await _request("POST", "/api/one-time-tokens", json=body)
    if not isinstance(data, dict) or "token" not in data:
        raise LogtoAdminError(f"Unexpected one-time-token response: {data!r}")
    return data["token"]
