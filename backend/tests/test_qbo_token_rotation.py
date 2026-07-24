"""Token rotation must survive a failed request.

Regression (REL-54): ``ensure_fresh_token`` staged the refreshed tokens with
``session.flush()``. Intuit invalidates the previous refresh token the moment
it issues a new one, so when the calling request later failed — a QBO 5xx, a
deploy restarting the container — ``get_session`` rolled the rotation back and
the stored refresh token was permanently dead. Production lost its QBO
connection this way on 2026-07-15 and nobody noticed for nine days, because
``/status`` reported ``connected: true`` off a stale ``refresh_expires_at``.
"""
from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test.db")

from app.models.qbo_token import QboToken
from app.routers.qbo import _needs_reconnect
from app.services import qbo_client


async def _factory(tmp_path, name: str) -> async_sessionmaker[AsyncSession]:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/{name}.db")
    # WAL lets the out-of-band writer commit while the request session still
    # holds its read transaction. Postgres handles this natively in production.
    async with engine.connect() as conn:
        await conn.exec_driver_sql("PRAGMA journal_mode=WAL")
    async with engine.begin() as conn:
        await conn.run_sync(QboToken.__table__.create)
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def _expiring_token() -> QboToken:
    now = datetime.now(UTC)
    return QboToken(
        id=1,
        realm_id="realm-123",
        access_token="old-access",
        refresh_token="old-refresh",
        expires_at=now - timedelta(minutes=1),  # due for refresh
        refresh_expires_at=now + timedelta(days=90),
        default_expense_account_id="acct-77",
    )


ROTATED = {
    "access_token": "new-access",
    "refresh_token": "new-refresh",
    "expires_in": 3600,
    "x_refresh_token_expires_in": 8726400,  # ~101 days, Intuit's rolling window
}


@pytest.mark.asyncio
async def test_rotation_survives_a_rollback_of_the_calling_request(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    factory = await _factory(tmp_path, "rollback")
    monkeypatch.setattr(qbo_client, "AsyncSessionLocal", factory, raising=False)

    async def fake_refresh(_refresh_token: str):
        return ROTATED

    monkeypatch.setattr(qbo_client, "refresh_access_token", fake_refresh)

    async with factory() as session:
        session.add(_expiring_token())
        await session.commit()

    # A request that refreshes the token and then blows up, exactly as a QBO
    # 5xx would: get_session rolls the request session back on any exception.
    async with factory() as session:
        await qbo_client.ensure_fresh_token(session)
        await session.rollback()

    async with factory() as session:
        row = await session.get(QboToken, 1)
        assert row is not None
        # This is the whole bug: pre-fix these were still the old values.
        assert row.refresh_token == "new-refresh"
        assert row.access_token == "new-access"
        assert row.default_expense_account_id == "acct-77"  # untouched


@pytest.mark.asyncio
async def test_refresh_resets_the_rolling_expiry_window(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    factory = await _factory(tmp_path, "window")
    monkeypatch.setattr(qbo_client, "AsyncSessionLocal", factory, raising=False)
    monkeypatch.setattr(qbo_client, "refresh_access_token", lambda _t: _async(ROTATED))

    async with factory() as session:
        session.add(_expiring_token())
        await session.commit()

    async with factory() as session:
        await qbo_client.ensure_fresh_token(session)

    async with factory() as session:
        row = await session.get(QboToken, 1)
        exp = row.refresh_expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=UTC)
        # Pushed back out to ~101 days, so a connection in regular use never
        # needs a manual reconnect.
        assert exp > datetime.now(UTC) + timedelta(days=99)
        assert not _needs_reconnect(exp)


@pytest.mark.asyncio
async def test_rejected_refresh_token_is_recorded_as_expired(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    factory = await _factory(tmp_path, "rejected")
    monkeypatch.setattr(qbo_client, "AsyncSessionLocal", factory, raising=False)

    async def fake_refresh(_refresh_token: str):
        raise qbo_client.QboApiError(
            "Token refresh failed (400)", status_code=400, body='{"error":"invalid_grant"}'
        )

    monkeypatch.setattr(qbo_client, "refresh_access_token", fake_refresh)

    async with factory() as session:
        session.add(_expiring_token())
        await session.commit()

    async with factory() as session:
        with pytest.raises(qbo_client.QboApiError):
            await qbo_client.ensure_fresh_token(session)
        await session.rollback()  # as get_session does

    async with factory() as session:
        row = await session.get(QboToken, 1)
        exp = row.refresh_expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=UTC)
        # /status must now surface the reconnect banner rather than claiming
        # a healthy connection while every call 502s.
        assert _needs_reconnect(exp)


@pytest.mark.asyncio
async def test_transient_failure_does_not_condemn_the_token(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    factory = await _factory(tmp_path, "transient")
    monkeypatch.setattr(qbo_client, "AsyncSessionLocal", factory, raising=False)

    async def fake_refresh(_refresh_token: str):
        raise qbo_client.QboApiError("Token refresh failed (503)", status_code=503, body="nope")

    monkeypatch.setattr(qbo_client, "refresh_access_token", fake_refresh)

    async with factory() as session:
        session.add(_expiring_token())
        await session.commit()

    async with factory() as session:
        with pytest.raises(qbo_client.QboApiError):
            await qbo_client.ensure_fresh_token(session)
        await session.rollback()

    async with factory() as session:
        row = await session.get(QboToken, 1)
        exp = row.refresh_expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=UTC)
        # An Intuit outage is not proof the refresh token is dead.
        assert not _needs_reconnect(exp)


def test_missing_rotation_keeps_the_existing_refresh_token() -> None:
    # Intuit returns the same refresh token for a while before rotating; don't
    # blank it out when the key is absent.
    fields = qbo_client._refreshed_token_fields(
        {"access_token": "a", "expires_in": 3600}, "keep-me"
    )

    assert fields["refresh_token"] == "keep-me"
    assert "refresh_expires_at" not in fields  # no window reset offered


async def _async(value):
    return value
