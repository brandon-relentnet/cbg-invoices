"""coding options table — admin-managed dropdown values for AP markup

Adds the `coding_options` table that stores the curated list of
job numbers, cost codes, and approvers admins/owners create in
Settings. PMs pick from these in the review form, but custom
free-text values are still allowed.

Revision ID: 0007_coding_options
Revises: 0006_drop_pending_status
Create Date: 2026-04-29 23:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0007_coding_options"
down_revision: Union[str, None] = "0006_drop_pending_status"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "coding_options",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
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
        sa.Column("field", sa.String(length=32), nullable=False),
        sa.Column("value", sa.String(length=128), nullable=False),
        sa.Column("label", sa.String(length=256), nullable=True),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "field IN ('job_number', 'cost_code', 'approver')",
            name="ck_coding_options_field",
        ),
        sa.UniqueConstraint("field", "value", name="uq_coding_options_field_value"),
    )
    op.create_index(
        "ix_coding_options_field",
        "coding_options",
        ["field"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_coding_options_field", table_name="coding_options")
    op.drop_table("coding_options")
