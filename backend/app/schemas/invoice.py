"""Invoice DTOs."""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.invoice import InvoiceStatus


class LineItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    description: str
    quantity: float | None = None
    unit_price_cents: int | None = None
    amount_cents: int | None = None


class ExtractedFields(BaseModel):
    """Raw extraction payload from the LLM."""

    model_config = ConfigDict(extra="ignore")

    vendor_name: str | None = None
    vendor_address: str | None = None
    invoice_number: str | None = None
    invoice_date: date | None = None
    due_date: date | None = None
    po_number: str | None = None
    subtotal_cents: int | None = None
    tax_cents: int | None = None
    total_cents: int | None = None
    currency: str = "USD"
    line_items: list[LineItem] = Field(default_factory=list)
    notes: str | None = None
    confidence: Literal["high", "medium", "low"] = "medium"


class _InvoiceBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime
    source: str
    sender_email: str | None = None
    email_subject: str | None = None
    received_at: datetime
    pdf_filename: str
    pdf_size_bytes: int
    pdf_page_count: int | None = None
    status: InvoiceStatus
    extraction_error: str | None = None

    vendor_name: str | None = None
    vendor_id: UUID | None = None
    invoice_number: str | None = None
    invoice_date: date | None = None
    due_date: date | None = None
    subtotal_cents: int | None = None
    tax_cents: int | None = None
    total_cents: int | None = None
    currency: str = "USD"
    po_number: str | None = None
    notes: str | None = None
    line_items: list[LineItem] = Field(default_factory=list)

    project_id: UUID | None = None

    reviewed_by: str | None = None
    reviewed_by_email: str | None = None
    reviewed_at: datetime | None = None

    qbo_bill_id: str | None = None
    qbo_posted_at: datetime | None = None
    qbo_post_error: str | None = None

    assigned_to_id: str | None = None
    assigned_to_email: str | None = None
    assigned_to_name: str | None = None
    assigned_at: datetime | None = None


class InvoiceListItem(_InvoiceBase):
    """Summary fields for the queue list."""


class InvoiceDetail(_InvoiceBase):
    email_body: str | None = None
    pdf_url: str | None = None


class InvoiceListResponse(BaseModel):
    invoices: list[InvoiceListItem]
    total: int
    page: int
    page_size: int


class InvoicePatch(BaseModel):
    """Editable fields on the review interface."""

    model_config = ConfigDict(extra="forbid")

    vendor_name: str | None = None
    vendor_id: UUID | None = None
    invoice_number: str | None = None
    invoice_date: date | None = None
    due_date: date | None = None
    subtotal_cents: int | None = None
    tax_cents: int | None = None
    total_cents: int | None = None
    currency: str | None = None
    po_number: str | None = None
    notes: str | None = None
    line_items: list[LineItem] | None = None
    project_id: UUID | None = None


class RejectInvoiceRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=1024)


class AssignInvoiceRequest(BaseModel):
    """Assign an invoice to a specific user for visibility.

    Does NOT gate permissions — anyone can still approve/reject. This is
    primarily for queue organization and personal accountability.
    """

    user_id: str = Field(min_length=1, max_length=256)
    user_email: str | None = Field(default=None, max_length=256)
    user_name: str | None = Field(default=None, max_length=256)
