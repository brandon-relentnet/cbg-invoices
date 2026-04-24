"""Inbound webhooks — Postmark email and QBO (future)."""
from __future__ import annotations

import io
import logging
from datetime import UTC, datetime
from typing import Annotated, Any
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request, status
from pypdf import PdfReader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_session
from app.models.invoice import Invoice, InvoiceStatus
from app.services import audit, extraction, postmark, storage

log = logging.getLogger(__name__)
router = APIRouter(tags=["webhooks"])


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
    body: str | None = payload.get("TextBody") or payload.get("HtmlBody")

    attachments = postmark.extract_pdf_attachments(payload.get("Attachments") or [])

    if not attachments:
        # Record a rejected invoice so the sender still shows up in the audit trail
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
            notes="No PDF attachment in inbound email",
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
        log.info("Postmark email %s had no PDFs — created rejected stub %s", message_id, invoice_id)
        return {"status": "rejected_no_pdf", "invoice_id": str(invoice_id)}

    created: list[str] = []
    for idx, (filename, content) in enumerate(attachments):
        # For multi-PDF emails we add `:idx` to MessageID to keep the dedup column unique
        dedup_id = message_id if len(attachments) == 1 else f"{message_id}:{idx}"

        page_count: int | None = None
        try:
            page_count = len(PdfReader(io.BytesIO(content)).pages)
        except Exception as exc:
            log.warning("pypdf could not read inbound %s: %s", filename, exc)

        invoice_id = uuid4()
        key = storage.build_storage_key(invoice_id, received_at=received_at)
        try:
            storage.upload_pdf(key, content, filename=filename)
        except Exception as exc:
            log.exception("R2 upload failed for inbound %s", filename)
            # Record as rejected so the PM still sees the email landed
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
                pdf_page_count=page_count,
                status=InvoiceStatus.REJECTED,
                notes=f"Storage upload failed: {exc}",
            )
            session.add(rejected)
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
            pdf_page_count=page_count,
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
