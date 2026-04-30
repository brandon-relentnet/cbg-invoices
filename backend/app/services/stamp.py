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


# Aspect ratio of the stamp box (width:height). Mirrors the visual
# proportions of the HTML preview the PM sees on the review screen.
_STAMP_ASPECT = 220 / 96  # ≈ 2.29


# Default placement when no per-invoice position is set: top-right
# corner with a 24pt margin, 220pt wide.
_DEFAULT_BOX_W = 220.0
_DEFAULT_BOX_H = _DEFAULT_BOX_W / _STAMP_ASPECT
_DEFAULT_MARGIN = 24.0


def _resolve_box(
    page_w: float,
    page_h: float,
    position: dict | None,
) -> tuple[float, float, float, float]:
    """Compute (x, y, w, h) in PDF points for the stamp box.

    PDF coordinates have origin at BOTTOM-LEFT (y grows up). The stored
    position uses a TOP-anchored y (matching how the user thinks). We
    convert here.

    `position` is the raw JSONB dict from the invoice row. Expected
    shape: {"x", "y", "width", "height"} with each value a fraction of
    the page (0–1, top-anchored). `height` is optional for backwards
    compat with rows written before free-aspect resize shipped — when
    missing, height is derived from the natural stamp aspect ratio.

    None = use defaults (top-right, default size).
    """
    if not position or "x" not in position or "y" not in position or "width" not in position:
        x = page_w - _DEFAULT_BOX_W - _DEFAULT_MARGIN
        y = page_h - _DEFAULT_BOX_H - _DEFAULT_MARGIN
        return x, y, _DEFAULT_BOX_W, _DEFAULT_BOX_H

    try:
        # Clamp dimensions to sensible ranges so an out-of-bounds value
        # (e.g. corrupt patch payload) can't render an invisible /
        # page-spanning stamp.
        width_frac = max(0.05, min(0.95, float(position["width"])))
        box_w = page_w * width_frac

        # Height: explicit if provided, else aspect-derived. The latter
        # preserves behavior for invoices stamped before this column
        # supported separate height.
        height_provided = "height" in position and position["height"] is not None
        if height_provided:
            height_frac = max(0.03, min(0.95, float(position["height"])))
            box_h = page_h * height_frac
        else:
            box_h = box_w / _STAMP_ASPECT

        # x is fraction of page width to the stamp's LEFT edge.
        x_frac = max(0.0, min(1.0 - width_frac, float(position["x"])))
        x = page_w * x_frac

        # y is fraction of page height from TOP to the stamp's top edge.
        # Convert to bottom-anchored PDF y, then clamp so the box stays
        # on-page (bottom edge can't fall below page).
        h_frac_for_clamp = (box_h / page_h) if page_h else 0
        y_frac = max(0.0, min(1.0 - h_frac_for_clamp, float(position["y"])))
        y = page_h - (page_h * y_frac) - box_h

        return x, y, box_w, box_h
    except (TypeError, ValueError, KeyError):
        log.warning("Invalid stamp_position payload, using default: %r", position)
        x = page_w - _DEFAULT_BOX_W - _DEFAULT_MARGIN
        y = page_h - _DEFAULT_BOX_H - _DEFAULT_MARGIN
        return x, y, _DEFAULT_BOX_W, _DEFAULT_BOX_H


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
    position: dict | None = None,
) -> bytes:
    """Return a new PDF byte string with the stamp baked onto page 1.

    `position` is the per-invoice override (see _resolve_box); when None,
    the stamp lands at the default top-right location.

    Runs the heavy reportlab + pypdf work in a worker thread so the asyncio
    loop stays free.
    """
    return await asyncio.to_thread(_stamp_sync, pdf_bytes, fields, position)


def _stamp_sync(pdf_bytes: bytes, fields: StampFields, position: dict | None) -> bytes:
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

    box_x, box_y, box_w, box_h = _resolve_box(page_w, page_h, position)
    overlay = _build_overlay_page(page_w, page_h, fields, box_x, box_y, box_w, box_h)
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


def _build_overlay_page(
    page_w: float,
    page_h: float,
    fields: StampFields,
    x: float,
    y: float,
    box_w: float,
    box_h: float,
):
    """Produce a single-page PDF (as a pypdf PageObject) drawing only the stamp.

    `(x, y, box_w, box_h)` are in PDF points with PDF's bottom-anchored
    coordinate system. Returns None on any reportlab failure.
    """
    try:
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=(page_w, page_h))

        # Scale all internal sizes proportionally so a resized stamp still
        # looks correctly proportioned. Reference: 220×96 box uses 16pt
        # header, 7pt label font, 9pt value font, 8pt left padding.
        scale = box_w / 220.0
        header_h = 16 * scale
        label_font = max(5, 7 * scale)
        value_font = max(6, 9 * scale)
        line_height = 16 * scale
        label_x_pad = 8 * scale
        value_x_pad = 70 * scale
        body_top_pad = 8 * scale

        # Box: white fill so the page content underneath doesn't bleed
        # through, navy stroke for the brand outline.
        c.setStrokeColor(COLOR_NAVY)
        c.setFillColor(COLOR_WHITE)
        c.setLineWidth(max(0.8, 1.4 * scale))
        c.rect(x, y, box_w, box_h, stroke=1, fill=1)

        # Header strip — small amber band at the top of the stamp.
        c.setFillColor(COLOR_AMBER)
        c.rect(x, y + box_h - header_h, box_w, header_h, stroke=0, fill=1)
        c.setFillColor(COLOR_NAVY)
        c.setFont("Helvetica-Bold", label_font)
        c.drawString(x + label_x_pad, y + box_h - header_h + (5 * scale), "CAMBRIDGE")
        c.drawRightString(
            x + box_w - label_x_pad,
            y + box_h - header_h + (5 * scale),
            "AP CODING",
        )

        rows = [
            ("JOB #", fields.job_number),
            ("COST CD", fields.cost_code),
            ("DATE", fields.coding_date.strftime("%m/%d/%y")),
            ("APPROVED", fields.approver),
        ]

        body_top = y + box_h - header_h - body_top_pad
        for i, (label, value) in enumerate(rows):
            row_y = body_top - i * line_height
            c.setFont("Helvetica-Bold", label_font)
            c.setFillColor(COLOR_NAVY)
            c.drawString(x + label_x_pad, row_y, label)
            c.setFont("Courier", value_font)
            c.drawString(x + value_x_pad, row_y, _truncate(value, 24))

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
