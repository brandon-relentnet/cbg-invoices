"""Access request endpoints.

Public:
    POST /api/access-requests
        Anyone can submit. Light per-IP throttling. Idempotent on email
        (resubmitting from the same email refreshes the existing pending
        row's message + timestamp instead of stacking).

Admin (admin or owner role):
    GET  /api/access-requests          - list with pending count
    POST /api/access-requests/{id}/approve   - kick off invite + close
    POST /api/access-requests/{id}/dismiss   - close without inviting
"""
from __future__ import annotations

import logging
import time
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.deps import CurrentUser, get_current_user
from app.models.access_request import AccessRequest, AccessRequestStatus
from app.schemas.access_request import (
    AccessRequestCreate,
    AccessRequestListResponse,
    AccessRequestOut,
)
from app.services import logto_admin
from app.services.invitations import InviteActor, invite_email

log = logging.getLogger(__name__)
router = APIRouter(tags=["access-requests"])


# ──────────────────────────────────────────────────────────────────────────
# In-memory rate limiter — sufficient for our scale; reset per process boot
# ──────────────────────────────────────────────────────────────────────────

_RATE_LIMIT_WINDOW_SECONDS = 60 * 60  # 1 hour
_RATE_LIMIT_MAX_PER_KEY = 5
_recent_submissions: dict[str, list[float]] = {}


def _check_rate_limit(key: str) -> bool:
    """Return True if the request should be allowed, False if it's over the cap."""
    now = time.time()
    window_start = now - _RATE_LIMIT_WINDOW_SECONDS
    history = [t for t in _recent_submissions.get(key, []) if t > window_start]
    if len(history) >= _RATE_LIMIT_MAX_PER_KEY:
        _recent_submissions[key] = history
        return False
    history.append(now)
    _recent_submissions[key] = history
    return True


# ──────────────────────────────────────────────────────────────────────────
# Authorization helper — duplicated locally to avoid circular import on users.py
# ──────────────────────────────────────────────────────────────────────────


_ROLE_RANK: dict[str, int] = {"owner": 3, "admin": 2, "member": 1}


async def _require_admin(user_id: str) -> Literal["admin", "owner"]:
    role = await logto_admin.user_app_role(user_id) or "member"
    if _ROLE_RANK.get(role, 0) < _ROLE_RANK["admin"]:
        raise HTTPException(
            status_code=403,
            detail=f"Requires admin role — you're {role}",
        )
    return role  # type: ignore[return-value]


# ──────────────────────────────────────────────────────────────────────────
# Public submission
# ──────────────────────────────────────────────────────────────────────────


@router.post("", response_model=AccessRequestOut, status_code=status.HTTP_201_CREATED)
async def create_access_request(
    body: AccessRequestCreate,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    email_lower = body.email.strip().lower()
    client_ip = (request.client.host if request.client else "") or "unknown"

    # Throttle by both IP and email so a single bad actor can't flood us
    if not _check_rate_limit(f"ip:{client_ip}") or not _check_rate_limit(f"em:{email_lower}"):
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Try again later.",
        )

    # Idempotent on a pending row for the same email — refresh the message.
    existing_q = (
        select(AccessRequest)
        .where(AccessRequest.email == email_lower)
        .where(AccessRequest.status == AccessRequestStatus.PENDING)
        .order_by(desc(AccessRequest.created_at))
        .limit(1)
    )
    existing = (await session.execute(existing_q)).scalars().first()

    if existing:
        # Refresh in-place so the admin sees the latest context
        if body.name and not existing.name:
            existing.name = body.name
        if body.message:
            existing.message = body.message
        existing.source_ip = client_ip
        ua = request.headers.get("user-agent")
        if ua:
            existing.user_agent = ua[:512]
        await session.flush()
        await session.refresh(existing)
        log.info("Refreshed existing pending access request for %s", email_lower)
        return AccessRequestOut.model_validate(existing)

    new_req = AccessRequest(
        email=email_lower,
        name=body.name,
        message=body.message,
        status=AccessRequestStatus.PENDING,
        source_ip=client_ip,
        user_agent=(request.headers.get("user-agent") or "")[:512] or None,
    )
    session.add(new_req)
    await session.flush()
    await session.refresh(new_req)
    log.info("New access request: %s", email_lower)
    return AccessRequestOut.model_validate(new_req)


# ──────────────────────────────────────────────────────────────────────────
# Admin queue
# ──────────────────────────────────────────────────────────────────────────


@router.get("", response_model=AccessRequestListResponse)
async def list_access_requests(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    include_resolved: bool = False,
):
    await _require_admin(user.id)

    q = select(AccessRequest).order_by(desc(AccessRequest.created_at))
    if not include_resolved:
        q = q.where(AccessRequest.status == AccessRequestStatus.PENDING)
    rows = (await session.execute(q)).scalars().all()

    pending_count = (
        await session.execute(
            select(func.count(AccessRequest.id)).where(
                AccessRequest.status == AccessRequestStatus.PENDING
            )
        )
    ).scalar() or 0

    return AccessRequestListResponse(
        requests=[AccessRequestOut.model_validate(r) for r in rows],
        pending_count=int(pending_count),
    )


@router.post("/{request_id}/approve", response_model=AccessRequestOut)
async def approve_access_request(
    request_id: UUID,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Convert an access request into a real invite + close it."""
    await _require_admin(user.id)

    row = await session.get(AccessRequest, request_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Access request not found")
    if row.status != AccessRequestStatus.PENDING:
        raise HTTPException(
            status_code=409,
            detail=f"Already {row.status.value} — nothing to do",
        )

    try:
        await invite_email(
            actor=InviteActor(id=user.id, email=user.email, name=user.name),
            email=row.email,
            name=row.name,
        )
    except logto_admin.LogtoAdminNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except logto_admin.LogtoAdminError as exc:
        log.exception("Approve failed for access request %s", request_id)
        raise HTTPException(
            status_code=exc.status_code or 502, detail=str(exc)
        ) from exc

    row.status = AccessRequestStatus.APPROVED
    row.handled_by_id = user.id
    row.handled_by_email = user.email
    from datetime import UTC, datetime as _dt

    row.handled_at = _dt.now(UTC)
    await session.flush()
    await session.refresh(row)
    return AccessRequestOut.model_validate(row)


@router.post("/{request_id}/dismiss", response_model=AccessRequestOut)
async def dismiss_access_request(
    request_id: UUID,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Mark an access request as dismissed without sending an invite."""
    await _require_admin(user.id)

    row = await session.get(AccessRequest, request_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Access request not found")
    if row.status != AccessRequestStatus.PENDING:
        raise HTTPException(
            status_code=409,
            detail=f"Already {row.status.value} — nothing to do",
        )

    row.status = AccessRequestStatus.DISMISSED
    row.handled_by_id = user.id
    row.handled_by_email = user.email
    from datetime import UTC, datetime as _dt

    row.handled_at = _dt.now(UTC)
    await session.flush()
    await session.refresh(row)
    return AccessRequestOut.model_validate(row)
