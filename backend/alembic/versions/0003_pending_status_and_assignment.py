"""Add 'pending' status and invoice assignment fields.

Revision ID: 0003_pending_status_and_assignment
Revises: 0002_qbo_default_expense_account
Create Date: 2026-04-24 21:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_pending_and_assign"
down_revision: Union[str, None] = "0002_expense_account"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


OLD_STATUS_VALUES = (
    "received",
    "extracting",
    "extraction_failed",
    "ready_for_review",
    "approved",
    "posted_to_qbo",
    "rejected",
)
NEW_STATUS_VALUES = OLD_STATUS_VALUES + ("pending",)


def _status_check_expr(values: tuple[str, ...]) -> str:
    quoted = ",".join(f"'{v}'" for v in values)
    return f"status IN ({quoted})"


def upgrade() -> None:
    # Recreate the CHECK constraint with the new allowed value.
    # Using raw SQL so we can match the exact constraint name that the initial
    # migration created (the SQLAlchemy naming convention doubled the prefix
    # into "ck_invoices_ck_invoices_status").
    op.execute(
        "ALTER TABLE invoices DROP CONSTRAINT ck_invoices_ck_invoices_status"
    )
    op.execute(
        f"ALTER TABLE invoices ADD CONSTRAINT ck_invoices_ck_invoices_status "
        f"CHECK ({_status_check_expr(NEW_STATUS_VALUES)})"
    )

    # Assignment columns — "who should handle this invoice"
    op.add_column(
        "invoices",
        sa.Column("assigned_to_id", sa.String(256), nullable=True),
    )
    op.add_column(
        "invoices",
        sa.Column("assigned_to_email", sa.String(256), nullable=True),
    )
    op.add_column(
        "invoices",
        sa.Column("assigned_to_name", sa.String(256), nullable=True),
    )
    op.add_column(
        "invoices",
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_invoices_assigned_to_id",
        "invoices",
        ["assigned_to_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_invoices_assigned_to_id", table_name="invoices")
    op.drop_column("invoices", "assigned_at")
    op.drop_column("invoices", "assigned_to_name")
    op.drop_column("invoices", "assigned_to_email")
    op.drop_column("invoices", "assigned_to_id")

    op.execute(
        "ALTER TABLE invoices DROP CONSTRAINT ck_invoices_ck_invoices_status"
    )
    op.execute(
        f"ALTER TABLE invoices ADD CONSTRAINT ck_invoices_ck_invoices_status "
        f"CHECK ({_status_check_expr(OLD_STATUS_VALUES)})"
    )
