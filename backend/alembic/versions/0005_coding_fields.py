"""add Cambridge coding fields to invoices

Adds the four AP-markup fields that Cambridge's team writes on each PDF
before posting: job_number, cost_code, coding_date, approver. Index on
job_number so the queue can filter "all invoices for job X" quickly.

Revision ID: 0005_coding_fields
Revises: e5567ae56783
Create Date: 2026-04-29 16:30:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0005_coding_fields"
down_revision: Union[str, None] = "e5567ae56783"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "invoices",
        sa.Column("job_number", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "invoices",
        sa.Column("cost_code", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "invoices",
        sa.Column("coding_date", sa.Date(), nullable=True),
    )
    op.add_column(
        "invoices",
        sa.Column("approver", sa.String(length=64), nullable=True),
    )
    op.create_index(
        op.f("ix_invoices_job_number"),
        "invoices",
        ["job_number"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_invoices_job_number"), table_name="invoices")
    op.drop_column("invoices", "approver")
    op.drop_column("invoices", "coding_date")
    op.drop_column("invoices", "cost_code")
    op.drop_column("invoices", "job_number")
