"""Invoice list/detail/actions."""
from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(tags=["invoices"])


@router.get("")
async def list_invoices() -> dict:
    return {"invoices": [], "total": 0}
