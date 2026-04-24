"""FastAPI dependencies — JWT verification against Logto."""
from __future__ import annotations

import logging
from dataclasses import dataclass

import jwt
from fastapi import Header, HTTPException, status

from app.services.auth import verify_access_token

log = logging.getLogger(__name__)


@dataclass
class CurrentUser:
    id: str
    email: str | None
    name: str | None
    scopes: list[str]


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    authorization: str | None = Header(default=None),
) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise _unauthorized("Missing bearer token")

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise _unauthorized("Empty bearer token")

    try:
        verified = await verify_access_token(token)
    except jwt.ExpiredSignatureError:
        raise _unauthorized("Token expired")
    except jwt.InvalidAudienceError:
        raise _unauthorized("Invalid audience")
    except jwt.InvalidIssuerError:
        raise _unauthorized("Invalid issuer")
    except jwt.InvalidTokenError as exc:
        log.info("Invalid token: %s", exc)
        raise _unauthorized("Invalid token")
    except Exception as exc:
        log.exception("Token verification failed unexpectedly")
        raise _unauthorized(f"Token verification failed: {exc}")

    return CurrentUser(
        id=verified.sub,
        email=verified.email,
        name=verified.name,
        scopes=verified.scopes,
    )
