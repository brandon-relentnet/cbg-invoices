"""Pydantic schemas for access requests."""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class AccessRequestCreate(BaseModel):
    """Public submission payload from the landing page form."""

    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    name: str | None = Field(default=None, max_length=256)
    message: str | None = Field(default=None, max_length=2000)


class AccessRequestOut(BaseModel):
    """Response shape for admin queue + public submission echo."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime
    email: str
    name: str | None
    message: str | None
    status: Literal["pending", "approved", "dismissed"]
    handled_by_id: str | None
    handled_by_email: str | None
    handled_at: datetime | None


class AccessRequestListResponse(BaseModel):
    requests: list[AccessRequestOut]
    pending_count: int
