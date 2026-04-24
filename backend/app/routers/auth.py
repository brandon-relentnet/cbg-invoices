"""Auth helpers exposed as API endpoints (e.g. /me)."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.deps import CurrentUser, get_current_user

router = APIRouter(tags=["auth"])


@router.get("/me")
async def me(user: CurrentUser = Depends(get_current_user)) -> dict:
    return {"id": user.id, "email": user.email, "name": user.name}
