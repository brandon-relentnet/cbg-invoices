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
from dataclasses import dataclass
from typing import Any

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


async def verify_access_token(token: str) -> VerifiedToken:
    """Validate a Logto access token. Raises jwt.* on invalid tokens.

    Note: self-hosted Logto access tokens are JWTs. Profile claims like email
    and name are *not* included by default — they live in the ID token, which
    the frontend reads via getIdTokenClaims(). The backend doesn't need them
    for correctness; sub is the stable user identifier. email/name here are
    purely informational and will usually be None.
    """
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

    return VerifiedToken(
        sub=sub,
        email=decoded.get("email"),
        name=decoded.get("name") or decoded.get("username"),
        scopes=scopes,
        raw_claims=decoded,
    )
