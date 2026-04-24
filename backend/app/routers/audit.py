"""Audit log endpoints."""
from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(tags=["audit"])


@router.get("")
async def list_audit_logs() -> dict:
    return {"logs": []}
