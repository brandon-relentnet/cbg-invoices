"""Vendor endpoints."""
from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(tags=["vendors"])


@router.get("")
async def list_vendors() -> dict:
    return {"vendors": []}
