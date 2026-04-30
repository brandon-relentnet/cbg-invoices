"""Lightweight PDF inspection helpers used by the inbound webhook.

We need to make a few low-cost decisions about a freshly-received PDF
before queuing the (expensive) extraction background task:

  - Is it encrypted? Encrypted PDFs blow up the extraction pipeline,
    so we want to short-circuit and route to triage instead.
  - How many pages does it have? Used for the queue-list display and
    for pdfplumber-style sanity checks downstream.

Both functions are designed to be called inline from async handlers
via ``asyncio.to_thread`` — pypdf parsing is sync and slow on large
files, so we keep it off the event loop.
"""
from __future__ import annotations

import io
import logging

import pypdf

log = logging.getLogger(__name__)


def is_encrypted(content: bytes) -> bool:
    """Return True iff the PDF is encrypted with a non-empty password.

    Some "encrypted" PDFs are technically encrypted but use the empty
    string as the password (a common signing-tool quirk). We attempt
    that path first; if it succeeds the PDF is effectively unencrypted
    and we treat it normally.

    Returns False on any parsing error — better to let the extractor
    fail with its own error message than to mistakenly mark a valid
    PDF as encrypted.
    """
    try:
        reader = pypdf.PdfReader(io.BytesIO(content))
    except Exception as exc:  # noqa: BLE001
        log.warning("pypdf could not open PDF for encryption check: %s", exc)
        return False

    if not reader.is_encrypted:
        return False

    # Try the empty-string password — handles tools that "encrypt" with
    # no actual password (signed PDFs sometimes do this).
    try:
        if reader.decrypt("") != 0:
            return False
    except Exception as exc:  # noqa: BLE001
        log.warning("pypdf decrypt('') raised: %s", exc)
        # Treat as encrypted — caller will route to triage.
        return True

    return True


def page_count(content: bytes) -> int | None:
    """Best-effort page count. None on any parsing error."""
    try:
        return len(pypdf.PdfReader(io.BytesIO(content)).pages)
    except Exception as exc:  # noqa: BLE001
        log.warning("pypdf could not read page count: %s", exc)
        return None
