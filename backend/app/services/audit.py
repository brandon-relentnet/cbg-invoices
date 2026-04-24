"""Audit log helpers. Every mutation on invoices funnels through here."""
from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog

SYSTEM_ACTOR_ID = "system"


async def record(
    session: AsyncSession,
    *,
    actor_id: str,
    actor_email: str | None,
    action: str,
    invoice_id: UUID | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    message: str | None = None,
) -> AuditLog:
    entry = AuditLog(
        actor_id=actor_id,
        actor_email=actor_email,
        action=action,
        invoice_id=invoice_id,
        before=_clean(before),
        after=_clean(after),
        message=message,
    )
    session.add(entry)
    await session.flush()
    return entry


async def record_system(
    session: AsyncSession,
    *,
    action: str,
    invoice_id: UUID | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    message: str | None = None,
) -> AuditLog:
    return await record(
        session,
        actor_id=SYSTEM_ACTOR_ID,
        actor_email=None,
        action=action,
        invoice_id=invoice_id,
        before=before,
        after=after,
        message=message,
    )


def diff(before: dict[str, Any], after: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Return only the changed keys between two dicts."""
    changed_before: dict[str, Any] = {}
    changed_after: dict[str, Any] = {}
    for key in set(before) | set(after):
        if before.get(key) != after.get(key):
            changed_before[key] = before.get(key)
            changed_after[key] = after.get(key)
    return changed_before, changed_after


def _clean(data: dict[str, Any] | None) -> dict[str, Any] | None:
    """Convert non-JSON-safe values (UUID, datetime, date, Decimal, Enum) to strings."""
    if data is None:
        return None
    return _deep_clean(data)


def _deep_clean(value: Any) -> Any:
    import enum
    from datetime import date, datetime
    from decimal import Decimal
    from uuid import UUID as _UUID

    if isinstance(value, dict):
        return {k: _deep_clean(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_deep_clean(v) for v in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, _UUID):
        return str(value)
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, enum.Enum):
        return value.value
    return value
