"""email triage bucket — document_type, triage_reason, trusted_sender_domains

Adds the data model for the triage bucket workflow, where documents
that aren't confidently invoices (statements, quotes, order acks,
encrypted PDFs, body-only emails, low-confidence extractions) get
routed to a NEEDS_TRIAGE state instead of cluttering the main review
queue. See docs/superpowers/specs/2026-04-30-email-triage-design.md.

Three changes in this migration:

  1. invoices.status CHECK constraint adds 'needs_triage' as a valid
     value alongside the existing seven.
  2. invoices gains two new nullable enum columns:
       - document_type: invoice / statement / quote / order_ack /
                        receipt / supporting_doc / other / unknown
       - triage_reason: non_invoice / unknown_sender / body_rendered /
                        encrypted_pdf / low_confidence
     Both stored as VARCHAR(24) with CHECK constraints (matching the
     SAEnum(native_enum=False) pattern used elsewhere). NULL on
     existing rows — pre-feature invoices stay where they were.
  3. New trusted_sender_domains table — the email-domain allowlist
     used to decide whether a sender is "known". Combination of
     auto-synced QBO vendor emails + manual admin entries +
     domains promoted from triage actions.

Revision ID: 0009_email_triage_design
Revises: 0008_stamp_position
Create Date: 2026-04-30 10:30:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID as PgUUID


revision: str = "0009_email_triage_design"
down_revision: Union[str, None] = "0008_stamp_position"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Status values BEFORE this migration (matches 0006).
OLD_STATUS_VALUES = (
    "received",
    "extracting",
    "extraction_failed",
    "ready_for_review",
    "approved",
    "posted_to_qbo",
    "rejected",
)
# Status values AFTER this migration (adds needs_triage).
NEW_STATUS_VALUES = OLD_STATUS_VALUES + ("needs_triage",)

DOCUMENT_TYPE_VALUES = (
    "invoice",
    "statement",
    "quote",
    "order_ack",
    "receipt",
    "supporting_doc",
    "other",
    "unknown",
)
TRIAGE_REASON_VALUES = (
    "non_invoice",
    "unknown_sender",
    "body_rendered",
    "encrypted_pdf",
    "low_confidence",
)
TRUSTED_DOMAIN_SOURCES = ("qbo_sync", "manual", "promoted_from_triage")


def _check_expr(column: str, values: tuple[str, ...]) -> str:
    quoted = ",".join(f"'{v}'" for v in values)
    return f"{column} IN ({quoted})"


def upgrade() -> None:
    # ---- 1. Status check constraint: add needs_triage ---------------------
    # The constraint is named "ck_invoices_ck_invoices_status" because of
    # SQLAlchemy's naming convention (see alembic 0006 for context).
    op.execute("ALTER TABLE invoices DROP CONSTRAINT ck_invoices_ck_invoices_status")
    op.execute(
        f"ALTER TABLE invoices ADD CONSTRAINT ck_invoices_ck_invoices_status "
        f"CHECK ({_check_expr('status', NEW_STATUS_VALUES)})"
    )

    # ---- 2. New invoice columns ------------------------------------------
    op.add_column(
        "invoices",
        sa.Column("document_type", sa.String(length=24), nullable=True),
    )
    op.create_index(
        "ix_invoices_document_type",
        "invoices",
        ["document_type"],
    )
    op.create_check_constraint(
        "ck_invoices_document_type",
        "invoices",
        f"document_type IS NULL OR {_check_expr('document_type', DOCUMENT_TYPE_VALUES)}",
    )

    op.add_column(
        "invoices",
        sa.Column("triage_reason", sa.String(length=24), nullable=True),
    )
    op.create_check_constraint(
        "ck_invoices_triage_reason",
        "invoices",
        f"triage_reason IS NULL OR {_check_expr('triage_reason', TRIAGE_REASON_VALUES)}",
    )

    # ---- 3. trusted_sender_domains table ---------------------------------
    op.create_table(
        "trusted_sender_domains",
        sa.Column("id", PgUUID(as_uuid=True), primary_key=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("domain", sa.String(length=253), unique=True, nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column(
            "qbo_vendor_id",
            PgUUID(as_uuid=True),
            sa.ForeignKey("vendors.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("added_by_id", sa.String(length=256), nullable=True),
        sa.Column("added_by_email", sa.String(length=256), nullable=True),
        sa.Column("notes", sa.String(length=512), nullable=True),
        sa.CheckConstraint(
            _check_expr("source", TRUSTED_DOMAIN_SOURCES),
            name="ck_trusted_sender_domains_source",
        ),
    )
    op.create_index(
        "ix_trusted_sender_domains_domain",
        "trusted_sender_domains",
        ["domain"],
    )


def downgrade() -> None:
    # 3. Drop the trusted_sender_domains table
    op.drop_index("ix_trusted_sender_domains_domain", table_name="trusted_sender_domains")
    op.drop_table("trusted_sender_domains")

    # 2. Drop new invoice columns + their constraints
    op.drop_constraint("ck_invoices_triage_reason", "invoices", type_="check")
    op.drop_column("invoices", "triage_reason")

    op.drop_constraint("ck_invoices_document_type", "invoices", type_="check")
    op.drop_index("ix_invoices_document_type", table_name="invoices")
    op.drop_column("invoices", "document_type")

    # 1. Restore the previous status check (without needs_triage).
    # Note: any rows still in needs_triage will need to be re-routed
    # before this downgrade runs, otherwise the new CHECK fails.
    op.execute(
        "UPDATE invoices SET status = 'ready_for_review' WHERE status = 'needs_triage'"
    )
    op.execute("ALTER TABLE invoices DROP CONSTRAINT ck_invoices_ck_invoices_status")
    op.execute(
        f"ALTER TABLE invoices ADD CONSTRAINT ck_invoices_ck_invoices_status "
        f"CHECK ({_check_expr('status', OLD_STATUS_VALUES)})"
    )
