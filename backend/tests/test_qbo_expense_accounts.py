"""Covers the default-expense-account picker feed.

Regression: the picker was empty in production, which blocks every QBO post
(``_default_expense_account_id`` raises when no default is set). The endpoint
had no test at all.
"""
from __future__ import annotations

import os

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test.db")

from app.services import qbo_client

ACCOUNTS = [
    {"Id": "1", "Name": "Job Materials", "AccountType": "Cost of Goods Sold", "Active": True},
    {"Id": "2", "Name": "Office Supplies", "AccountType": "Expense", "Active": True},
    {"Id": "3", "Name": "Interest Paid", "AccountType": "Other Expense", "Active": True},
    {"Id": "4", "Name": "Checking", "AccountType": "Bank", "Active": True},
    {"Id": "5", "Name": "Old Expense", "AccountType": "Expense", "Active": False},
]


def _stub_query(rows, seen: list[str]):
    async def fake_qbo_query(_session, sql: str):
        seen.append(sql)
        return rows

    return fake_qbo_query


@pytest.mark.asyncio
async def test_returns_expense_accounts_without_a_where_clause(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[str] = []
    monkeypatch.setattr(qbo_client, "qbo_query", _stub_query(ACCOUNTS, seen))

    result = await qbo_client.fetch_expense_accounts(None)

    # The filtered WHERE clause is what we suspect QBO choked on; keep the
    # wire query as bare as the vendor/customer/class syncs that work.
    assert seen == ["SELECT * FROM Account"]
    assert [a["Id"] for a in result] == ["1", "2", "3"]  # no Bank, no inactive


@pytest.mark.asyncio
async def test_missing_active_attribute_counts_as_active(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # QBO omits attributes with no value, so absent Active must not drop the row.
    rows = [{"Id": "9", "Name": "Subcontractors", "AccountType": "Expense"}]
    monkeypatch.setattr(qbo_client, "qbo_query", _stub_query(rows, []))

    assert [a["Id"] for a in await qbo_client.fetch_expense_accounts(None)] == ["9"]


@pytest.mark.asyncio
async def test_falls_back_to_all_active_when_no_type_matches(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # A chart of accounts using unexpected types must not yield an empty
    # picker — that leaves AP unable to post anything at all.
    rows = [
        {"Id": "1", "Name": "Weird Cost", "AccountType": "Other Current Asset", "Active": True},
        {"Id": "2", "Name": "Closed", "AccountType": "Bank", "Active": False},
    ]
    monkeypatch.setattr(qbo_client, "qbo_query", _stub_query(rows, []))

    assert [a["Id"] for a in await qbo_client.fetch_expense_accounts(None)] == ["1"]


@pytest.mark.asyncio
async def test_empty_company_returns_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(qbo_client, "qbo_query", _stub_query([], []))

    assert await qbo_client.fetch_expense_accounts(None) == []


def test_api_error_str_carries_the_qbo_fault_body() -> None:
    # The reason a 400 was undiagnosable: str(exc) dropped the body, so the
    # 502 detail and invoice.qbo_post_error both read "failed (400)" and no more.
    exc = qbo_client.QboApiError(
        "QBO GET /query failed (400)",
        status_code=400,
        body='{"Fault":{"Error":[{"Message":"QueryParserError"}]}}',
    )

    assert "QueryParserError" in str(exc)
    assert str(qbo_client.QboApiError("boom")) == "boom"
