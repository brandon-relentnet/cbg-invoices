"""Project endpoints."""
from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(tags=["projects"])


@router.get("")
async def list_projects() -> dict:
    return {"projects": []}
