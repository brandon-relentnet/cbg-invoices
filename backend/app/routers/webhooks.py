"""Inbound webhooks (Postmark)."""
from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(tags=["webhooks"])


@router.get("/health")
async def webhooks_health() -> dict:
    return {"status": "ok"}
