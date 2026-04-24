"""Audit log DTOs."""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    actor_id: str
    actor_email: str | None = None
    invoice_id: UUID | None = None
    action: str
    before: dict[str, Any] | None = None
    after: dict[str, Any] | None = None
    message: str | None = None


class AuditLogListResponse(BaseModel):
    logs: list[AuditLogOut]
    total: int
    page: int
    page_size: int
