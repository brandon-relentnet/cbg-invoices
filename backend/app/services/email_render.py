"""Render an email body to a PDF when the original message had no attachment.

A small subset of vendors send "Inv #1234, $250 due Net-30" in the
plaintext (or HTML) body of the email and don't attach a PDF. We
detect this in the inbound webhook and pass the body content here to
produce a clean letter-format PDF that can ride the same extraction
pipeline as any other invoice.

Output is intentionally simple — a header block (sender, subject,
received-at), the body, and an explicit footer that says "Rendered
from email body — no original attachment." This makes it obvious to
the AP team in the review interface that there was no real document
behind this row.

Implementation notes
--------------------

We use reportlab (already a dep — same library as ``stamp.py``) so we
don't take on weasyprint or chromium. HTML stripping uses stdlib's
``html.parser`` to avoid pulling in BeautifulSoup. The result won't be
beautiful, but extraction only cares about the *text* of the body.
"""
from __future__ import annotations

import html
import io
import logging
from datetime import datetime
from html.parser import HTMLParser

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
)

log = logging.getLogger(__name__)


class _HTMLToText(HTMLParser):
    """Tiny HTML-to-text converter for email bodies.

    Preserves paragraph breaks (``<p>``, ``<br>``, ``<div>``) and drops
    everything else. Handles entity decoding via the HTMLParser
    machinery. Anything more sophisticated would justify pulling in
    BeautifulSoup, which we don't want to do for one feature.
    """

    BLOCK_TAGS = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6"}
    SKIP_TAGS = {"style", "script", "head"}

    def __init__(self) -> None:
        super().__init__()
        self._parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs):  # noqa: ARG002
        if tag in self.SKIP_TAGS:
            self._skip_depth += 1
        elif tag in self.BLOCK_TAGS:
            self._parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self.SKIP_TAGS and self._skip_depth > 0:
            self._skip_depth -= 1
        elif tag in self.BLOCK_TAGS:
            self._parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth == 0:
            self._parts.append(data)

    def get_text(self) -> str:
        # Collapse runs of blank lines while preserving paragraph breaks.
        joined = "".join(self._parts)
        lines = [line.rstrip() for line in joined.splitlines()]
        out: list[str] = []
        prev_blank = False
        for line in lines:
            if not line.strip():
                if not prev_blank:
                    out.append("")
                prev_blank = True
            else:
                out.append(line)
                prev_blank = False
        return "\n".join(out).strip()


def _looks_like_html(body: str) -> bool:
    """Cheap heuristic: does this string contain HTML markup?"""
    sample = body[:1024].lower()
    return "<html" in sample or "<body" in sample or "<p>" in sample or "<div" in sample


def _normalise_body(body: str | None) -> str:
    """Convert raw body content (HTML or plaintext) to clean plaintext."""
    if not body:
        return ""
    if _looks_like_html(body):
        parser = _HTMLToText()
        parser.feed(body)
        parser.close()
        return parser.get_text()
    return body.strip()


def render_body_to_pdf(
    *,
    sender: str | None,
    subject: str | None,
    received_at: datetime | None,
    body: str | None,
    filename_for_log: str = "email-body",
) -> bytes:
    """Render the contents of an email body into a single PDF byte string.

    Parameters mirror what we capture from the Postmark webhook: any of
    them may be missing. We always produce a non-empty PDF so the
    caller has something to upload to R2 and run through extraction —
    even if the body itself is empty, the header block alone is enough
    for a human to recognise the row.
    """
    text = _normalise_body(body)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=LETTER,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
        title=f"Email body — {subject or filename_for_log}",
    )

    styles = getSampleStyleSheet()
    kicker_style = ParagraphStyle(
        "kicker",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        textColor="#c8923c",
        leading=10,
        spaceAfter=2,
    )
    header_style = ParagraphStyle(
        "headerRow",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
    )
    body_style = ParagraphStyle(
        "body",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=11,
        leading=15,
        spaceAfter=8,
    )
    footer_style = ParagraphStyle(
        "footer",
        parent=styles["Normal"],
        fontName="Helvetica-Oblique",
        fontSize=9,
        textColor="#6b7280",
        leading=12,
        spaceBefore=18,
    )

    story = []
    story.append(Paragraph("CAMBRIDGE INVOICE PORTAL", kicker_style))
    story.append(Paragraph("Inbound email \u2014 no attached PDF", header_style))
    story.append(Spacer(1, 0.18 * inch))

    received_str = (
        received_at.strftime("%Y-%m-%d %H:%M %Z").strip() if received_at else "—"
    )
    for label, value in (
        ("From", sender or "—"),
        ("Subject", subject or "—"),
        ("Received", received_str),
    ):
        story.append(
            Paragraph(
                f"<b>{html.escape(label)}:</b> {html.escape(str(value))}",
                header_style,
            )
        )
    story.append(Spacer(1, 0.22 * inch))

    if text:
        # Each paragraph (separated by blank line) becomes its own
        # Paragraph flowable so reportlab handles wrapping.
        for paragraph in text.split("\n\n"):
            paragraph = paragraph.strip()
            if not paragraph:
                continue
            # html.escape and convert internal newlines to <br/> so
            # within-paragraph line breaks survive.
            escaped = html.escape(paragraph).replace("\n", "<br/>")
            story.append(Paragraph(escaped, body_style))
    else:
        story.append(
            Paragraph(
                "<i>(email body was empty)</i>",
                body_style,
            )
        )

    story.append(
        Paragraph(
            "Rendered from email body \u2014 no original attachment.",
            footer_style,
        )
    )

    try:
        doc.build(story)
    except Exception:  # noqa: BLE001
        log.exception("Failed to render email body to PDF (filename=%s)", filename_for_log)
        raise

    return buf.getvalue()
