"""Team management endpoints.

Role model:
  - owner : cannot be removed, can promote/demote anyone, can remove admins
  - admin : can invite/remove members, promote members to admin
  - member: can do invoice work, no team management

Enforcement lives in this router via the require_admin / require_owner
helpers. Roles are stored in Logto's native role system and fetched per-
request (small team size — no caching yet).
"""
from __future__ import annotations

import logging
import re
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from app.deps import CurrentUser, get_current_user
from app.services import logto_admin
from app.services.invitations import InviteActor, invite_email

log = logging.getLogger(__name__)
router = APIRouter(tags=["users"])


AppRole = Literal["owner", "admin", "member"]
ROLE_RANK: dict[str, int] = {"owner": 3, "admin": 2, "member": 1}


class UserOut(BaseModel):
    id: str
    email: str | None
    name: str | None
    username: str | None
    role: AppRole | None
    needs_password: bool
    created_at: int
    last_sign_in_at: int | None


class MeResponse(UserOut):
    """Current-user view — same shape as UserOut but semantically separate."""


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


async def _serialize(u: logto_admin.LogtoUser) -> UserOut:
    """Attach role + needs_password to the DTO via two cheap Logto lookups."""
    role = await logto_admin.user_app_role(u.id)
    try:
        custom = await logto_admin.get_user_custom_data(u.id)
    except logto_admin.LogtoAdminError:
        custom = {}
    needs_password = bool(custom.get("needs_password"))
    return UserOut(
        id=u.id,
        email=u.primary_email,
        name=u.name,
        username=u.username,
        role=role,  # type: ignore[arg-type]
        needs_password=needs_password,
        created_at=u.created_at,
        last_sign_in_at=u.last_sign_in_at,
    )


async def _get_actor_role(user_id: str) -> AppRole:
    """Fetch the acting user's role. Defaults to 'member' if unset."""
    role = await logto_admin.user_app_role(user_id)
    return role or "member"  # type: ignore[return-value]


def _require(actor_role: AppRole, required: AppRole) -> None:
    if ROLE_RANK[actor_role] < ROLE_RANK[required]:
        raise HTTPException(
            status_code=403,
            detail=f"Requires {required} role — you're {actor_role}",
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
    serialized = [await _serialize(u) for u in users]
    return UserListResponse(users=serialized)


@router.get("/me", response_model=MeResponse)
async def get_me(
    user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Return the current user's profile + role + needs_password flag.

    Returns a 410 Gone if the user's Logto account no longer exists — the
    frontend treats this as a signal to clear the stale session.
    """
    try:
        logto_user = await logto_admin.get_user(user.id)
    except logto_admin.LogtoAdminNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except logto_admin.LogtoAdminError as exc:
        log.exception("Failed to load current user profile")
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if logto_user is None:
        raise HTTPException(
            status_code=410,
            detail="Your account no longer exists. Please sign out and back in.",
        )
    dto = await _serialize(logto_user)
    return MeResponse(**dto.model_dump())


class SetPasswordRequest(BaseModel):
    password: str = Field(min_length=8, max_length=128)


@router.post("/me/password", status_code=204)
async def set_my_password(
    body: SetPasswordRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Let the signed-in user set their own password.

    Runs password policy client-side-lite (length + class diversity) and then
    calls Logto's Management API to persist it. Clears the needs_password
    flag from custom_data on success.
    """
    errors = _validate_password(body.password)
    if errors:
        raise HTTPException(status_code=400, detail="; ".join(errors))
    try:
        await logto_admin.set_user_password(user.id, body.password)
        await logto_admin.patch_user_custom_data(user.id, {"needs_password": False})
    except logto_admin.LogtoAdminError as exc:
        log.exception("Failed to set password")
        raise HTTPException(status_code=exc.status_code or 502, detail=str(exc)) from exc


def _validate_password(pw: str) -> list[str]:
    """Mirror Logto's default policy so we give a better error than 422."""
    errs: list[str] = []
    if len(pw) < 8:
        errs.append("Password must be at least 8 characters")
    classes = [
        bool(re.search(r"[a-z]", pw)),
        bool(re.search(r"[A-Z]", pw)),
        bool(re.search(r"\d", pw)),
        bool(re.search(r"[^\w\s]", pw)),
    ]
    if sum(classes) < 3:
        errs.append(
            "Password must include at least three of: lowercase, uppercase, number, symbol"
        )
    return errs


@router.post("/invite", response_model=InviteUserResponse, status_code=201)
async def invite_user(
    body: InviteUserRequest,
    inviter: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Invite a new user OR resend an invite to an existing one.

    Requires admin role. Delegates to the shared invitations service.
    """
    actor_role = await _get_actor_role(inviter.id)
    _require(actor_role, "admin")

    try:
        result = await invite_email(
            actor=InviteActor(id=inviter.id, email=inviter.email, name=inviter.name),
            email=body.email,
            name=body.name,
        )
    except logto_admin.LogtoAdminNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except logto_admin.LogtoAdminError as exc:
        log.exception("Invite failed")
        raise HTTPException(status_code=exc.status_code or 502, detail=str(exc)) from exc

    return InviteUserResponse(
        user=await _serialize(result.user),
        invite_link=result.invite_link,
        email_sent=result.email_sent,
        email_message_id=result.email_message_id,
        fallback_notice=result.fallback_notice,
    )


@router.delete("/{user_id}", status_code=204)
async def remove_user(
    user_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Remove a team member.

    Rules:
      - You can't remove yourself
      - Members can't remove anyone (admin required)
      - Admins can remove members only
      - Owners can remove admins and members
      - Owner can never be removed via the API
    """
    if user_id == user.id:
        raise HTTPException(status_code=400, detail="You can't remove yourself")
    actor_role = await _get_actor_role(user.id)
    _require(actor_role, "admin")

    target_role = await logto_admin.user_app_role(user_id)
    if target_role == "owner":
        raise HTTPException(status_code=403, detail="The owner can't be removed")
    if target_role == "admin" and actor_role != "owner":
        raise HTTPException(
            status_code=403,
            detail="Only the owner can remove an admin",
        )

    try:
        await logto_admin.delete_user(user_id)
    except logto_admin.LogtoAdminNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except logto_admin.LogtoAdminError as exc:
        if exc.status_code == 404:
            raise HTTPException(status_code=404, detail="User not found") from exc
        log.exception("Failed to delete Logto user")
        raise HTTPException(status_code=exc.status_code or 502, detail=str(exc)) from exc


class ChangeRoleRequest(BaseModel):
    role: AppRole


@router.post("/{user_id}/role", response_model=UserOut)
async def change_role(
    user_id: str,
    body: ChangeRoleRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Promote/demote a user.

    Rules:
      - Must be admin+ to change anyone's role
      - Only the owner can set 'owner' (handing off ownership)
      - Admins can move members ↔ members (no-op) or member → admin / admin → member
      - Admins cannot touch the owner
      - A user can't change their own role
    """
    if user_id == user.id:
        raise HTTPException(status_code=400, detail="You can't change your own role")
    actor_role = await _get_actor_role(user.id)
    _require(actor_role, "admin")

    target_role = await logto_admin.user_app_role(user_id)
    if target_role == "owner" and actor_role != "owner":
        raise HTTPException(
            status_code=403,
            detail="Only the owner can modify the owner role",
        )
    if body.role == "owner" and actor_role != "owner":
        raise HTTPException(
            status_code=403,
            detail="Only the owner can grant the owner role",
        )

    try:
        await logto_admin.replace_user_app_role(user_id, body.role)
        # If owner is handing off ownership (self→admin), they're already
        # blocked above via "can't change own role". If owner is moving
        # someone else to owner, we demote the existing owner(s) to admin.
        if body.role == "owner":
            all_users = await logto_admin.list_users(limit=100)
            for u in all_users:
                if u.id == user_id:
                    continue
                if await logto_admin.user_app_role(u.id) == "owner":
                    await logto_admin.replace_user_app_role(u.id, "admin")

        logto_user = await logto_admin.get_user(user_id)
    except logto_admin.LogtoAdminError as exc:
        log.exception("Failed to change role")
        raise HTTPException(status_code=exc.status_code or 502, detail=str(exc)) from exc
    if logto_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return await _serialize(logto_user)



