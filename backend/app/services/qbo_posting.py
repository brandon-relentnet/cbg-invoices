"""Post an approved invoice to QuickBooks Online as a Bill, with PDF attached.

Flow:
  1. Load invoice + vendor + (optional) project
  2. Build the Bill payload using extracted line items
  3. POST /v3/company/{realm}/bill
  4. Upload the PDF as an Attachable linked to the Bill
  5. Persist qbo_bill_id, qbo_posted_at, status=POSTED_TO_QBO
  6. On failure at any stage: keep status=APPROVED, persist qbo_post_error,
     audit the failure. UI shows a "Retry post to QBO" button.

Idempotency: if qbo_bill_id is already set, we skip creating a new Bill and
just ensure the attachment exists (attachment re-upload is OK; QBO allows it).
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import AsyncSessionLocal
from app.models.invoice import Invoice, InvoiceStatus
from app.models.project import Project
from app.models.qbo_token import QboToken
from app.models.vendor import Vendor
from app.services import audit, qbo_client, storage

log = logging.getLogger(__name__)


async def post_bill(invoice_id: UUID) -> None:
    """Entrypoint for BackgroundTask. Opens its own session."""
    async with AsyncSessionLocal() as session:
        try:
            await _run(session, invoice_id)
            await session.commit()
        except Exception as exc:
            log.exception("QBO bill posting failed for %s", invoice_id)
            await session.rollback()
            # Record the failure on a fresh session
            async with AsyncSessionLocal() as s2:
                inv = await s2.get(Invoice, invoice_id)
                if inv:
                    inv.qbo_post_error = str(exc)[:2000]
                    await audit.record_system(
                        s2,
                        action="qbo_post_failed",
                        invoice_id=invoice_id,
                        message=str(exc)[:2000],
                    )
                    await s2.commit()


async def _run(session: AsyncSession, invoice_id: UUID) -> None:
    invoice = await session.get(Invoice, invoice_id)
    if invoice is None:
        log.warning("Invoice %s not found for QBO posting", invoice_id)
        return

    if invoice.status == InvoiceStatus.POSTED_TO_QBO:
        log.info("Invoice %s already posted (bill=%s); skipping", invoice_id, invoice.qbo_bill_id)
        return
    if invoice.status != InvoiceStatus.APPROVED:
        log.warning(
            "Invoice %s is not APPROVED (status=%s); refusing to post",
            invoice_id,
            invoice.status,
        )
        return

    vendor = await _resolve_vendor(session, invoice)
    project = await _resolve_project(session, invoice)
    token = (
        await session.execute(select(QboToken).where(QboToken.id == 1))
    ).scalar_one_or_none()
    if token is None:
        raise qbo_client.QboNotConnectedError("QBO is not connected")

    default_account_id = _default_expense_account_id(token)
    payload = _build_bill_payload(invoice, vendor, project, default_account_id)

    # Create the Bill (skip if we already have one from a previous attempt)
    if not invoice.qbo_bill_id:
        log.info("Creating QBO bill for invoice %s", invoice_id)
        bill_response = await qbo_client.create_bill(session, payload)
        bill = bill_response.get("Bill") if isinstance(bill_response, dict) else None
        if not bill or not bill.get("Id"):
            raise qbo_client.QboApiError(
                f"QBO create_bill returned unexpected response: {bill_response!r}"
            )
        invoice.qbo_bill_id = str(bill["Id"])
        invoice.qbo_post_error = None
        await session.flush()
        await audit.record_system(
            session,
            action="qbo_bill_created",
            invoice_id=invoice_id,
            after={"qbo_bill_id": invoice.qbo_bill_id},
        )
    else:
        log.info(
            "Invoice %s already has qbo_bill_id=%s; skipping bill create",
            invoice_id,
            invoice.qbo_bill_id,
        )

    # Attach the PDF
    log.info("Uploading PDF attachment for bill %s", invoice.qbo_bill_id)
    pdf_bytes = storage.download_pdf(invoice.pdf_storage_key)
    await qbo_client.upload_attachable_for_bill(
        session,
        bill_id=invoice.qbo_bill_id,
        pdf_bytes=pdf_bytes,
        filename=invoice.pdf_filename or "invoice.pdf",
        invoice_uuid=invoice.id,
    )

    invoice.status = InvoiceStatus.POSTED_TO_QBO
    invoice.qbo_posted_at = datetime.now(UTC)
    invoice.qbo_post_error = None
    await audit.record_system(
        session,
        action="qbo_bill_attached",
        invoice_id=invoice_id,
        after={"qbo_bill_id": invoice.qbo_bill_id},
    )
    log.info("Invoice %s posted to QBO as bill %s", invoice_id, invoice.qbo_bill_id)


# ---------- Helpers ----------


async def _resolve_vendor(session: AsyncSession, invoice: Invoice) -> Vendor:
    if not invoice.vendor_id:
        raise ValueError("Vendor must be selected before posting to QBO")
    vendor = await session.get(Vendor, invoice.vendor_id)
    if vendor is None:
        raise ValueError(f"Vendor {invoice.vendor_id} not found")
    if not vendor.qbo_id:
        raise ValueError(
            f"Vendor {vendor.display_name!r} has no QBO ID — run Sync Vendors first"
        )
    return vendor


async def _resolve_project(session: AsyncSession, invoice: Invoice) -> Project | None:
    if not invoice.project_id:
        return None
    project = await session.get(Project, invoice.project_id)
    if project is None or not project.qbo_id:
        return None
    return project


def _default_expense_account_id(token: QboToken) -> str:
    if token.default_expense_account_id:
        return token.default_expense_account_id
    settings = get_settings()
    env_value = settings.qbo_default_expense_account_id
    if env_value:
        return env_value
    raise ValueError(
        "No default expense account configured — set one on the Settings page "
        "or via QBO_DEFAULT_EXPENSE_ACCOUNT_ID."
    )


def _build_bill_payload(
    invoice: Invoice,
    vendor: Vendor,
    project: Project | None,
    default_account_id: str,
) -> dict[str, Any]:
    # If the extractor produced line items, use them; otherwise fall back to a
    # single line item for the full total.
    line_items = _build_lines(invoice, project, default_account_id)

    payload: dict[str, Any] = {
        "VendorRef": {"value": vendor.qbo_id},
        "Line": line_items,
    }
    if invoice.invoice_date:
        payload["TxnDate"] = invoice.invoice_date.isoformat()
    if invoice.due_date:
        payload["DueDate"] = invoice.due_date.isoformat()
    if invoice.invoice_number:
        payload["DocNumber"] = invoice.invoice_number[:21]  # QBO caps at 21 chars
    private_note = _compose_private_note(invoice)
    if private_note:
        payload["PrivateNote"] = private_note[:4000]
    if invoice.currency and invoice.currency != "USD":
        payload["CurrencyRef"] = {"value": invoice.currency}
    return payload


def _build_lines(
    invoice: Invoice,
    project: Project | None,
    default_account_id: str,
) -> list[dict[str, Any]]:
    lines: list[dict[str, Any]] = []

    # Use extracted line items when we have useful amounts
    usable = [
        li
        for li in (invoice.line_items or [])
        if isinstance(li, dict) and li.get("amount_cents") not in (None, 0)
    ]
    if usable:
        for li in usable:
            amount = (li["amount_cents"] or 0) / 100
            description = (li.get("description") or "").strip() or None
            detail: dict[str, Any] = {"AccountRef": {"value": default_account_id}}
            if project and project.qbo_type == "Customer":
                detail["CustomerRef"] = {"value": project.qbo_id}
                detail["BillableStatus"] = "NotBillable"
            if project and project.qbo_type == "Class":
                detail["ClassRef"] = {"value": project.qbo_id}
            line: dict[str, Any] = {
                "DetailType": "AccountBasedExpenseLineDetail",
                "Amount": round(amount, 2),
                "AccountBasedExpenseLineDetail": detail,
            }
            if description:
                line["Description"] = description[:4000]
            lines.append(line)
        return lines

    # Fallback: single line for the full total
    total = (invoice.total_cents or 0) / 100
    if total <= 0:
        raise ValueError("Invoice has no total and no line items — can't build Bill")
    detail = {"AccountRef": {"value": default_account_id}}
    if project and project.qbo_type == "Customer":
        detail["CustomerRef"] = {"value": project.qbo_id}
        detail["BillableStatus"] = "NotBillable"
    if project and project.qbo_type == "Class":
        detail["ClassRef"] = {"value": project.qbo_id}
    lines.append(
        {
            "DetailType": "AccountBasedExpenseLineDetail",
            "Amount": round(total, 2),
            "Description": f"Invoice {invoice.invoice_number or invoice.id}",
            "AccountBasedExpenseLineDetail": detail,
        }
    )
    return lines


def _compose_private_note(invoice: Invoice) -> str:
    parts: list[str] = []
    if invoice.po_number:
        parts.append(f"PO: {invoice.po_number}")
    if invoice.notes:
        parts.append(invoice.notes)
    parts.append(f"Portal invoice ID: {invoice.id}")
    return " \u2014 ".join(parts)
