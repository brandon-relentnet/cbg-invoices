"""Stamp the Cambridge AP coding markup onto an invoice PDF.

The Cambridge AP team historically writes (or stamps) the four coding
fields — job number, cost code, coding date, approver — into a small
boxed area on the first page of each vendor invoice. This service
reproduces that markup digitally so the PDF attached to the QBO Bill
already carries the codes baked in.

Approach
--------
We do NOT modify the page contents. Instead we:

  1. Build a small one-page PDF ("stamp overlay") with reportlab that's
     the same size as the original page and contains nothing but the
     stamp box drawn at top-right.
  2. Use pypdf's ``page.merge_page()`` to composite the overlay onto the
     original first page. Existing page content remains intact and
     selectable.
  3. Write out the merged document; subsequent pages pass through unchanged.

If anything goes wrong (encrypted PDF, malformed bytes, weird mediabox)
we fall back to returning the original PDF unmodified — better to attach
an unstamped invoice to QBO than to fail the whole posting flow. The
failure is audit-logged by the caller.
"""
from __future__ import annotations

import asyncio
import io
import logging
from dataclasses import dataclass
from datetime import date

from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import Color
from reportlab.pdfgen import canvas

log = logging.getLogger(__name__)


# Cambridge brand colors (matching the portal CSS tokens). reportlab uses
# 0.0–1.0 RGB.
COLOR_NAVY = Color(11 / 255, 27 / 255, 37 / 255)
COLOR_AMBER = Color(200 / 255, 146 / 255, 60 / 255)
COLOR_WHITE = Color(1, 1, 1)


@dataclass(frozen=True)
class StampFields:
    """The four AP-markup values, all required by the time we stamp."""

    job_number: str
    cost_code: str
    coding_date: date
    approver: str


def has_required_fields(
    job_number: str | None,
    cost_code: str | None,
    coding_date: date | None,
    approver: str | None,
) -> bool:
    """All four fields must be non-empty for the stamp to be generated."""
    return bool(
        (job_number or "").strip()
        and (cost_code or "").strip()
        and coding_date
        and (approver or "").strip()
    )


async def stamp_invoice_pdf(
    pdf_bytes: bytes,
    fields: StampFields,
) -> bytes:
    """Return a new PDF byte string with the stamp baked onto page 1.

    Runs the heavy reportlab + pypdf work in a worker thread so the asyncio
    loop stays free.
    """
    return await asyncio.to_thread(_stamp_sync, pdf_bytes, fields)


def _stamp_sync(pdf_bytes: bytes, fields: StampFields) -> bytes:
    """Synchronous body — only call via asyncio.to_thread()."""
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
    except Exception as exc:  # noqa: BLE001
        log.warning("Failed to read PDF for stamping: %s", exc)
        return pdf_bytes

    if reader.is_encrypted:
        # We don't currently support stamping encrypted PDFs. Skip gracefully.
        log.warning("Refusing to stamp encrypted PDF — returning original")
        return pdf_bytes

    if len(reader.pages) == 0:
        log.warning("PDF has zero pages, nothing to stamp")
        return pdf_bytes

    first = reader.pages[0]
    try:
        page_w = float(first.mediabox.width)
        page_h = float(first.mediabox.height)
    except Exception as exc:  # noqa: BLE001
        log.warning("Could not read page dimensions: %s", exc)
        return pdf_bytes

    overlay = _build_overlay_page(page_w, page_h, fields)
    if overlay is None:
        return pdf_bytes

    try:
        first.merge_page(overlay)
    except Exception as exc:  # noqa: BLE001
        log.warning("merge_page failed: %s — returning unstamped PDF", exc)
        return pdf_bytes

    writer = PdfWriter()
    writer.add_page(first)
    for page in reader.pages[1:]:
        writer.add_page(page)

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def _build_overlay_page(page_w: float, page_h: float, fields: StampFields):
    """Produce a single-page PDF (as a pypdf PageObject) drawing only the stamp.

    Returns None on any reportlab failure.
    """
    try:
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=(page_w, page_h))

        # Stamp dimensions / position. Top-right corner with a margin.
        # PDF coordinate origin is BOTTOM-LEFT, y grows up.
        box_w = 220
        box_h = 96
        margin_x = 24
        margin_y = 24

        x = page_w - box_w - margin_x
        y = page_h - box_h - margin_y

        # Box: white fill so the page content underneath doesn't bleed
        # through, navy stroke for the brand outline.
        c.setStrokeColor(COLOR_NAVY)
        c.setFillColor(COLOR_WHITE)
        c.setLineWidth(1.4)
        c.rect(x, y, box_w, box_h, stroke=1, fill=1)

        # Header strip — small amber band at the top of the stamp with
        # "CAMBRIDGE / AP CODING" small caps. Reads like a real stamp.
        header_h = 16
        c.setFillColor(COLOR_AMBER)
        c.rect(x, y + box_h - header_h, box_w, header_h, stroke=0, fill=1)
        c.setFillColor(COLOR_NAVY)
        c.setFont("Helvetica-Bold", 7)
        c.drawString(x + 8, y + box_h - header_h + 5, "CAMBRIDGE")
        c.drawRightString(
            x + box_w - 8, y + box_h - header_h + 5, "AP CODING"
        )

        # Field rows. Use a fixed-width font so values line up like a stamp.
        c.setFillColor(COLOR_NAVY)
        c.setFont("Helvetica-Bold", 7)

        rows = [
            ("JOB #", fields.job_number),
            ("COST CD", fields.cost_code),
            ("DATE", fields.coding_date.strftime("%m/%d/%y")),
            ("APPROVED", fields.approver),
        ]

        # Each row gets one line. Vertical spacing computed so they're
        # evenly distributed within the box minus header.
        body_top = y + box_h - header_h - 8
        line_height = 16
        label_x = x + 8
        value_x = x + 70

        for i, (label, value) in enumerate(rows):
            row_y = body_top - i * line_height
            c.setFont("Helvetica-Bold", 7)
            c.setFillColor(COLOR_NAVY)
            c.drawString(label_x, row_y, label)
            c.setFont("Courier", 9)
            c.drawString(value_x, row_y, _truncate(value, 24))

        c.save()
        overlay_reader = PdfReader(io.BytesIO(buf.getvalue()))
        return overlay_reader.pages[0]
    except Exception as exc:  # noqa: BLE001
        log.warning("Failed to build stamp overlay: %s", exc)
        return None


def _truncate(text: str, max_chars: int) -> str:
    text = (text or "").strip()
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 1] + "…"
