"""Initial schema.

Revision ID: 0001_initial
Revises:
Create Date: 2025-01-01 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


INVOICE_STATUS_VALUES = (
    "received",
    "extracting",
    "extraction_failed",
    "ready_for_review",
    "approved",
    "posted_to_qbo",
    "rejected",
)


def upgrade() -> None:
    op.create_table(
        "vendors",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("qbo_id", sa.String(64), nullable=True),
        sa.Column("display_name", sa.String(512), nullable=False),
        sa.Column("email", sa.String(256), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_vendors"),
        sa.UniqueConstraint("qbo_id", name="uq_vendors_qbo_id"),
    )
    op.create_index("ix_vendors_qbo_id", "vendors", ["qbo_id"])
    op.create_index("ix_vendors_display_name", "vendors", ["display_name"])

    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("qbo_id", sa.String(64), nullable=False),
        sa.Column("qbo_type", sa.String(32), nullable=False),
        sa.Column("display_name", sa.String(512), nullable=False),
        sa.Column("parent_qbo_id", sa.String(64), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_projects"),
        sa.UniqueConstraint("qbo_id", name="uq_projects_qbo_id"),
    )
    op.create_index("ix_projects_qbo_id", "projects", ["qbo_id"])
    op.create_index("ix_projects_display_name", "projects", ["display_name"])

    op.create_table(
        "invoices",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("source", sa.String(16), nullable=False),
        sa.Column("sender_email", sa.String(256), nullable=True),
        sa.Column("email_subject", sa.String(512), nullable=True),
        sa.Column("email_body", sa.Text(), nullable=True),
        sa.Column("email_message_id", sa.String(256), nullable=True),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("pdf_storage_key", sa.String(512), nullable=False),
        sa.Column("pdf_filename", sa.String(512), nullable=False),
        sa.Column("pdf_size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("pdf_page_count", sa.Integer(), nullable=True),
        sa.Column(
            "status",
            sa.String(32),
            nullable=False,
            server_default=sa.text("'received'"),
        ),
        sa.Column("extraction_error", sa.Text(), nullable=True),
        sa.Column("vendor_name", sa.String(512), nullable=True),
        sa.Column("vendor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("invoice_number", sa.String(128), nullable=True),
        sa.Column("invoice_date", sa.Date(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("subtotal_cents", sa.BigInteger(), nullable=True),
        sa.Column("tax_cents", sa.BigInteger(), nullable=True),
        sa.Column("total_cents", sa.BigInteger(), nullable=True),
        sa.Column("currency", sa.String(8), nullable=False, server_default=sa.text("'USD'")),
        sa.Column("po_number", sa.String(128), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "line_items",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reviewed_by", sa.String(256), nullable=True),
        sa.Column("reviewed_by_email", sa.String(256), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("qbo_bill_id", sa.String(64), nullable=True),
        sa.Column("qbo_posted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("qbo_post_error", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_invoices"),
        sa.UniqueConstraint("email_message_id", name="uq_invoices_email_message_id"),
        sa.ForeignKeyConstraint(
            ["vendor_id"], ["vendors.id"], name="fk_invoices_vendor_id_vendors", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name="fk_invoices_project_id_projects",
            ondelete="SET NULL",
        ),
        sa.CheckConstraint(
            "status IN ('received','extracting','extraction_failed','ready_for_review','approved','posted_to_qbo','rejected')",
            name="ck_invoices_status",
        ),
    )
    op.create_index("ix_invoices_email_message_id", "invoices", ["email_message_id"])
    op.create_index("ix_invoices_status", "invoices", ["status"])
    op.create_index("ix_invoices_vendor_name", "invoices", ["vendor_name"])
    op.create_index("ix_invoices_qbo_bill_id", "invoices", ["qbo_bill_id"])
    op.create_index("ix_invoices_received_at", "invoices", ["received_at"])

    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("actor_id", sa.String(256), nullable=False),
        sa.Column("actor_email", sa.String(256), nullable=True),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("before", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("after", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_audit_logs"),
        sa.ForeignKeyConstraint(
            ["invoice_id"],
            ["invoices.id"],
            name="fk_audit_logs_invoice_id_invoices",
            ondelete="SET NULL",
        ),
    )
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])
    op.create_index("ix_audit_logs_actor_id", "audit_logs", ["actor_id"])
    op.create_index("ix_audit_logs_invoice_id", "audit_logs", ["invoice_id"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])

    op.create_table(
        "qbo_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("realm_id", sa.String(64), nullable=False),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("refresh_token", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("refresh_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_vendor_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_project_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "project_source",
            sa.String(16),
            nullable=False,
            server_default=sa.text("'Customer'"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_qbo_tokens"),
        sa.CheckConstraint("id = 1", name="ck_qbo_tokens_singleton"),
    )


def downgrade() -> None:
    op.drop_table("qbo_tokens")
    op.drop_index("ix_audit_logs_action", table_name="audit_logs")
    op.drop_index("ix_audit_logs_invoice_id", table_name="audit_logs")
    op.drop_index("ix_audit_logs_actor_id", table_name="audit_logs")
    op.drop_index("ix_audit_logs_created_at", table_name="audit_logs")
    op.drop_table("audit_logs")
    op.drop_index("ix_invoices_received_at", table_name="invoices")
    op.drop_index("ix_invoices_qbo_bill_id", table_name="invoices")
    op.drop_index("ix_invoices_vendor_name", table_name="invoices")
    op.drop_index("ix_invoices_status", table_name="invoices")
    op.drop_index("ix_invoices_email_message_id", table_name="invoices")
    op.drop_table("invoices")
    op.drop_index("ix_projects_display_name", table_name="projects")
    op.drop_index("ix_projects_qbo_id", table_name="projects")
    op.drop_table("projects")
    op.drop_index("ix_vendors_display_name", table_name="vendors")
    op.drop_index("ix_vendors_qbo_id", table_name="vendors")
    op.drop_table("vendors")
