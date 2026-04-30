"""Pydantic schemas for the coding options API."""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


CodingField = Literal["job_number", "cost_code", "approver"]


class CodingOptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime
    field: CodingField
    value: str
    label: str | None = None
    active: bool


class CodingOptionListResponse(BaseModel):
    options: list[CodingOptionOut]


class CodingOptionCreate(BaseModel):
    """Admins/owners only."""

    model_config = ConfigDict(extra="forbid")

    field: CodingField
    value: str = Field(min_length=1, max_length=128)
    label: str | None = Field(default=None, max_length=256)


class CodingOptionPatch(BaseModel):
    """Admins/owners only. All fields optional."""

    model_config = ConfigDict(extra="forbid")

    value: str | None = Field(default=None, min_length=1, max_length=128)
    label: str | None = Field(default=None, max_length=256)
    active: bool | None = None
