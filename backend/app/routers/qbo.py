"""QuickBooks Online OAuth + sync."""
from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(tags=["qbo"])


@router.get("/status")
async def status() -> dict:
    return {"connected": False}
