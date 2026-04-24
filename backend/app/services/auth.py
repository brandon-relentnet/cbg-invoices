"""Logto JWT verification.

The frontend receives tokens via Logto and forwards them as Bearer tokens.
We verify:
  1. Signature via JWKS from {LOGTO_INTERNAL_URL or LOGTO_ENDPOINT}/oidc/jwks.
     The JWKS fetch is a server-to-server call, so in Docker dev it must use
     the internal service hostname (http://logto:3001), not localhost.
  2. Issuer matches {LOGTO_ENDPOINT}/oidc. This MUST be the public URL
     because Logto signs that value into the token's `iss` claim.
  3. Audience contains our API resource indicator.
  4. Token not expired.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any

import httpx
import jwt
from jwt import PyJWKClient

from app.config import get_settings

log = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class VerifiedToken:
    sub: str
    email: str | None
    name: str | None
    scopes: list[str]
    raw_claims: dict[str, Any]


class _JwksCache:
    """Thin wrapper around PyJWKClient with a shared singleton."""

    def __init__(self, jwks_uri: str):
        self._client = PyJWKClient(jwks_uri, cache_keys=True, lifespan=3600)

    def get_signing_key(self, token: str):
        return self._client.get_signing_key_from_jwt(token).key


_jwks: _JwksCache | None = None
_jwks_uri: str | None = None


def _ensure_jwks() -> _JwksCache:
    global _jwks, _jwks_uri
    uri = f"{settings.logto_internal_endpoint.rstrip('/')}/oidc/jwks"
    if _jwks is None or _jwks_uri != uri:
        log.info("Initializing JWKS client for %s", uri)
        _jwks = _JwksCache(uri)
        _jwks_uri = uri
    return _jwks


# ------- Lightweight user-info lookup (optional, best-effort) -------

_userinfo_cache: dict[str, tuple[float, dict[str, Any]]] = {}


async def _fetch_userinfo(access_token: str) -> dict[str, Any] | None:
    """Fetch /oidc/me for profile claims not in the JWT. Cached for 5 min."""
    cached = _userinfo_cache.get(access_token)
    if cached and cached[0] > time.time():
        return cached[1]
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{settings.logto_internal_endpoint.rstrip('/')}/oidc/me",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if resp.status_code == 200:
                data = resp.json()
                _userinfo_cache[access_token] = (time.time() + 300, data)
                return data
    except Exception as exc:
        log.warning("userinfo fetch failed: %s", exc)
    return None


async def verify_access_token(token: str) -> VerifiedToken:
    """Validate a Logto access token. Raises jwt.* on invalid tokens."""
    jwks = _ensure_jwks()
    signing_key = jwks.get_signing_key(token)

    issuer = f"{settings.logto_endpoint.rstrip('/')}/oidc"
    audience = settings.logto_resource

    decoded = jwt.decode(
        token,
        signing_key,
        algorithms=["ES384", "RS256"],
        audience=audience,
        issuer=issuer,
        options={"require": ["exp", "iat", "sub"]},
    )

    sub = decoded["sub"]
    scopes_val = decoded.get("scope") or decoded.get("scp") or ""
    scopes = scopes_val.split() if isinstance(scopes_val, str) else list(scopes_val)

    email = decoded.get("email")
    name = decoded.get("name") or decoded.get("username")

    # If profile fields weren't in the token, try /oidc/me once.
    if not email or not name:
        info = await _fetch_userinfo(token)
        if info:
            email = email or info.get("email")
            name = name or info.get("name") or info.get("username")

    return VerifiedToken(
        sub=sub,
        email=email,
        name=name,
        scopes=scopes,
        raw_claims=decoded,
    )
