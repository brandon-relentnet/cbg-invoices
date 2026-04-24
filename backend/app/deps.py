"""FastAPI dependencies — stubbed for now, filled in phase 3 with Logto JWT verification."""
from __future__ import annotations

from dataclasses import dataclass

from fastapi import Header, HTTPException, status


@dataclass
class CurrentUser:
    id: str
    email: str | None
    name: str | None


async def get_current_user(
    authorization: str | None = Header(default=None),
) -> CurrentUser:
    """Placeholder that becomes full JWKS verification in phase 3."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # Phase 3 fills this in properly
    return CurrentUser(id="stub", email=None, name=None)
