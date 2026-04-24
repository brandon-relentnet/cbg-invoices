"""QuickBooks Online DTOs."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class QboStatus(BaseModel):
    connected: bool
    realm_id: str | None = None
    expires_at: datetime | None = None
    refresh_expires_at: datetime | None = None
    last_vendor_sync_at: datetime | None = None
    last_project_sync_at: datetime | None = None
    project_source: str = "Customer"
    default_expense_account_id: str | None = None


class QboAuthUrl(BaseModel):
    url: str


class QboSettingsPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    project_source: str | None = None  # Customer | Class
    default_expense_account_id: str | None = None  # QBO account id (empty string → clear)


class QboExpenseAccount(BaseModel):
    id: str
    name: str
    account_type: str | None = None
    account_sub_type: str | None = None
