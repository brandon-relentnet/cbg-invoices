"""Read-only vendor endpoints (writes happen via QBO sync)."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.deps import CurrentUser, get_current_user
from app.models.vendor import Vendor
from app.schemas.vendor import VendorOut

router = APIRouter(tags=["vendors"])


@router.get("")
async def list_vendors(
    _user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    result = await session.execute(
        select(Vendor).where(Vendor.active.is_(True)).order_by(Vendor.display_name)
    )
    rows = result.scalars().all()
    return {"vendors": [VendorOut.model_validate(r) for r in rows]}
