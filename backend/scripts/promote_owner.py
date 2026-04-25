"""Manually promote a Logto user to the 'owner' role.

The startup seed_initial_owner() promotes the longest-tenured user to owner
on backend boot, but it can no-op if it ran before any users existed or
if the M2M creds weren't set yet. This is the manual escape hatch.

Usage (inside the backend container):
    python scripts/promote_owner.py user@example.com

If the email isn't found, lists all known users so you can copy the right
one. Idempotent — re-running on an already-owner is a no-op.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Allow `python scripts/promote_owner.py` to find the `app` package
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services import logto_admin  # noqa: E402


async def main(email: str) -> int:
    email_lower = email.strip().lower()
    if not email_lower:
        print("usage: python scripts/promote_owner.py <email>", file=sys.stderr)
        return 1

    print(f"→ Looking up user with email {email_lower}…")
    user = await logto_admin.find_user_by_email(email_lower)
    if not user:
        print(f"✖ No user with email {email_lower}", file=sys.stderr)
        print("  Known users:", file=sys.stderr)
        users = await logto_admin.list_users(limit=100)
        for u in users:
            print(f"    {u.id}  {u.primary_email}  {u.name or ''}", file=sys.stderr)
        return 1

    current = await logto_admin.user_app_role(user.id)
    if current == "owner":
        print(f"✓ {email_lower} ({user.id}) is already owner — nothing to do.")
        return 0

    print(f"→ Current role: {current or '(none)'} — promoting to owner…")
    await logto_admin.replace_user_app_role(user.id, "owner")
    print(f"✓ {email_lower} ({user.id}) is now owner.")
    print()
    print("  You may need to sign out and back in, or hard-refresh, for the")
    print("  portal UI to pick up the new role.")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python scripts/promote_owner.py <email>", file=sys.stderr)
        sys.exit(1)
    sys.exit(asyncio.run(main(sys.argv[1])))
