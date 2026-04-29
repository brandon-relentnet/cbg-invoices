"""Invoice field extraction via Claude vision.

Pipeline:
  1. Mark invoice EXTRACTING.
  2. Download PDF from R2.
  3. Render first N pages to PNGs (cap at 4 for cost control).
  4. Call Claude messages API with vision + extraction prompt.
  5. Parse JSON, validate with ExtractedFields.
  6. Fuzzy-match vendor name to an existing Vendor row (case-insensitive).
  7. Persist, set status READY_FOR_REVIEW.
  8. On any failure: set EXTRACTION_FAILED with error message, audit.
"""
from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
from typing import Any
from uuid import UUID

from anthropic import AsyncAnthropic
from pdf2image import convert_from_bytes
from PIL import Image
from rapidfuzz import fuzz, process as fuzz_process
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import AsyncSessionLocal
from app.models.invoice import Invoice, InvoiceStatus
from app.models.vendor import Vendor
from app.prompts.invoice_extraction import EXTRACTION_PROMPT
from app.schemas.invoice import ExtractedFields
from app.services import audit, storage

log = logging.getLogger(__name__)

MAX_PAGES = 4
TARGET_WIDTH_PX = 2048
MAX_TOKENS = 4096
# Cap simultaneous extractions to keep memory pressure predictable. Each
# render can spike to ~150–250MB during PDF→PNG conversion; running more
# than two at once on a small Coolify container often triggers OOM.
_EXTRACTION_SEMAPHORE = asyncio.Semaphore(2)


async def extract_invoice(invoice_id: UUID) -> None:
    """Top-level entrypoint run in a BackgroundTask. Opens its own session."""
    async with _EXTRACTION_SEMAPHORE, AsyncSessionLocal() as session:
        try:
            await _run(session, invoice_id)
            await session.commit()
        except Exception as exc:
            log.exception("Extraction failed for %s", invoice_id)
            await session.rollback()
            # Record the failure on a fresh session so it persists
            async with AsyncSessionLocal() as s2:
                inv = await s2.get(Invoice, invoice_id)
                if inv:
                    inv.status = InvoiceStatus.EXTRACTION_FAILED
                    inv.extraction_error = str(exc)[:2000]
                    await audit.record_system(
                        s2,
                        action="extraction_failed",
                        invoice_id=invoice_id,
                        message=str(exc)[:2000],
                    )
                    await s2.commit()


async def _run(session: AsyncSession, invoice_id: UUID) -> None:
    invoice = await session.get(Invoice, invoice_id)
    if invoice is None:
        log.warning("Invoice %s not found for extraction", invoice_id)
        return

    if invoice.status not in {InvoiceStatus.RECEIVED, InvoiceStatus.EXTRACTION_FAILED}:
        log.info("Invoice %s already processed (status=%s)", invoice_id, invoice.status)
        return

    invoice.status = InvoiceStatus.EXTRACTING
    invoice.extraction_error = None
    await session.flush()
    await audit.record_system(
        session, action="extraction_started", invoice_id=invoice_id
    )

    pdf_bytes = await storage.download_pdf(invoice.pdf_storage_key)
    # _render_pages spawns poppler subprocesses + Pillow resize work that
    # would block the asyncio loop for 5–30s. asyncio.to_thread keeps it
    # off the event loop so requests served by the same process keep flowing.
    page_images = await asyncio.to_thread(_render_pages, pdf_bytes)
    if not invoice.pdf_page_count:
        invoice.pdf_page_count = len(page_images)

    result = await _call_claude(page_images)
    fields = ExtractedFields.model_validate(result)

    # Match vendor
    vendor_id: UUID | None = None
    if fields.vendor_name:
        vendor_id = await _match_vendor(session, fields.vendor_name)

    invoice.vendor_name = fields.vendor_name
    invoice.vendor_id = vendor_id
    invoice.invoice_number = fields.invoice_number
    invoice.invoice_date = fields.invoice_date
    invoice.due_date = fields.due_date
    invoice.po_number = fields.po_number
    invoice.subtotal_cents = fields.subtotal_cents
    invoice.tax_cents = fields.tax_cents
    invoice.total_cents = fields.total_cents
    invoice.currency = fields.currency or "USD"
    invoice.notes = fields.notes
    invoice.line_items = [li.model_dump() for li in fields.line_items]
    # Cambridge AP coding markup (may all be null for un-coded invoices)
    invoice.job_number = fields.job_number
    invoice.cost_code = fields.cost_code
    invoice.coding_date = fields.coding_date
    invoice.approver = fields.approver
    invoice.status = InvoiceStatus.READY_FOR_REVIEW

    await audit.record_system(
        session,
        action="extraction_completed",
        invoice_id=invoice_id,
        after={
            "vendor_name": fields.vendor_name,
            "invoice_number": fields.invoice_number,
            "total_cents": fields.total_cents,
            "line_items": len(fields.line_items),
            "job_number": fields.job_number,
            "cost_code": fields.cost_code,
            "approver": fields.approver,
            "confidence": fields.confidence,
        },
        message=f"confidence={fields.confidence}",
    )
    log.info("Extracted invoice %s (vendor=%s, total=%s)", invoice_id, fields.vendor_name, fields.total_cents)


def _render_pages(pdf_bytes: bytes) -> list[bytes]:
    """Render up to MAX_PAGES pages at TARGET_WIDTH_PX wide, returning PNG bytes.

    Runs in a worker thread (asyncio.to_thread) — never call directly from an
    async function. The intermediate PIL images are released aggressively to
    keep peak memory bounded.
    """
    # Render at 110 DPI which is a noticeable memory savings vs 150 DPI for
    # equivalent extraction quality; we resample down to TARGET_WIDTH_PX
    # afterwards anyway.
    images: list[Image.Image] = convert_from_bytes(
        pdf_bytes, dpi=110, last_page=MAX_PAGES, fmt="ppm"
    )
    out: list[bytes] = []
    for img in images:
        try:
            if img.width > TARGET_WIDTH_PX:
                ratio = TARGET_WIDTH_PX / img.width
                new_size = (TARGET_WIDTH_PX, int(img.height * ratio))
                resized = img.resize(new_size, Image.Resampling.LANCZOS)
                img.close()
                img = resized
            if img.mode != "RGB":
                converted = img.convert("RGB")
                img.close()
                img = converted
            buf = io.BytesIO()
            img.save(buf, format="PNG", optimize=True)
            out.append(buf.getvalue())
        finally:
            img.close()
    return out


async def _call_claude(page_images: list[bytes]) -> dict[str, Any]:
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not configured")

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    content: list[dict[str, Any]] = []
    for idx, png in enumerate(page_images, start=1):
        content.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": base64.b64encode(png).decode("ascii"),
                },
            }
        )
        content.append({"type": "text", "text": f"Page {idx} of {len(page_images)}"})
    content.append({"type": "text", "text": EXTRACTION_PROMPT})

    resp = await client.messages.create(
        model=settings.extraction_model,
        max_tokens=MAX_TOKENS,
        messages=[{"role": "user", "content": content}],
    )

    text_parts = [block.text for block in resp.content if block.type == "text"]
    raw = "\n".join(text_parts).strip()
    # Strip code fences if the model slips and uses them
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.lower().startswith("json"):
            raw = raw[4:].lstrip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Claude returned non-JSON output: {exc}\n---\n{raw[:500]}")


async def _match_vendor(session: AsyncSession, vendor_name: str) -> UUID | None:
    """Case-insensitive fuzzy match against existing Vendor rows.

    Returns a vendor_id only when the best match scores >= 85; otherwise None
    so the PM can pick / create manually.
    """
    result = await session.execute(select(Vendor).where(Vendor.active.is_(True)))
    vendors = result.scalars().all()
    if not vendors:
        return None

    choices = {v.id: v.display_name for v in vendors}
    best = fuzz_process.extractOne(
        vendor_name,
        choices,
        scorer=fuzz.WRatio,
    )
    if best is None:
        return None
    _name, score, vid = best  # rapidfuzz returns (choice, score, key)
    if score >= 85:
        return vid  # UUID
    return None
