"""Admin CRUD for the email trusted-sender allowlist.

Routes:

  GET    /api/trusted-domains       — list (admin+)
  POST   /api/trusted-domains       — add a manual entry (admin+)
  DELETE /api/trusted-domains/{id}  — remove a manual entry (admin+).
                                       qbo_sync entries refuse with 409.

The allowlist is auto-populated from QBO vendor emails on every
``sync_vendors`` run; this router covers the manual-management path
plus the read-side used by the Settings page.
"""
from __future__ import annotations

import logging
from collections import Counter
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.deps import CurrentUser, get_current_user
from app.routers.users import ROLE_RANK, _get_actor_role
from app.schemas.trusted_domain import (
    TrustedDomainCreate,
    TrustedDomainListResponse,
    TrustedDomainOut,
)
from app.services import audit, trusted_domains as svc

log = logging.getLogger(__name__)
router = APIRouter(tags=["trusted-domains"])


async def _require_admin(actor: CurrentUser) -> None:
    role = await _get_actor_role(actor.id)
    if ROLE_RANK[role] < ROLE_RANK["admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires admin role — you're {role}",
        )


@router.get("", response_model=TrustedDomainListResponse)
async def list_trusted_domains(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TrustedDomainListResponse:
    await _require_admin(user)
    rows = await svc.list_domains(session)
    counts = Counter(row.source for row in rows)
    return TrustedDomainListResponse(
        domains=[TrustedDomainOut.model_validate(row) for row in rows],
        counts=dict(counts),
    )


@router.post(
    "",
    response_model=TrustedDomainOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_trusted_domain(
    body: TrustedDomainCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TrustedDomainOut:
    await _require_admin(user)
    try:
        row = await svc.upsert_manual(
            session,
            domain=body.domain,
            actor_id=user.id,
            actor_email=user.email,
            notes=body.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    await audit.record(
        session,
        actor_id=user.id,
        actor_email=user.email,
        action="sender_trusted",
        message=f"domain={row.domain} source={row.source}",
    )
    await session.commit()
    return TrustedDomainOut.model_validate(row)


@router.delete("/{domain_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_trusted_domain(
    domain_id: UUID,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    await _require_admin(user)
    try:
        row = await svc.remove_manual(session, domain_id)
    except ValueError as exc:
        # qbo_sync rows refuse to be manually removed.
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")

    await audit.record(
        session,
        actor_id=user.id,
        actor_email=user.email,
        action="sender_untrusted",
        message=f"domain={row.domain} source={row.source}",
    )
    await session.commit()
