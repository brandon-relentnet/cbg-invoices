"""Invoice model — the central entity."""
from __future__ import annotations

import enum
from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db import Base


class InvoiceStatus(str, enum.Enum):
    RECEIVED = "received"
    EXTRACTING = "extracting"
    EXTRACTION_FAILED = "extraction_failed"
    READY_FOR_REVIEW = "ready_for_review"
    PENDING = "pending"
    APPROVED = "approved"
    POSTED_TO_QBO = "posted_to_qbo"
    REJECTED = "rejected"


class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Source
    source: Mapped[str] = mapped_column(String(16), nullable=False)  # email | upload
    sender_email: Mapped[str | None] = mapped_column(String(256), nullable=True)
    email_subject: Mapped[str | None] = mapped_column(String(512), nullable=True)
    email_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    email_message_id: Mapped[str | None] = mapped_column(
        String(256), unique=True, nullable=True, index=True
    )
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # PDF
    pdf_storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    pdf_filename: Mapped[str] = mapped_column(String(512), nullable=False)
    pdf_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    pdf_page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Status
    # values_callable forces SQLAlchemy to store the enum *value* (e.g. "received")
    # instead of the *name* (e.g. "RECEIVED"). This matches the CHECK constraint
    # in the initial migration and keeps the stored strings human-readable.
    status: Mapped[InvoiceStatus] = mapped_column(
        SAEnum(
            InvoiceStatus,
            name="invoice_status",
            native_enum=False,
            length=32,
            values_callable=lambda enum_cls: [m.value for m in enum_cls],
        ),
        nullable=False,
        default=InvoiceStatus.RECEIVED,
        index=True,
    )
    extraction_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Extracted fields (editable by PM)
    vendor_name: Mapped[str | None] = mapped_column(String(512), nullable=True, index=True)
    vendor_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True
    )
    invoice_number: Mapped[str | None] = mapped_column(String(128), nullable=True)
    invoice_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    subtotal_cents: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    tax_cents: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    total_cents: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="USD")
    po_number: Mapped[str | None] = mapped_column(String(128), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    line_items: Mapped[list[dict]] = mapped_column(JSONB, nullable=False, default=list)

    # Cambridge AP coding markup (typically written/stamped on the PDF by AP
    # before posting). All optional — extraction may miss them, PMs fill in
    # via the review form.
    job_number: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    cost_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    coding_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    approver: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Project assignment
    project_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )

    # Review
    reviewed_by: Mapped[str | None] = mapped_column(String(256), nullable=True)
    reviewed_by_email: Mapped[str | None] = mapped_column(String(256), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # QBO posting
    qbo_bill_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    qbo_posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    qbo_post_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Assignment (visibility only — anyone can still act on the invoice)
    assigned_to_id: Mapped[str | None] = mapped_column(String(256), nullable=True, index=True)
    assigned_to_email: Mapped[str | None] = mapped_column(String(256), nullable=True)
    assigned_to_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
