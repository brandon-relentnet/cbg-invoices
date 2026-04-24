"""Read-only project endpoints (writes happen via QBO sync)."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.deps import CurrentUser, get_current_user
from app.models.project import Project
from app.schemas.project import ProjectOut

router = APIRouter(tags=["projects"])


@router.get("")
async def list_projects(
    _user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    result = await session.execute(
        select(Project).where(Project.active.is_(True)).order_by(Project.display_name)
    )
    rows = result.scalars().all()
    return {"projects": [ProjectOut.model_validate(r) for r in rows]}
