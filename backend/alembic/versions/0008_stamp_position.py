"""per-invoice stamp position + size

Adds a JSONB `stamp_position` column to invoices that stores where on
page 1 the AP-coding stamp should land when the QBO attachment is
generated. The shape is:

    {"x": float, "y": float, "width": float}

where each value is a FRACTION of the page (0–1):
  - x: distance from page left edge to the stamp's left edge
  - y: distance from page TOP edge to the stamp's top edge (top-anchored
       so it matches how the user thinks; the stamp service converts to
       PDF's bottom-anchored coordinate system internally)
  - width: stamp width as a fraction of the page width. Height is
           derived from the stamp's natural aspect ratio.

NULL means "use the default" (top-right corner with 24pt margin), which
preserves the behavior of every invoice posted before this column existed.

Revision ID: 0008_stamp_position
Revises: 0007_coding_options
Create Date: 2026-04-29 23:30:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "0008_stamp_position"
down_revision: Union[str, None] = "0007_coding_options"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "invoices",
        sa.Column("stamp_position", JSONB, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("invoices", "stamp_position")
