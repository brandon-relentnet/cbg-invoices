"""Vendor DTOs."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class VendorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    qbo_id: str | None = None
    display_name: str
    email: str | None = None
    active: bool
    last_synced_at: datetime | None = None
