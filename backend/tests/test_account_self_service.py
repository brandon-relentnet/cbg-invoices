"""The current-password gate on POST /users/me/password."""
from __future__ import annotations

import os
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test.db")

from app.routers import users


def _user() -> SimpleNamespace:
    return SimpleNamespace(id="u1", email="u1@example.com", name="U1")


def _patch(monkeypatch: pytest.MonkeyPatch, *, needs_password: bool, verify_ok: bool) -> dict:
    calls: dict = {"set": None, "verified": None}

    async def fake_custom(_uid):
        return {"needs_password": needs_password}

    async def fake_verify(_uid, pw):
        calls["verified"] = pw
        return verify_ok

    async def fake_set(_uid, pw):
        calls["set"] = pw

    async def fake_patch_custom(_uid, _merge):
        return {}

    monkeypatch.setattr(users.logto_admin, "get_user_custom_data", fake_custom)
    monkeypatch.setattr(users.logto_admin, "verify_user_password", fake_verify)
    monkeypatch.setattr(users.logto_admin, "set_user_password", fake_set)
    monkeypatch.setattr(users.logto_admin, "patch_user_custom_data", fake_patch_custom)
    return calls


NEW_PW = "NewPassw0rd!"


@pytest.mark.asyncio
async def test_first_time_setup_needs_no_current(monkeypatch) -> None:
    calls = _patch(monkeypatch, needs_password=True, verify_ok=False)
    await users.set_my_password(users.SetPasswordRequest(password=NEW_PW), _user())
    assert calls["set"] == NEW_PW
    assert calls["verified"] is None  # verify never called


@pytest.mark.asyncio
async def test_change_requires_current(monkeypatch) -> None:
    calls = _patch(monkeypatch, needs_password=False, verify_ok=True)
    with pytest.raises(HTTPException) as exc:
        await users.set_my_password(users.SetPasswordRequest(password=NEW_PW), _user())
    assert exc.value.status_code == 400
    assert calls["set"] is None


@pytest.mark.asyncio
async def test_change_rejects_wrong_current(monkeypatch) -> None:
    calls = _patch(monkeypatch, needs_password=False, verify_ok=False)
    with pytest.raises(HTTPException) as exc:
        await users.set_my_password(
            users.SetPasswordRequest(password=NEW_PW, current_password="nope"), _user()
        )
    assert exc.value.status_code == 400
    assert calls["set"] is None


@pytest.mark.asyncio
async def test_change_with_correct_current(monkeypatch) -> None:
    calls = _patch(monkeypatch, needs_password=False, verify_ok=True)
    await users.set_my_password(
        users.SetPasswordRequest(password=NEW_PW, current_password="old"), _user()
    )
    assert calls["verified"] == "old"
    assert calls["set"] == NEW_PW
