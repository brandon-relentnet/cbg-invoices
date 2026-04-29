"""Invoice endpoints: list, detail, upload, patch, approve, reject, retry."""
from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from pypdf import PdfReader
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import CurrentUser, get_current_user
from app.db import get_session
from app.models.invoice import Invoice, InvoiceStatus
from app.schemas.invoice import (
    AssignInvoiceRequest,
    InvoiceDetail,
    InvoiceListItem,
    InvoiceListResponse,
    InvoicePatch,
    RejectInvoiceRequest,
)
from app.services import audit, storage, extraction

log = logging.getLogger(__name__)
router = APIRouter(tags=["invoices"])


# ---------- List ----------

@router.get("", response_model=InvoiceListResponse)
async def list_invoices(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    status_filter: Annotated[list[InvoiceStatus] | None, Query(alias="status")] = None,
    assigned: Annotated[str | None, Query(pattern="^(true|false|mine)$")] = None,
    q: str | None = None,
    job: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
):
    """List invoices with optional filters.

    `assigned` semantics:
      - "true"  → only invoices with an assignee (any user)
      - "false" → only unassigned invoices
      - "mine"  → assigned specifically to the current user
      - None    → no assignment filter
    """
    stmt = select(Invoice)
    count_stmt = select(func.count(Invoice.id))

    if status_filter:
        stmt = stmt.where(Invoice.status.in_(status_filter))
        count_stmt = count_stmt.where(Invoice.status.in_(status_filter))
    if assigned == "true":
        cond = Invoice.assigned_to_id.is_not(None)
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    elif assigned == "false":
        cond = Invoice.assigned_to_id.is_(None)
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    elif assigned == "mine":
        cond = Invoice.assigned_to_id == user.id
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    if q:
        like = f"%{q.lower()}%"
        cond = or_(
            func.lower(Invoice.vendor_name).like(like),
            func.lower(Invoice.invoice_number).like(like),
            func.lower(Invoice.po_number).like(like),
            func.lower(Invoice.sender_email).like(like),
            func.lower(Invoice.job_number).like(like),
        )
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    if job:
        # Dedicated job-number filter — case-insensitive substring match.
        # Useful for the "all invoices for job 25-11-04" use case.
        job_like = f"%{job.lower()}%"
        job_cond = func.lower(Invoice.job_number).like(job_like)
        stmt = stmt.where(job_cond)
        count_stmt = count_stmt.where(job_cond)

    total = (await session.execute(count_stmt)).scalar_one()
    stmt = (
        stmt.order_by(desc(Invoice.received_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await session.execute(stmt)).scalars().all()
    return InvoiceListResponse(
        invoices=[InvoiceListItem.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


# ---------- Detail ----------

@router.get("/{invoice_id}", response_model=InvoiceDetail)
async def get_invoice(
    invoice_id: UUID,
    _user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    invoice = await session.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    detail = InvoiceDetail.model_validate(invoice)
    try:
        detail.pdf_url = await storage.presign_url(invoice.pdf_storage_key)
    except Exception as exc:
        log.warning("presign_url failed for %s: %s", invoice.id, exc)
    return detail


# ---------- PDF (signed URL) ----------

@router.get("/{invoice_id}/pdf")
async def get_invoice_pdf_url(
    invoice_id: UUID,
    _user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    invoice = await session.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    url = await storage.presign_url(invoice.pdf_storage_key)
    return {"url": url, "ttl_seconds": 900}


# ---------- PDF (inline content, same-origin via backend proxy) ----------
# We proxy PDF bytes through the backend so the react-pdf viewer can fetch
# them without hitting R2's CORS policy. Open-in-new-tab still uses the
# direct signed URL since a top-level navigation doesn't trigger CORS.

@router.get("/{invoice_id}/pdf/content")
async def get_invoice_pdf_content(
    invoice_id: UUID,
    _user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    from fastapi.responses import Response

    invoice = await session.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    try:
        content = await storage.download_pdf(invoice.pdf_storage_key)
    except storage.StorageError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    safe_name = (invoice.pdf_filename or "invoice.pdf").replace('"', "")
    return Response(
        content=content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{safe_name}"',
            "Cache-Control": "private, max-age=60",
        },
    )


# ---------- Upload ----------

@router.post("", response_model=InvoiceDetail, status_code=status.HTTP_201_CREATED)
async def upload_invoice(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    background: BackgroundTasks,
    file: Annotated[UploadFile, File(...)],
):
    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Expected application/pdf, got {file.content_type}",
        )
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    # Best-effort page count. PdfReader parses the xref table which can be
    # slow on large PDFs, so push it to a worker thread to keep the loop free.
    page_count = await _safe_page_count(content)

    invoice_id = uuid4()
    key = storage.build_storage_key(invoice_id)
    try:
        await storage.upload_pdf(key, content, filename=file.filename or "invoice.pdf")
    except storage.StorageNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except storage.StorageBucketMissingError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except storage.StorageError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    invoice = Invoice(
        id=invoice_id,
        source="upload",
        sender_email=user.email,
        received_at=datetime.now(UTC),
        pdf_storage_key=key,
        pdf_filename=file.filename or "invoice.pdf",
        pdf_size_bytes=len(content),
        pdf_page_count=page_count,
        status=InvoiceStatus.RECEIVED,
    )
    session.add(invoice)
    await session.flush()
    await audit.record(
        session,
        actor_id=user.id,
        actor_email=user.email,
        action="invoice_uploaded",
        invoice_id=invoice_id,
        message=f"filename={file.filename} size={len(content)}",
    )
    await session.commit()

    background.add_task(extraction.extract_invoice, invoice_id)

    detail = InvoiceDetail.model_validate(invoice)
    detail.pdf_url = await storage.presign_url(key)
    return detail


# ---------- Edit (PM corrections) ----------

@router.patch("/{invoice_id}", response_model=InvoiceDetail)
async def patch_invoice(
    invoice_id: UUID,
    patch: InvoicePatch,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    invoice = await session.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.status == InvoiceStatus.POSTED_TO_QBO:
        raise HTTPException(status_code=409, detail="Cannot edit invoice already posted to QBO")

    before = _snapshot(invoice)
    updates = patch.model_dump(exclude_unset=True)
    for key, value in updates.items():
        if key == "line_items" and value is not None:
            value = [li if isinstance(li, dict) else li.model_dump() for li in value]
        setattr(invoice, key, value)
    after = _snapshot(invoice)

    b_changed, a_changed = audit.diff(before, after)
    if b_changed or a_changed:
        await audit.record(
            session,
            actor_id=user.id,
            actor_email=user.email,
            action="invoice_edited",
            invoice_id=invoice_id,
            before=b_changed,
            after=a_changed,
        )

    await session.commit()
    detail = InvoiceDetail.model_validate(invoice)
    detail.pdf_url = await storage.presign_url(invoice.pdf_storage_key)
    return detail


# ---------- Lifecycle transitions ----------
#
# Status transitions:
#
#   ready_for_review ──┬─► approved ──► posted_to_qbo
#                      └─► rejected
#
#   approved ──► posted_to_qbo      (manual post)
#   approved ──► ready_for_review   (unapprove, back to editing)
#
# Assignment is a *workflow signaling* feature — having an assignee moves
# the invoice from "Need Review" to "Assigned" in the queue UI, but doesn't
# gate permission to act. Anyone authenticated can still approve / post /
# reassign / etc. regardless of who's assigned.


def _ensure_approvable(invoice: Invoice) -> None:
    """Raise 4xx if the invoice isn't in a state that can be approved."""
    if invoice.status == InvoiceStatus.POSTED_TO_QBO:
        raise HTTPException(status_code=409, detail="Already posted to QBO")
    if invoice.status == InvoiceStatus.REJECTED:
        raise HTTPException(status_code=409, detail="Cannot approve a rejected invoice")
    if not invoice.vendor_name and not invoice.vendor_id:
        raise HTTPException(status_code=400, detail="Vendor is required before approval")
    if not invoice.total_cents:
        raise HTTPException(status_code=400, detail="Total amount is required before approval")


def _mark_approved(invoice: Invoice, user: CurrentUser) -> None:
    invoice.status = InvoiceStatus.APPROVED
    invoice.reviewed_by = user.id
    invoice.reviewed_by_email = user.email
    invoice.reviewed_at = datetime.now(UTC)
    invoice.qbo_post_error = None


@router.post("/{invoice_id}/approve", response_model=InvoiceDetail)
async def approve_invoice(
    invoice_id: UUID,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Confirm the invoice is correct. Does NOT post to QBO — use /post next.

    Allowed from: ready_for_review, extraction_failed (fix-and-approve).
    """
    invoice = await session.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    _ensure_approvable(invoice)

    _mark_approved(invoice, user)
    await audit.record(
        session,
        actor_id=user.id,
        actor_email=user.email,
        action="invoice_approved",
        invoice_id=invoice_id,
    )
    await session.commit()
    return await _detail_with_pdf(invoice)


@router.post("/{invoice_id}/post", response_model=InvoiceDetail)
async def post_invoice_to_qbo(
    invoice_id: UUID,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    background: BackgroundTasks,
):
    """Enqueue QBO posting for an already-approved invoice.

    Idempotent — the background task will skip if the invoice is already
    posted. Also safe to retry after a prior failure.
    """
    invoice = await session.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.status == InvoiceStatus.POSTED_TO_QBO:
        raise HTTPException(status_code=409, detail="Already posted to QBO")
    if invoice.status != InvoiceStatus.APPROVED:
        raise HTTPException(
            status_code=409,
            detail="Only approved invoices can be posted. Approve it first.",
        )

    await audit.record(
        session,
        actor_id=user.id,
        actor_email=user.email,
        action="invoice_post_requested",
        invoice_id=invoice_id,
    )
    await session.commit()

    from app.services import qbo_posting  # local import avoids circular at module load

    background.add_task(qbo_posting.post_bill, invoice_id)
    return await _detail_with_pdf(invoice)


@router.post("/{invoice_id}/approve-and-post", response_model=InvoiceDetail)
async def approve_and_post(
    invoice_id: UUID,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    background: BackgroundTasks,
):
    """Convenience endpoint: approve + enqueue post in one call."""
    invoice = await session.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    _ensure_approvable(invoice)

    _mark_approved(invoice, user)
    await audit.record(
        session,
        actor_id=user.id,
        actor_email=user.email,
        action="invoice_approved_and_post_requested",
        invoice_id=invoice_id,
    )
    await session.commit()

    from app.services import qbo_posting

    background.add_task(qbo_posting.post_bill, invoice_id)
    return await _detail_with_pdf(invoice)


@router.post("/{invoice_id}/unapprove", response_model=InvoiceDetail)
async def unapprove_invoice(
    invoice_id: UUID,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Revert an APPROVED invoice back to READY_FOR_REVIEW for more edits."""
    invoice = await session.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.status != InvoiceStatus.APPROVED:
        raise HTTPException(
            status_code=409,
            detail="Only approved invoices can be unapproved",
        )

    invoice.status = InvoiceStatus.READY_FOR_REVIEW
    invoice.reviewed_by = None
    invoice.reviewed_by_email = None
    invoice.reviewed_at = None
    invoice.qbo_post_error = None
    await audit.record(
        session,
        actor_id=user.id,
        actor_email=user.email,
        action="invoice_unapproved",
        invoice_id=invoice_id,
    )
    await session.commit()
    return await _detail_with_pdf(invoice)


@router.post("/{invoice_id}/assign", response_model=InvoiceDetail)
async def assign_invoice(
    invoice_id: UUID,
    body: AssignInvoiceRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    invoice = await session.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    invoice.assigned_to_id = body.user_id
    invoice.assigned_to_email = body.user_email
    invoice.assigned_to_name = body.user_name
    invoice.assigned_at = datetime.now(UTC)
    await audit.record(
        session,
        actor_id=user.id,
        actor_email=user.email,
        action="invoice_assigned",
        invoice_id=invoice_id,
        message=body.user_email or body.user_id,
    )
    await session.commit()
    return await _detail_with_pdf(invoice)


@router.post("/{invoice_id}/unassign", response_model=InvoiceDetail)
async def unassign_invoice(
    invoice_id: UUID,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    invoice = await session.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    prev = invoice.assigned_to_email or invoice.assigned_to_id
    invoice.assigned_to_id = None
    invoice.assigned_to_email = None
    invoice.assigned_to_name = None
    invoice.assigned_at = None
    if prev:
        await audit.record(
            session,
            actor_id=user.id,
            actor_email=user.email,
            action="invoice_unassigned",
            invoice_id=invoice_id,
            message=prev,
        )
    await session.commit()
    return await _detail_with_pdf(invoice)


@router.post("/{invoice_id}/reject", response_model=InvoiceDetail)
async def reject_invoice(
    invoice_id: UUID,
    body: RejectInvoiceRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    invoice = await session.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.status == InvoiceStatus.POSTED_TO_QBO:
        raise HTTPException(status_code=409, detail="Cannot reject invoice already posted to QBO")

    invoice.status = InvoiceStatus.REJECTED
    invoice.reviewed_by = user.id
    invoice.reviewed_by_email = user.email
    invoice.reviewed_at = datetime.now(UTC)
    invoice.notes = f"{invoice.notes or ''}\n\n[Rejection reason] {body.reason}".strip()

    await audit.record(
        session,
        actor_id=user.id,
        actor_email=user.email,
        action="invoice_rejected",
        invoice_id=invoice_id,
        message=body.reason,
    )
    await session.commit()
    return await _detail_with_pdf(invoice)


@router.post("/{invoice_id}/reextract", response_model=InvoiceDetail)
async def reextract_invoice(
    invoice_id: UUID,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    background: BackgroundTasks,
):
    invoice = await session.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.status == InvoiceStatus.POSTED_TO_QBO:
        raise HTTPException(status_code=409, detail="Cannot re-extract posted invoice")

    invoice.status = InvoiceStatus.RECEIVED
    invoice.extraction_error = None
    await audit.record(
        session,
        actor_id=user.id,
        actor_email=user.email,
        action="invoice_reextract_requested",
        invoice_id=invoice_id,
    )
    await session.commit()
    background.add_task(extraction.extract_invoice, invoice_id)
    return await _detail_with_pdf(invoice)


# ---------- Legacy retry endpoint (kept for backward compatibility) ----------
# Equivalent to /post; will be removed once the frontend no longer calls it.


@router.post("/{invoice_id}/retry-qbo", response_model=InvoiceDetail)
async def retry_qbo(
    invoice_id: UUID,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    background: BackgroundTasks,
):
    return await post_invoice_to_qbo(invoice_id, user, session, background)


# ---------- Helpers ----------


async def _safe_page_count(content: bytes) -> int | None:
    """Page count via pypdf, off the event loop. Returns None if it fails."""
    import asyncio
    import io

    def _count() -> int | None:
        try:
            return len(PdfReader(io.BytesIO(content)).pages)
        except Exception as exc:  # noqa: BLE001
            log.warning("pdf page count failed: %s", exc)
            return None

    return await asyncio.to_thread(_count)


async def _detail_with_pdf(invoice: Invoice) -> InvoiceDetail:
    detail = InvoiceDetail.model_validate(invoice)
    try:
        detail.pdf_url = await storage.presign_url(invoice.pdf_storage_key)
    except Exception as exc:  # noqa: BLE001
        log.warning("presign_url failed for %s: %s", invoice.id, exc)
    return detail


def _snapshot(invoice: Invoice) -> dict:
    return {
        "vendor_name": invoice.vendor_name,
        "vendor_id": str(invoice.vendor_id) if invoice.vendor_id else None,
        "invoice_number": invoice.invoice_number,
        "invoice_date": invoice.invoice_date.isoformat() if invoice.invoice_date else None,
        "due_date": invoice.due_date.isoformat() if invoice.due_date else None,
        "subtotal_cents": invoice.subtotal_cents,
        "tax_cents": invoice.tax_cents,
        "total_cents": invoice.total_cents,
        "currency": invoice.currency,
        "po_number": invoice.po_number,
        "notes": invoice.notes,
        "line_items": invoice.line_items,
        "project_id": str(invoice.project_id) if invoice.project_id else None,
        # Cambridge AP coding markup
        "job_number": invoice.job_number,
        "cost_code": invoice.cost_code,
        "coding_date": invoice.coding_date.isoformat() if invoice.coding_date else None,
        "approver": invoice.approver,
    }
