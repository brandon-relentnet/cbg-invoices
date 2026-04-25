"""Access requests submitted from the public landing page.

A prospective user submits {email, name?, message?} via the unauthenticated
POST /api/access-requests endpoint. Admins/owners see the queue on the Team
page and can either Approve (which kicks off the existing invite-by-email
flow with a one-time-token magic link) or Dismiss (mark resolved without
inviting).
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Enum as SAEnum, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class AccessRequestStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    DISMISSED = "dismissed"


class AccessRequest(Base):
    __tablename__ = "access_requests"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    email: Mapped[str] = mapped_column(String(256), nullable=False, index=True)
    name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[AccessRequestStatus] = mapped_column(
        SAEnum(
            AccessRequestStatus,
            native_enum=False,
            length=16,
            values_callable=lambda cls: [m.value for m in cls],
        ),
        default=AccessRequestStatus.PENDING,
        nullable=False,
        index=True,
    )

    # When approved, who handled it + when. We don't FK this anywhere — the
    # actor is a Logto user id, not a row in our DB.
    handled_by_id: Mapped[str | None] = mapped_column(String(256), nullable=True)
    handled_by_email: Mapped[str | None] = mapped_column(String(256), nullable=True)
    handled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Submitter context for spam/abuse review (we don't surface these in the UI
    # by default but they're useful in the audit trail).
    source_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
