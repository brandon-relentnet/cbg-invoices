"""DTOs for the trusted-sender-domain admin API."""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TrustedDomainOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    domain: str
    source: Literal["qbo_sync", "manual", "promoted_from_triage"]
    qbo_vendor_id: UUID | None = None
    added_by_id: str | None = None
    added_by_email: str | None = None
    notes: str | None = None
    created_at: datetime


class TrustedDomainCreate(BaseModel):
    """Request body for POST /api/trusted-domains.

    Accepts a raw email address or a bare hostname; the server pulls
    the registrable domain out of whatever you give it. Notes are
    optional context shown in the admin UI.
    """

    model_config = ConfigDict(extra="forbid")

    domain: str = Field(min_length=1, max_length=253)
    notes: str | None = Field(default=None, max_length=512)


class TrustedDomainListResponse(BaseModel):
    domains: list[TrustedDomainOut]
    counts: dict[str, int]  # by source: {"qbo_sync": N, "manual": N, ...}
