"""Team management endpoints.

Anyone signed in can manage the team (flat model). The backend uses the
configured Logto M2M credentials to talk to Logto's Management API, and
sends invite emails via Resend.
"""
from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from app.config import get_settings
from app.deps import CurrentUser, get_current_user
from app.services import email as email_service
from app.services import logto_admin

log = logging.getLogger(__name__)
router = APIRouter(tags=["users"])


class UserOut(BaseModel):
    id: str
    email: str | None
    name: str | None
    username: str | None
    created_at: int
    last_sign_in_at: int | None


class UserListResponse(BaseModel):
    users: list[UserOut]


class InviteUserRequest(BaseModel):
    email: EmailStr
    name: str | None = Field(default=None, max_length=256)


class InviteUserResponse(BaseModel):
    user: UserOut
    invite_link: str
    email_sent: bool
    email_message_id: str | None = None
    # Present only when email sending is not configured — the admin can copy
    # and share the link manually.
    fallback_notice: str | None = None


def _serialize(u: logto_admin.LogtoUser) -> UserOut:
    return UserOut(
        id=u.id,
        email=u.primary_email,
        name=u.name,
        username=u.username,
        created_at=u.created_at,
        last_sign_in_at=u.last_sign_in_at,
    )


@router.get("", response_model=UserListResponse)
async def list_team(
    _user: Annotated[CurrentUser, Depends(get_current_user)],
):
    try:
        users = await logto_admin.list_users(limit=100)
    except logto_admin.LogtoAdminNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except logto_admin.LogtoAdminError as exc:
        log.exception("Failed to list Logto users")
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return UserListResponse(users=[_serialize(u) for u in users])


@router.post("/invite", response_model=InviteUserResponse, status_code=201)
async def invite_user(
    body: InviteUserRequest,
    inviter: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Invite a new user OR resend an invite to an existing one.

    Flow:
      1. Create the Logto user (if missing) without a password.
      2. Generate a one-time token tied to the email (7-day validity).
      3. Send an email via Resend with a magic link to `/invite?token=…&email=…`.
         The frontend route consumes the token and completes sign-in via Logto.
    """
    try:
        existing = await logto_admin.find_user_by_email(body.email)
    except logto_admin.LogtoAdminNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except logto_admin.LogtoAdminError as exc:
        log.exception("Failed to check existing user")
        raise HTTPException(status_code=exc.status_code or 502, detail=str(exc)) from exc

    resent = False
    user: logto_admin.LogtoUser
    if existing:
        user = existing
        resent = True
    else:
        try:
            user, _ = await logto_admin.create_user(email=body.email, name=body.name)
        except logto_admin.LogtoAdminError as exc:
            status = exc.status_code or 502
            log.exception("Failed to create Logto user")
            raise HTTPException(status_code=status, detail=str(exc)) from exc

    # Always mint a fresh one-time token (even on resend — the old one is
    # effectively invalidated by being unused; Logto accepts multiple active
    # tokens for the same email but only the newest one will be the useful one).
    try:
        token = await logto_admin.create_one_time_token(email=body.email)
    except logto_admin.LogtoAdminError as exc:
        log.exception("Failed to create one-time token")
        raise HTTPException(
            status_code=exc.status_code or 502,
            detail=f"Couldn't create magic link: {exc}",
        ) from exc

    settings = get_settings()
    invite_link = _build_invite_link(settings.app_base_url, token, body.email)

    email_sent = False
    email_message_id: str | None = None
    fallback_notice: str | None = None

    try:
        email_message_id = await email_service.send_email(
            to=body.email,
            subject=_invite_subject(resent),
            html=_invite_html(
                inviter=inviter, invitee_name=body.name, link=invite_link, resent=resent
            ),
            text=_invite_text(
                inviter=inviter, invitee_name=body.name, link=invite_link, resent=resent
            ),
            reply_to=inviter.email,
        )
        email_sent = True
    except email_service.EmailNotConfigured:
        fallback_notice = (
            "Email is not configured (RESEND_API_KEY). Copy the invite link and "
            "share it manually."
        )
    except email_service.EmailError as exc:
        log.exception("Failed to send invite email")
        fallback_notice = f"We created the account but email failed to send: {exc}"

    return InviteUserResponse(
        user=_serialize(user),
        invite_link=invite_link,
        email_sent=email_sent,
        email_message_id=email_message_id,
        fallback_notice=fallback_notice,
    )


@router.delete("/{user_id}", status_code=204)
async def remove_user(
    user_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
):
    if user_id == user.id:
        raise HTTPException(status_code=400, detail="You can't remove yourself")
    try:
        await logto_admin.delete_user(user_id)
    except logto_admin.LogtoAdminNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except logto_admin.LogtoAdminError as exc:
        if exc.status_code == 404:
            raise HTTPException(status_code=404, detail="User not found") from exc
        log.exception("Failed to delete Logto user")
        raise HTTPException(status_code=exc.status_code or 502, detail=str(exc)) from exc


# ──────────────────────────────────────────────────────────────────────────
# Email templates
# ──────────────────────────────────────────────────────────────────────────


def _build_invite_link(app_base_url: str, token: str, email: str) -> str:
    from urllib.parse import quote, urlencode

    qs = urlencode({"token": token, "email": email}, quote_via=quote)
    return f"{app_base_url.rstrip('/')}/invite?{qs}"


def _invite_subject(resent: bool) -> str:
    return (
        "Here's your new invite link to the Cambridge Invoice Portal"
        if resent
        else "You've been invited to the Cambridge Invoice Portal"
    )


def _invite_text(
    *,
    inviter: CurrentUser,
    invitee_name: str | None,
    link: str,
    resent: bool,
) -> str:
    greeting = f"Hi {invitee_name}," if invitee_name else "Hi,"
    who = inviter.email or inviter.name or "a teammate"
    intro = (
        f"{who} just sent you a fresh invite link to the Cambridge Invoice Portal."
        if resent
        else f"{who} has invited you to join the Cambridge Invoice Portal — the internal tool Cambridge Building Group uses to review subcontractor invoices and post them to QuickBooks."
    )
    return (
        f"{greeting}\n\n"
        f"{intro}\n\n"
        f"Click the link below to sign in. This link is valid for 7 days.\n\n"
        f"{link}\n\n"
        "If you weren't expecting this, you can ignore this email.\n"
    )


def _invite_html(
    *,
    inviter: CurrentUser,
    invitee_name: str | None,
    link: str,
    resent: bool,
) -> str:
    who = inviter.email or inviter.name or "A teammate"
    greeting = f"Hi {invitee_name}," if invitee_name else "Hi,"
    intro = (
        f"<strong>{who}</strong> just sent you a fresh invite link to the Cambridge Invoice Portal."
        if resent
        else f"<strong>{who}</strong> has invited you to join the <strong>Cambridge Invoice Portal</strong>."
    )
    # Simple, on-brand HTML. Inline styles for best email-client support.
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
