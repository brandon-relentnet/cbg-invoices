"""Project DTOs."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    qbo_id: str
    qbo_type: str
    display_name: str
    parent_qbo_id: str | None = None
    active: bool
    last_synced_at: datetime | None = None
