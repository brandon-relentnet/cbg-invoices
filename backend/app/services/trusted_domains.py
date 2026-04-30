"""Logic around the email-domain allowlist.

The allowlist powers the ``unknown_sender`` triage signal. We *don't*
hard-gate on it (per the design — high-confidence invoices from
unknown senders still go to the main queue), so this service is mostly
about computing whether a given sender's domain is recognised, plus
keeping the table populated as QBO vendors come and go.

Domain extraction uses a "registrable form" (eTLD+1) heuristic so
``billing.silvercote.com`` and ``accountspayable@silvercote.com`` both
match a single ``silvercote.com`` entry. This is good enough for
matching vendor email domains; we don't need a full Public Suffix List
implementation for that.
"""
from __future__ import annotations

import logging
import re
from typing import Iterable
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.trusted_sender_domain import TrustedSenderDomain
from app.models.vendor import Vendor

log = logging.getLogger(__name__)


# Country-code TLDs we know take a 2-part suffix (.co.uk, .com.au, …).
# The full Public Suffix List has hundreds of entries; we cover the
# common construction-trade vendor cases and degrade gracefully (a
# `*.co.uk` domain would otherwise collapse to `co.uk`, breaking
# vendor matching).
_TWO_PART_SUFFIXES = frozenset(
    {
        "co.uk",
        "co.nz",
        "co.za",
        "co.in",
        "co.jp",
        "co.kr",
        "com.au",
        "com.br",
        "com.cn",
        "com.mx",
        "com.sg",
        "ne.jp",
        "ac.uk",
        "gov.uk",
        "org.uk",
        "net.au",
        "org.au",
    }
)


_EMAIL_RE = re.compile(r"<([^>]+@[^>]+)>")


def _strip_email_address_from_string(value: str) -> str:
    """Pull the bare email from formats like ``"Name" <addr@domain.com>``."""
    match = _EMAIL_RE.search(value)
    return match.group(1) if match else value


def extract_registrable_domain(email_or_host: str | None) -> str | None:
    """Return the registrable form of an email/host, lowercase.

    Returns None when the input is empty, malformed, or has no real
    hostname. Examples:

      "billing@silvercote.com"   → "silvercote.com"
      "x@mail.acme.co.uk"        → "acme.co.uk"
      "x@subdomain.example.com"  → "example.com"
      "Vendor <hi@vendor.com>"   → "vendor.com"
      "garbage"                  → None
    """
    if not email_or_host:
        return None
    raw = _strip_email_address_from_string(email_or_host).strip().lower()
    # Email part after the @, or whole thing if no @.
    if "@" in raw:
        host = raw.rsplit("@", 1)[1]
    else:
        host = raw
    # Strip any port.
    host = host.split(":", 1)[0].strip().rstrip(".")
    if not host or "." not in host:
        return None

    parts = host.split(".")
    # Two-part suffix? (e.g. co.uk → keep the 3 trailing labels)
    last_two = ".".join(parts[-2:])
    if last_two in _TWO_PART_SUFFIXES and len(parts) >= 3:
        return ".".join(parts[-3:])
    return last_two


async def is_trusted(session: AsyncSession, sender: str | None) -> bool:
    """True when the sender's registrable domain is in the allowlist."""
    domain = extract_registrable_domain(sender)
    if not domain:
        return False
    row = await session.execute(
        select(TrustedSenderDomain.id).where(TrustedSenderDomain.domain == domain)
    )
    return row.first() is not None


async def list_domains(session: AsyncSession) -> list[TrustedSenderDomain]:
    rows = await session.execute(
        select(TrustedSenderDomain).order_by(TrustedSenderDomain.domain.asc())
    )
    return list(rows.scalars().all())


async def upsert_manual(
    session: AsyncSession,
    *,
    domain: str,
    actor_id: str,
    actor_email: str | None,
    notes: str | None = None,
    source: str = "manual",
) -> TrustedSenderDomain:
    """Add (or refresh metadata on) a manually-added trusted domain.

    Idempotent: if the domain already exists with source=qbo_sync, we
    leave it alone (the auto-sync wins). If it's manual and being
    re-added, we just update the metadata. Use ``source='promoted_from_triage'``
    to mark domains added through the triage UI's "Trust sender"
    action so we can tell them apart in the Settings list.
    """
    canonical = extract_registrable_domain(domain)
    if not canonical:
        raise ValueError(f"Not a valid email domain: {domain!r}")

    existing = await session.scalar(
        select(TrustedSenderDomain).where(TrustedSenderDomain.domain == canonical)
    )
    if existing:
        # qbo_sync entries stay auto-managed — we don't override.
        if existing.source == "qbo_sync":
            return existing
        existing.added_by_id = actor_id
        existing.added_by_email = actor_email
        existing.notes = notes
        existing.source = source
        return existing

    row = TrustedSenderDomain(
        domain=canonical,
        source=source,
        added_by_id=actor_id,
        added_by_email=actor_email,
        notes=notes,
    )
    session.add(row)
    await session.flush()
    return row


async def remove_manual(session: AsyncSession, domain_id: UUID) -> TrustedSenderDomain | None:
    """Remove a manual or promoted-from-triage entry.

    Refuses to delete qbo_sync entries — those reappear on the next
    sync, so removing them would be confusing. Caller surfaces a 409.
    Returns the deleted row (for audit logging) or None if not found.
    """
    row = await session.get(TrustedSenderDomain, domain_id)
    if row is None:
        return None
    if row.source == "qbo_sync":
        raise ValueError(
            "QBO-synced domains can't be manually removed. Remove or "
            "edit the vendor in QBO and re-run sync."
        )
    await session.delete(row)
    return row


async def sync_from_vendor_emails(session: AsyncSession) -> dict[str, int]:
    """Refresh the qbo_sync entries based on current Vendor email addresses.

    Idempotent: existing qbo_sync rows whose vendor still contributes a
    matching domain stay in place. Vendors that no longer have an
    email or whose domain is no longer represented have their qbo_sync
    rows removed (the manual/promoted entries are untouched).

    Returns a small report: ``{"added": int, "removed": int, "kept": int}``.
    """
    # Build the desired set of (domain, vendor_id) pairs from the current
    # vendor table. We pick the *first* vendor per domain so the FK
    # backref is meaningful; if multiple vendors share a domain we still
    # only keep one row.
    vendors = (
        await session.execute(
            select(Vendor.id, Vendor.email)
            .where(Vendor.active.is_(True))
            .order_by(Vendor.created_at.asc())
        )
    ).all()
    desired: dict[str, UUID] = {}
    for vendor_id, email in vendors:
        domain = extract_registrable_domain(email)
        if not domain:
            continue
        # First-write-wins so we keep a stable backref across syncs.
        desired.setdefault(domain, vendor_id)

    # What's currently auto-synced?
    current_rows = (
        await session.execute(
            select(TrustedSenderDomain).where(
                TrustedSenderDomain.source == "qbo_sync"
            )
        )
    ).scalars().all()
    current_by_domain = {row.domain: row for row in current_rows}

    added = 0
    kept = 0
    for domain, vendor_id in desired.items():
        if domain in current_by_domain:
            row = current_by_domain[domain]
            if row.qbo_vendor_id != vendor_id:
                row.qbo_vendor_id = vendor_id
            kept += 1
        else:
            # If the domain is already in the table from a manual /
            # promoted-from-triage flow, leave it alone — it's already
            # trusted and we shouldn't downgrade its source.
            already = await session.scalar(
                select(TrustedSenderDomain).where(
                    TrustedSenderDomain.domain == domain
                )
            )
            if already:
                continue
            session.add(
                TrustedSenderDomain(
                    domain=domain,
                    source="qbo_sync",
                    qbo_vendor_id=vendor_id,
                )
            )
            added += 1

    # Remove qbo_sync rows that no longer correspond to any vendor's
    # email domain.
    removed = 0
    stale_domains = set(current_by_domain) - set(desired)
    if stale_domains:
        await session.execute(
            delete(TrustedSenderDomain).where(
                TrustedSenderDomain.source == "qbo_sync",
                TrustedSenderDomain.domain.in_(stale_domains),
            )
        )
        removed = len(stale_domains)

    return {"added": added, "kept": kept, "removed": removed}
