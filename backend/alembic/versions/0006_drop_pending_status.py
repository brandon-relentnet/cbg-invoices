"""drop the pending invoice status

The pending status was added in 0003 as a workflow stage between
ready_for_review and approved, but in practice it created confusion
without adding clarity. The new mental model is:

    Need Review (unassigned) → Assigned (in flight) → Approved → (Archived)

with assignment as the workflow signal instead of a dedicated status.

This migration:
  1. Folds any existing pending rows back into ready_for_review so they
     re-enter the active queue.
  2. Recreates the CHECK constraint on invoices.status without 'pending'.

Revision ID: 0006_drop_pending_status
Revises: 0005_coding_fields
Create Date: 2026-04-29 21:00:00.000000
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0006_drop_pending_status"
down_revision: Union[str, None] = "0005_coding_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Status values BEFORE this migration ran (i.e. with pending)
OLD_STATUS_VALUES = (
    "received",
    "extracting",
    "extraction_failed",
    "ready_for_review",
    "approved",
    "posted_to_qbo",
    "rejected",
    "pending",
)
# Status values AFTER this migration runs
NEW_STATUS_VALUES = (
    "received",
    "extracting",
    "extraction_failed",
    "ready_for_review",
    "approved",
    "posted_to_qbo",
    "rejected",
)


def _status_check_expr(values: tuple[str, ...]) -> str:
    quoted = ",".join(f"'{v}'" for v in values)
    return f"status IN ({quoted})"


def upgrade() -> None:
    # 1. Fold any pending rows back into ready_for_review so they don't
    #    violate the new constraint and so the work doesn't get lost.
    op.execute(
        "UPDATE invoices SET status = 'ready_for_review' WHERE status = 'pending'"
    )

    # 2. Recreate CHECK constraint without 'pending'.
    op.execute(
        "ALTER TABLE invoices DROP CONSTRAINT ck_invoices_ck_invoices_status"
    )
    op.execute(
        f"ALTER TABLE invoices ADD CONSTRAINT ck_invoices_ck_invoices_status "
        f"CHECK ({_status_check_expr(NEW_STATUS_VALUES)})"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE invoices DROP CONSTRAINT ck_invoices_ck_invoices_status"
    )
    op.execute(
        f"ALTER TABLE invoices ADD CONSTRAINT ck_invoices_ck_invoices_status "
        f"CHECK ({_status_check_expr(OLD_STATUS_VALUES)})"
    )
    # We can't recover which rows were originally pending — leave them
    # at ready_for_review on downgrade.
