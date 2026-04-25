"""Invitation flow shared between team-page invites and access-request approvals.

Steps:
  1. Find or create the Logto user (email-only, no password, member role,
     custom_data={needs_password: True, invited_by: <actor id>}).
  2. Mint a fresh one-time token tied to the email (7-day TTL).
  3. Send the branded invite email via Resend (best-effort — caller still
     receives the invite_link to share manually if email failed).

Returns InviteResult so the caller can render an admin response with both
the resulting user record and email-delivery state.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from urllib.parse import quote, urlencode

from app.config import get_settings
from app.services import email as email_service
from app.services import logto_admin

log = logging.getLogger(__name__)


@dataclass
class InviteActor:
    """Minimal actor identity needed to attribute the invite + set reply-to."""

    id: str
    email: str | None
    name: str | None


@dataclass
class InviteResult:
    user: logto_admin.LogtoUser
    invite_link: str
    resent: bool
    email_sent: bool
    email_message_id: str | None
    fallback_notice: str | None


async def invite_email(
    *,
    actor: InviteActor,
    email: str,
    name: str | None = None,
) -> InviteResult:
    existing = await logto_admin.find_user_by_email(email)
    resent = existing is not None
    if existing is not None:
        user = existing
    else:
        user = await logto_admin.create_user(
            email=email,
            name=name,
            password=None,
            custom_data={"needs_password": True, "invited_by": actor.id},
        )
        await logto_admin.replace_user_app_role(user.id, "member")

    token = await logto_admin.create_one_time_token(email=email)
    settings = get_settings()
    invite_link = _build_invite_link(settings.app_base_url, token, email)

    email_sent = False
    message_id: str | None = None
    fallback_notice: str | None = None

    try:
        message_id = await email_service.send_email(
            to=email,
            subject=_subject(resent),
            html=_html(actor=actor, invitee_name=name, link=invite_link, resent=resent),
            text=_text(actor=actor, invitee_name=name, link=invite_link, resent=resent),
            reply_to=actor.email,
        )
        email_sent = True
    except email_service.EmailNotConfigured:
        fallback_notice = (
            "Email is not configured (RESEND_API_KEY). Copy the invite link "
            "and share it manually."
        )
    except email_service.EmailError as exc:
        log.exception("Failed to send invite email")
        fallback_notice = f"Account is ready but email failed to send: {exc}"

    return InviteResult(
        user=user,
        invite_link=invite_link,
        resent=resent,
        email_sent=email_sent,
        email_message_id=message_id,
        fallback_notice=fallback_notice,
    )


# ──────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────


def _build_invite_link(app_base_url: str, token: str, email: str) -> str:
    qs = urlencode({"token": token, "email": email}, quote_via=quote)
    return f"{app_base_url.rstrip('/')}/invite?{qs}"


def _subject(resent: bool) -> str:
    return (
        "Here's your new invite link to the Cambridge Invoice Portal"
        if resent
        else "You've been invited to the Cambridge Invoice Portal"
    )


def _text(*, actor: InviteActor, invitee_name: str | None, link: str, resent: bool) -> str:
    greeting = f"Hi {invitee_name}," if invitee_name else "Hi,"
    who = actor.email or actor.name or "a teammate"
    intro = (
        f"{who} just sent you a fresh invite link to the Cambridge Invoice Portal."
        if resent
        else (
            f"{who} has invited you to join the Cambridge Invoice Portal — "
            "the internal tool Cambridge Building Group uses to review "
            "subcontractor invoices and post them to QuickBooks."
        )
    )
    return (
        f"{greeting}\n\n"
        f"{intro}\n\n"
        f"Click the link below to sign in. This link is valid for 7 days.\n\n"
        f"{link}\n\n"
        "If you weren't expecting this, you can ignore this email.\n"
    )


def _html(*, actor: InviteActor, invitee_name: str | None, link: str, resent: bool) -> str:
    who = actor.email or actor.name or "A teammate"
    greeting = f"Hi {invitee_name}," if invitee_name else "Hi,"
    intro = (
        f"<strong>{who}</strong> just sent you a fresh invite link to the Cambridge Invoice Portal."
        if resent
        else f"<strong>{who}</strong> has invited you to join the <strong>Cambridge Invoice Portal</strong>."
    )
    return f"""\
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#ede5d8;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#1b2830;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ede5d8;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-top:4px solid #c8923c;">
          <tr>
            <td style="padding:32px 32px 20px 32px;">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#c8923c;">
                Cambridge Building Group
              </div>
              <div style="font-family:'DM Serif Display',Georgia,serif;font-size:28px;color:#0b1b25;line-height:1.2;margin-top:4px;">
                You're invited
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 20px 32px;font-size:14px;line-height:1.55;color:#1b2830;">
              <p style="margin:0 0 14px 0;">{greeting}</p>
              <p style="margin:0 0 14px 0;">{intro}</p>
              <p style="margin:0 0 14px 0;">
                Click the button below to sign in. This link is valid for 7 days.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 32px 28px 32px;">
              <a href="{link}" style="display:inline-block;background:#c8923c;color:#0b1b25;text-decoration:none;padding:12px 22px;font-weight:700;font-size:14px;letter-spacing:0.02em;">
                Sign in to the portal &rarr;
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px 32px;font-size:12px;color:#64748b;line-height:1.5;">
              <p style="margin:0 0 8px 0;">Or copy &amp; paste this link into your browser:</p>
              <p style="margin:0;word-break:break-all;font-family:'Courier New',monospace;color:#1b2830;">{link}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px;border-top:1px solid #ede5d8;font-size:11px;color:#94a3b8;">
              If you weren't expecting this email you can safely ignore it.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""
