"""Sync vendors and projects (Customers or Classes) from QBO to local DB."""
from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.models.qbo_token import QboToken
from app.models.vendor import Vendor
from app.services import qbo_client

log = logging.getLogger(__name__)


async def sync_vendors(session: AsyncSession) -> int:
    """Upsert every active vendor in QBO. Returns the count synced."""
    rows = await qbo_client.qbo_query(session, "SELECT * FROM Vendor")
    now = datetime.now(UTC)
    count = 0
    for row in rows:
        qbo_id = str(row.get("Id"))
        if not qbo_id:
            continue
        display = row.get("DisplayName") or row.get("CompanyName") or "Unnamed"
        email = None
        if isinstance(row.get("PrimaryEmailAddr"), dict):
            email = row["PrimaryEmailAddr"].get("Address")
        active = bool(row.get("Active", True))

        existing = (
            await session.execute(select(Vendor).where(Vendor.qbo_id == qbo_id))
        ).scalar_one_or_none()
        if existing:
            existing.display_name = display
            existing.email = email
            existing.active = active
            existing.last_synced_at = now
        else:
            session.add(
                Vendor(
                    qbo_id=qbo_id,
                    display_name=display,
                    email=email,
                    active=active,
                    last_synced_at=now,
                )
            )
        count += 1

    # Mark the sync timestamp on the token row
    token = (await session.execute(select(QboToken).where(QboToken.id == 1))).scalar_one_or_none()
    if token:
        token.last_vendor_sync_at = now
    await session.flush()
    log.info("Synced %d vendors from QBO", count)
    return count


async def sync_projects(session: AsyncSession) -> int:
    """Sync projects from either Customers (default) or Classes.

    The project_source setting on QboToken determines which. "Customer" uses sub-
    customers, and "Class" uses QBO Classes. A Customer has `Id` / `DisplayName` /
    `ParentRef.value` / `Active`. A Class has `Id` / `Name` / `ParentRef.value` /
    `Active`.
    """
    token = (await session.execute(select(QboToken).where(QboToken.id == 1))).scalar_one_or_none()
    source = (token.project_source if token else "Customer") or "Customer"

    if source == "Class":
        rows = await qbo_client.qbo_query(session, "SELECT * FROM Class")
        qbo_type = "Class"

        def display(r: dict[str, Any]) -> str:
            return r.get("Name") or r.get("FullyQualifiedName") or "Unnamed"
    else:
        rows = await qbo_client.qbo_query(session, "SELECT * FROM Customer")
        qbo_type = "Customer"

        def display(r: dict[str, Any]) -> str:
            return r.get("DisplayName") or r.get("CompanyName") or "Unnamed"

    now = datetime.now(UTC)
    count = 0
    for row in rows:
        qbo_id = str(row.get("Id"))
        if not qbo_id:
            continue
        parent: str | None = None
        if isinstance(row.get("ParentRef"), dict):
            parent = row["ParentRef"].get("value")
        active = bool(row.get("Active", True))

        existing = (
            await session.execute(select(Project).where(Project.qbo_id == qbo_id))
        ).scalar_one_or_none()
        if existing:
            existing.display_name = display(row)
            existing.qbo_type = qbo_type
            existing.parent_qbo_id = parent
            existing.active = active
            existing.last_synced_at = now
        else:
            session.add(
                Project(
                    qbo_id=qbo_id,
                    qbo_type=qbo_type,
                    display_name=display(row),
                    parent_qbo_id=parent,
                    active=active,
                    last_synced_at=now,
                )
            )
        count += 1

    if token:
        token.last_project_sync_at = now
    await session.flush()
    log.info("Synced %d projects (%s) from QBO", count, qbo_type)
    return count
