"""Post an approved invoice to QuickBooks Online as a Bill with PDF attached.

Implementation lands in phase 8. This stub exists so the approve endpoint
can enqueue a BackgroundTask even before QBO integration is complete.
"""
from __future__ import annotations

import logging
from uuid import UUID

log = logging.getLogger(__name__)


async def post_bill(invoice_id: UUID) -> None:
    log.warning(
        "qbo_posting.post_bill is a stub — invoice %s not posted to QBO until phase 8",
        invoice_id,
    )
