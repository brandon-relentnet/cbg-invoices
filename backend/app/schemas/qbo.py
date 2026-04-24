"""QuickBooks Online DTOs."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class QboStatus(BaseModel):
    connected: bool
    realm_id: str | None = None
    expires_at: datetime | None = None
    refresh_expires_at: datetime | None = None
    last_vendor_sync_at: datetime | None = None
    last_project_sync_at: datetime | None = None
    project_source: str = "Customer"


class QboAuthUrl(BaseModel):
    url: str


class QboSettingsPatch(BaseModel):
    project_source: str | None = None  # Customer | Class
