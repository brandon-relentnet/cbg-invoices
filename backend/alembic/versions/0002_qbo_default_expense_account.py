"""Add default_expense_account_id to qbo_tokens

Revision ID: 0002_expense_account
Revises: 0001_initial
Create Date: 2026-04-24

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0002_expense_account"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "qbo_tokens",
        sa.Column("default_expense_account_id", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("qbo_tokens", "default_expense_account_id")
