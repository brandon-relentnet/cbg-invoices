"""Read-only audit log endpoint."""
from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.deps import CurrentUser, get_current_user
from app.models.audit_log import AuditLog
from app.schemas.audit import AuditLogListResponse, AuditLogOut

router = APIRouter(tags=["audit"])


@router.get("", response_model=AuditLogListResponse)
async def list_audit(
    _user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    invoice_id: UUID | None = None,
    actor_id: str | None = None,
    action: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    stmt = select(AuditLog)
    count_stmt = select(func.count(AuditLog.id))

    if invoice_id:
        stmt = stmt.where(AuditLog.invoice_id == invoice_id)
        count_stmt = count_stmt.where(AuditLog.invoice_id == invoice_id)
    if actor_id:
        stmt = stmt.where(AuditLog.actor_id == actor_id)
        count_stmt = count_stmt.where(AuditLog.actor_id == actor_id)
    if action:
        stmt = stmt.where(AuditLog.action == action)
        count_stmt = count_stmt.where(AuditLog.action == action)

    total = (await session.execute(count_stmt)).scalar_one()
    stmt = (
        stmt.order_by(desc(AuditLog.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await session.execute(stmt)).scalars().all()
    return AuditLogListResponse(
        logs=[AuditLogOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )
