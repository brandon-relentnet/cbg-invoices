"""Allowlist of email domains we trust as legitimate invoice senders.

Domains arrive in this table from three sources:

  - ``qbo_sync``: extracted from a QBO vendor's email field whenever
    ``sync_vendors`` runs. Auto-managed; admins can't delete these
    (they reappear on the next sync).
  - ``manual``: an admin added the domain via Settings → Trusted email
    domains. Free-form, owned by the admin.
  - ``promoted_from_triage``: the operator clicked "Trust sender +
    promote" on a triage row. Same lifecycle as ``manual``.

Lookups are case-insensitive on the registrable form (eTLD+1) so
``billing.silvercote.com`` and ``accountspayable@silvercote.com`` both
match a single entry of ``silvercote.com``. Domain extraction lives in
``app/services/trusted_domains.py``.
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db import Base


# Lock down the ``source`` column to known values via a DB-level CHECK.
SOURCE_VALUES: tuple[str, ...] = ("qbo_sync", "manual", "promoted_from_triage")


class TrustedSenderDomain(Base):
    __tablename__ = "trusted_sender_domains"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Registrable form, lowercase, no leading dot, no scheme.
    # e.g. ``silvercote.com``, ``cambridgebg.com``, ``acme.co.uk``.
    domain: Mapped[str] = mapped_column(String(253), unique=True, nullable=False, index=True)

    # See module docstring for the three sources.
    source: Mapped[str] = mapped_column(String(32), nullable=False)

    # Backref to the QBO vendor whose email contributed this domain.
    # NULL when source != qbo_sync. Set NULL on vendor delete so we
    # don't lose the trust just because the vendor row got removed.
    qbo_vendor_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("vendors.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Logto user id of the admin who manually added this entry. NULL
    # for source=qbo_sync. Audit trail for how the entry got there.
    added_by_id: Mapped[str | None] = mapped_column(String(256), nullable=True)
    added_by_email: Mapped[str | None] = mapped_column(String(256), nullable=True)

    # Free-form context — e.g. why an admin trusts this domain
    # (subcontractor, vendor without QBO record, etc).
    notes: Mapped[str | None] = mapped_column(String(512), nullable=True)

    __table_args__ = (
        CheckConstraint(
            f"source IN ({','.join(repr(v) for v in SOURCE_VALUES)})",
            name="ck_trusted_sender_domains_source",
        ),
    )
