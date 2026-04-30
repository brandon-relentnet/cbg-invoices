"""Inbound webhooks — Postmark email and QBO (future)."""
from __future__ import annotations

import asyncio
import logging
from typing import Annotated, Any
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_session
from app.models.invoice import Invoice, InvoiceStatus, TriageReason
from app.services import audit, email_render, extraction, pdf_inspect, postmark, storage

log = logging.getLogger(__name__)
router = APIRouter(tags=["webhooks"])


# ---------------------------------------------------------------------------
# Pre-flight helpers
# ---------------------------------------------------------------------------

# Body content shorter than this is treated as "no real body" and the
# email becomes a rejected stub instead of a body-rendered triage row.
# Most useful body-only invoices are at least a couple hundred chars
# (greeting + amount + payment terms), so this threshold filters out
# auto-replies that contain a few words like "got it, thanks".
MIN_BODY_LENGTH_FOR_RENDER = 80


async def _safe_page_count(content: bytes, filename: str) -> int | None:
    """Best-effort page count off the event loop."""
    count = await asyncio.to_thread(pdf_inspect.page_count, content)
    if count is None:
        log.warning("pypdf could not read inbound %s", filename)
    return count


async def _safe_is_encrypted(content: bytes) -> bool:
    """Off-loop encryption check."""
    return await asyncio.to_thread(pdf_inspect.is_encrypted, content)


# ---------------------------------------------------------------------------
# Postmark inbound
# ---------------------------------------------------------------------------


@router.post("/postmark", status_code=status.HTTP_200_OK)
async def postmark_inbound(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    background: BackgroundTasks,
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, Any]:
    settings = get_settings()

    if not postmark.verify_basic_auth(authorization, settings.postmark_webhook_secret):
        raise HTTPException(status_code=401, detail="Invalid webhook credentials")

    try:
        payload: dict[str, Any] = await request.json()
    except Exception as exc:
        log.warning("Postmark webhook body is not JSON: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    message_id: str | None = payload.get("MessageID") or payload.get("MessageId")
    if not message_id:
        log.warning("Postmark webhook missing MessageID — accepting but not deduping")

    # Dedup
    if message_id:
        existing = (
            await session.execute(
                select(Invoice.id).where(Invoice.email_message_id == message_id)
            )
        ).first()
        if existing:
            log.info("Duplicate Postmark MessageID %s — ignoring", message_id)
            return {"status": "duplicate", "message_id": message_id}

    received_at = postmark.parse_received_at(payload.get("Date"))
    sender: str | None = payload.get("From")
    if isinstance(payload.get("FromFull"), dict):
        sender = payload["FromFull"].get("Email") or sender
    subject: str | None = payload.get("Subject")
    body_text: str | None = payload.get("TextBody")
    body_html: str | None = payload.get("HtmlBody")
    body: str | None = body_text or body_html

    attachments = postmark.extract_pdf_attachments(payload.get("Attachments") or [])

    # Path A — no PDF attachments. If the body has substantive content,
    # render it to a PDF and let it ride the normal extraction pipeline
    # with triage_reason=BODY_RENDERED so the operator can confirm.
    # Otherwise fall back to the rejected-stub behaviour.
    if not attachments:
        rendered_payload = (body_text or body_html or "").strip()
        if len(rendered_payload) >= MIN_BODY_LENGTH_FOR_RENDER:
            return await _ingest_body_only(
                session=session,
                background=background,
                message_id=message_id,
                sender=sender,
                subject=subject,
                body_text=body_text,
                body_html=body_html,
                received_at=received_at,
            )

        # Truly empty / auto-reply email.
        return await _record_rejected_no_pdf(
            session=session,
            message_id=message_id,
            sender=sender,
            subject=subject,
            body=body,
            received_at=received_at,
        )

    # Path B — at least one PDF attachment. Process each.
    created: list[str] = []
    for idx, (filename, content) in enumerate(attachments):
        # For multi-PDF emails we add `:idx` to MessageID to keep the
        # dedup column unique.
        dedup_id = message_id if len(attachments) == 1 else f"{message_id}:{idx}"

        page_count_value = await _safe_page_count(content, filename)
        encrypted = await _safe_is_encrypted(content)

        invoice_id = uuid4()
        key = storage.build_storage_key(invoice_id, received_at=received_at)
        try:
            await storage.upload_pdf(key, content, filename=filename)
        except Exception as exc:
            log.exception("R2 upload failed for inbound %s", filename)
            rejected = Invoice(
                id=invoice_id,
                source="email",
                sender_email=sender,
                email_subject=subject,
                email_body=body,
                email_message_id=dedup_id,
                received_at=received_at,
                pdf_storage_key="",
                pdf_filename=filename,
                pdf_size_bytes=len(content),
                pdf_page_count=page_count_value,
                status=InvoiceStatus.REJECTED,
                notes=f"Storage upload failed: {exc}",
            )
            session.add(rejected)
            continue

        if encrypted:
            # Skip extraction entirely — it would just fail. Land the row
            # directly in triage with a clear reason so AP knows to ask
            # the vendor for an unencrypted copy.
            invoice = Invoice(
                id=invoice_id,
                source="email",
                sender_email=sender,
                email_subject=subject,
                email_body=body,
                email_message_id=dedup_id,
                received_at=received_at,
                pdf_storage_key=key,
                pdf_filename=filename,
                pdf_size_bytes=len(content),
                pdf_page_count=page_count_value,
                status=InvoiceStatus.NEEDS_TRIAGE,
                triage_reason=TriageReason.ENCRYPTED_PDF,
                notes=(
                    "PDF is password-protected. Ask the vendor to resend "
                    "without encryption, or upload a decrypted copy manually."
                ),
            )
            session.add(invoice)
            await session.flush()
            await audit.record_system(
                session,
                action="triage_routed",
                invoice_id=invoice_id,
                message=f"reason=encrypted_pdf from={sender} filename={filename}",
            )
            created.append(str(invoice_id))
            continue

        invoice = Invoice(
            id=invoice_id,
            source="email",
            sender_email=sender,
            email_subject=subject,
            email_body=body,
            email_message_id=dedup_id,
            received_at=received_at,
            pdf_storage_key=key,
            pdf_filename=filename,
            pdf_size_bytes=len(content),
            pdf_page_count=page_count_value,
            status=InvoiceStatus.RECEIVED,
        )
        session.add(invoice)
        await session.flush()
        await audit.record_system(
            session,
            action="email_received",
            invoice_id=invoice_id,
            message=f"from={sender} subject={subject!r} filename={filename}",
        )
        created.append(str(invoice_id))
        background.add_task(extraction.extract_invoice, invoice_id)

    await session.commit()
    log.info(
        "Postmark inbound processed: message=%s created=%d",
        message_id,
        len(created),
    )
    return {"status": "ok", "invoice_ids": created}


# ---------------------------------------------------------------------------
# Path-specific helpers
# ---------------------------------------------------------------------------


async def _ingest_body_only(
    *,
    session: AsyncSession,
    background: BackgroundTasks,
    message_id: str | None,
    sender: str | None,
    subject: str | None,
    body_text: str | None,
    body_html: str | None,
    received_at,
) -> dict[str, Any]:
    """Render the email body to a PDF and treat it as a normal inbound.

    Pre-flights ``triage_reason=BODY_RENDERED`` so even after a
    successful high-confidence extraction the row lands in triage —
    AP confirms our reading of a free-form email body before it
    becomes a real bill.
    """
    invoice_id = uuid4()
    body = body_text or body_html

    try:
        pdf_bytes = await asyncio.to_thread(
            email_render.render_body_to_pdf,
            sender=sender,
            subject=subject,
            received_at=received_at,
            body=body,
            filename_for_log=str(invoice_id),
        )
    except Exception as exc:
        log.exception("Body-only render failed; falling back to rejected stub")
        return await _record_rejected_no_pdf(
            session=session,
            message_id=message_id,
            sender=sender,
            subject=subject,
            body=body,
            received_at=received_at,
            note=f"Body-only render failed: {exc}",
        )

    filename = "email-body.pdf"
    key = storage.build_storage_key(invoice_id, received_at=received_at)
    try:
        await storage.upload_pdf(key, pdf_bytes, filename=filename)
    except Exception as exc:
        log.exception("R2 upload of rendered email body failed")
        return await _record_rejected_no_pdf(
            session=session,
            message_id=message_id,
            sender=sender,
            subject=subject,
            body=body,
            received_at=received_at,
            note=f"Rendered body upload failed: {exc}",
        )

    page_count_value = await _safe_page_count(pdf_bytes, filename)

    invoice = Invoice(
        id=invoice_id,
        source="email",
        sender_email=sender,
        email_subject=subject,
        email_body=body,
        email_message_id=message_id,
        received_at=received_at,
        pdf_storage_key=key,
        pdf_filename=filename,
        pdf_size_bytes=len(pdf_bytes),
        pdf_page_count=page_count_value,
        status=InvoiceStatus.RECEIVED,
        # Pre-flight reason — extraction's _route_after_extraction will
        # respect this for high-confidence invoices (still goes to
        # triage so a human verifies the rendered-from-body content)
        # and override with NON_INVOICE / LOW_CONFIDENCE if appropriate.
        triage_reason=TriageReason.BODY_RENDERED,
    )
    session.add(invoice)
    await session.flush()
    await audit.record_system(
        session,
        action="email_received",
        invoice_id=invoice_id,
        message=f"from={sender} subject={subject!r} filename={filename} (body-rendered)",
    )
    background.add_task(extraction.extract_invoice, invoice_id)
    await session.commit()
    log.info(
        "Postmark inbound (body-only): rendered email body → invoice %s, queued extraction",
        invoice_id,
    )
    return {"status": "ok", "invoice_ids": [str(invoice_id)], "body_rendered": True}


async def _record_rejected_no_pdf(
    *,
    session: AsyncSession,
    message_id: str | None,
    sender: str | None,
    subject: str | None,
    body: str | None,
    received_at,
    note: str = "No PDF attachment in inbound email",
) -> dict[str, Any]:
    """Create a rejected stub for emails that have no usable content."""
    invoice_id = uuid4()
    rejected = Invoice(
        id=invoice_id,
        source="email",
        sender_email=sender,
        email_subject=subject,
        email_body=body,
        email_message_id=message_id,
        received_at=received_at,
        pdf_storage_key="",
        pdf_filename="",
        pdf_size_bytes=0,
        status=InvoiceStatus.REJECTED,
        notes=note,
    )
    session.add(rejected)
    await session.flush()
    await audit.record_system(
        session,
        action="email_rejected_no_pdf",
        invoice_id=invoice_id,
        message=f"from={sender} subject={subject!r}",
    )
    await session.commit()
    log.info(
        "Postmark inbound %s had no usable PDF — created rejected stub %s",
        message_id,
        invoice_id,
    )
    return {"status": "rejected_no_pdf", "invoice_id": str(invoice_id)}
