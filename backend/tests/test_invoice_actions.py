"""Integration tests for the role-aware review actions: claim, admin
direct-approve, and the claim reset on reassignment.

These exercise the endpoint functions against a real (sqlite) session so the
authz + state transitions are covered end-to-end, not just the guard helpers.
"""
from __future__ import annotations

import os
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi import BackgroundTasks, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test.db")

from app.models.audit_log import AuditLog
from app.models.invoice import Invoice, InvoiceStatus
from app.models.user_notification_prefs import UserNotificationPrefs
from app.routers import invoices
from app.schemas.invoice import AssignInvoiceRequest


async def _session_factory(tmp_path, name: str) -> async_sessionmaker[AsyncSession]:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/{name}.db")
    async with engine.begin() as conn:
        await conn.run_sync(Invoice.__table__.create)
        await conn.run_sync(AuditLog.__table__.create)
        await conn.run_sync(UserNotificationPrefs.__table__.create)
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def _user(uid: str) -> SimpleNamespace:
    return SimpleNamespace(id=uid, email=f"{uid}@example.com", name=uid)


async def _make_invoice(session: AsyncSession, **overrides) -> Invoice:
    inv = Invoice(
        source="upload",
        received_at=datetime.now(UTC),
        pdf_storage_key="k",
        pdf_filename="f.pdf",
        pdf_size_bytes=100,
        status=InvoiceStatus.READY_FOR_REVIEW,
        vendor_name="Acme",
        total_cents=1000,
        currency="USD",
        line_items=[],
        **overrides,
    )
    session.add(inv)
    await session.commit()
    return inv


@pytest.fixture(autouse=True)
def _stub_presign(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_presign(_key: str) -> str:
        return "https://example.test/pdf"

    monkeypatch.setattr(invoices.storage, "presign_url", fake_presign)


def _patch_role(monkeypatch: pytest.MonkeyPatch, role: str) -> None:
    async def fake_role(_uid: str) -> str:
        return role

    monkeypatch.setattr(invoices.logto_admin, "user_app_role", fake_role)


@pytest.mark.asyncio
async def test_claim_sets_timestamp_and_is_idempotent(tmp_path) -> None:
    factory = await _session_factory(tmp_path, "claim")
    async with factory() as session:
        inv = await _make_invoice(session, assigned_to_id="user-1")

        await invoices.claim_invoice(inv.id, _user("user-1"), session)
        first = (await session.get(Invoice, inv.id)).claimed_at
        assert first is not None

        # Claiming again is a no-op — no error, timestamp unchanged.
        await invoices.claim_invoice(inv.id, _user("user-1"), session)
        assert (await session.get(Invoice, inv.id)).claimed_at == first


@pytest.mark.asyncio
async def test_claim_rejected_for_non_assignee(tmp_path) -> None:
    factory = await _session_factory(tmp_path, "claim_other")
    async with factory() as session:
        inv = await _make_invoice(session, assigned_to_id="user-1")

        with pytest.raises(HTTPException) as exc:
            await invoices.claim_invoice(inv.id, _user("user-2"), session)
        assert exc.value.status_code == 403
        assert (await session.get(Invoice, inv.id)).claimed_at is None


@pytest.mark.asyncio
async def test_admin_approves_unassigned_invoice(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_role(monkeypatch, "admin")
    factory = await _session_factory(tmp_path, "approve")
    async with factory() as session:
        inv = await _make_invoice(session, assigned_to_id=None)

        await invoices.approve_invoice(inv.id, _user("admin-1"), session)

        refreshed = await session.get(Invoice, inv.id)
        assert refreshed.status == InvoiceStatus.APPROVED
        assert refreshed.assigned_to_id is None  # "skip assign" — stays unassigned
        assert refreshed.reviewed_by == "admin-1"


@pytest.mark.asyncio
async def test_member_cannot_approve_unassigned_invoice(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_role(monkeypatch, "member")
    factory = await _session_factory(tmp_path, "approve_member")
    async with factory() as session:
        inv = await _make_invoice(session, assigned_to_id=None)

        with pytest.raises(HTTPException) as exc:
            await invoices.approve_invoice(inv.id, _user("member-1"), session)
        assert exc.value.status_code == 403
        assert (await session.get(Invoice, inv.id)).status == InvoiceStatus.READY_FOR_REVIEW


@pytest.mark.asyncio
async def test_reassign_resets_claim(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_role(monkeypatch, "admin")
    factory = await _session_factory(tmp_path, "reassign")
    async with factory() as session:
        inv = await _make_invoice(
            session, assigned_to_id="user-1", claimed_at=datetime.now(UTC)
        )

        body = AssignInvoiceRequest(
            user_id="user-2", user_email="u2@example.com", user_name="User Two"
        )
        await invoices.assign_invoice(inv.id, body, _user("admin-1"), session, BackgroundTasks())

        refreshed = await session.get(Invoice, inv.id)
        assert refreshed.assigned_to_id == "user-2"
        assert refreshed.claimed_at is None  # claim signal cleared on reassignment


# ---------- assignment email gating ----------


@pytest.mark.asyncio
async def test_assign_queues_email_by_default(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_role(monkeypatch, "admin")
    factory = await _session_factory(tmp_path, "assign_email")
    async with factory() as session:
        inv = await _make_invoice(session, assigned_to_id=None)
        body = AssignInvoiceRequest(
            user_id="user-2", user_email="u2@example.com", user_name="U2"
        )
        bg = BackgroundTasks()
        await invoices.assign_invoice(inv.id, body, _user("admin-1"), session, bg)
        assert len(bg.tasks) == 1  # email queued


@pytest.mark.asyncio
async def test_assign_notify_false_skips_email(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_role(monkeypatch, "admin")
    factory = await _session_factory(tmp_path, "assign_quiet")
    async with factory() as session:
        inv = await _make_invoice(session, assigned_to_id=None)
        body = AssignInvoiceRequest(
            user_id="user-2",
            user_email="u2@example.com",
            user_name="U2",
            notify=False,
        )
        bg = BackgroundTasks()
        await invoices.assign_invoice(inv.id, body, _user("admin-1"), session, bg)
        assert bg.tasks == []  # admin assigned quietly — no email
        # The assignment itself still happened.
        assert (await session.get(Invoice, inv.id)).assigned_to_id == "user-2"


@pytest.mark.asyncio
async def test_assign_respects_recipient_optout(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_role(monkeypatch, "admin")
    factory = await _session_factory(tmp_path, "assign_optout")
    async with factory() as session:
        session.add(
            UserNotificationPrefs(user_id="user-2", assignment_emails=False)
        )
        inv = await _make_invoice(session, assigned_to_id=None)
        body = AssignInvoiceRequest(
            user_id="user-2", user_email="u2@example.com", user_name="U2"
        )
        bg = BackgroundTasks()
        await invoices.assign_invoice(inv.id, body, _user("admin-1"), session, bg)
        assert bg.tasks == []  # recipient opted out of assignment emails


# ---------- posting is admin/owner-only (REL-65) ----------
# PMs code and approve; only admins/owners post to QBO. The assignee who could
# once post their own invoice must now be refused.


async def _approved_coded_invoice(session: AsyncSession, **overrides) -> Invoice:
    """An approved invoice with all four AP coding fields filled, so the only
    thing that can block posting is the authorization check."""
    inv = await _make_invoice(
        session,
        job_number="26-12-02",
        cost_code="01-213.S",
        coding_date=datetime.now(UTC).date(),
        approver="Nathan",
        **overrides,
    )
    inv.status = InvoiceStatus.APPROVED  # _make_invoice hardcodes ready_for_review
    await session.commit()
    return inv


@pytest.mark.asyncio
async def test_member_assignee_cannot_post(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_role(monkeypatch, "member")
    factory = await _session_factory(tmp_path, "post_member")
    async with factory() as session:
        inv = await _approved_coded_invoice(session, assigned_to_id="user-1")

        with pytest.raises(HTTPException) as exc:
            await invoices.post_invoice_to_qbo(inv.id, _user("user-1"), session, BackgroundTasks())
        assert exc.value.status_code == 403
        # Untouched — no post was enqueued.
        assert (await session.get(Invoice, inv.id)).status == InvoiceStatus.APPROVED


@pytest.mark.asyncio
async def test_member_assignee_cannot_approve_and_post(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_role(monkeypatch, "member")
    factory = await _session_factory(tmp_path, "aandp_member")
    async with factory() as session:
        # Fully coded + ready_for_review: pre-fix this member call would have
        # sailed through approve + post, so a 403 here proves the auth gate,
        # not an incidental coding-incomplete 400.
        inv = await _make_invoice(
            session,
            assigned_to_id="user-1",
            job_number="26-12-02",
            cost_code="01-213.S",
            coding_date=datetime.now(UTC).date(),
            approver="Nathan",
        )

        with pytest.raises(HTTPException) as exc:
            await invoices.approve_and_post(inv.id, _user("user-1"), session, BackgroundTasks())
        assert exc.value.status_code == 403
        # The member could have /approve'd it, but approve-and-post must not
        # slip an approval through either.
        assert (await session.get(Invoice, inv.id)).status == InvoiceStatus.READY_FOR_REVIEW


@pytest.mark.asyncio
async def test_admin_can_post(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_role(monkeypatch, "admin")
    factory = await _session_factory(tmp_path, "post_admin")
    async with factory() as session:
        inv = await _approved_coded_invoice(session, assigned_to_id=None)

        bg = BackgroundTasks()
        await invoices.post_invoice_to_qbo(inv.id, _user("admin-1"), session, bg)
        # Posting is enqueued, not run inline.
        assert len(bg.tasks) == 1


@pytest.mark.asyncio
async def test_member_can_still_approve(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    # The gate is on posting only — a PM assignee still approves their own.
    _patch_role(monkeypatch, "member")
    factory = await _session_factory(tmp_path, "approve_own")
    async with factory() as session:
        inv = await _make_invoice(session, assigned_to_id="user-1")

        await invoices.approve_invoice(inv.id, _user("user-1"), session)
        assert (await session.get(Invoice, inv.id)).status == InvoiceStatus.APPROVED
