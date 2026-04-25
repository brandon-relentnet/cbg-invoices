"""add access_requests table

Revision ID: e5567ae56783
Revises: 0003_pending_and_assign
Create Date: 2026-04-25 19:08:24.204869

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e5567ae56783"
down_revision: Union[str, None] = "0003_pending_and_assign"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "access_requests",
        sa.Column("id", sa.Uuid(), nullable=False),
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
        sa.Column("email", sa.String(length=256), nullable=False),
        sa.Column("name", sa.String(length=256), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=16),
            server_default="pending",
            nullable=False,
        ),
        sa.Column("handled_by_id", sa.String(length=256), nullable=True),
        sa.Column("handled_by_email", sa.String(length=256), nullable=True),
        sa.Column("handled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_ip", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_access_requests")),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'dismissed')",
            name=op.f("ck_access_requests_status"),
        ),
    )
    op.create_index(
        op.f("ix_access_requests_created_at"),
        "access_requests",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_access_requests_email"),
        "access_requests",
        ["email"],
        unique=False,
    )
    op.create_index(
        op.f("ix_access_requests_status"),
        "access_requests",
        ["status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_access_requests_status"), table_name="access_requests")
    op.drop_index(op.f("ix_access_requests_email"), table_name="access_requests")
    op.drop_index(op.f("ix_access_requests_created_at"), table_name="access_requests")
    op.drop_table("access_requests")
