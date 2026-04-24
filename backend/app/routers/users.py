"""Team management endpoints.

Anyone signed in can manage the team (flat model). The backend uses the
configured Logto M2M credentials to talk to Logto's Management API.
"""
from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from app.deps import CurrentUser, get_current_user
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
    temporary_password: str
    # UI should prompt the admin to securely share this one-time password with
    # the new team member. They'll be forced to change it on first sign-in if
    # that policy is enabled in Logto.


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
        users = await logto_admin.list_users(limit=200)
    except logto_admin.LogtoAdminNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except logto_admin.LogtoAdminError as exc:
        log.exception("Failed to list Logto users")
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return UserListResponse(users=[_serialize(u) for u in users])


@router.post("/invite", response_model=InviteUserResponse, status_code=201)
async def invite_user(
    body: InviteUserRequest,
    _user: Annotated[CurrentUser, Depends(get_current_user)],
):
    try:
        user, password = await logto_admin.create_user(email=body.email, name=body.name)
    except logto_admin.LogtoAdminNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except logto_admin.LogtoAdminError as exc:
        # Conflict (user exists) from Logto is usually 422 with a specific code
        status = exc.status_code or 502
        if status == 422 and isinstance(exc.body, dict) and "email_already_in_use" in str(exc.body):
            raise HTTPException(
                status_code=409,
                detail="A user with that email already exists",
            ) from exc
        log.exception("Failed to create Logto user")
        raise HTTPException(status_code=status, detail=str(exc)) from exc
    return InviteUserResponse(user=_serialize(user), temporary_password=password)


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
