"""
Auth router — admin registration and login.

POST /auth/register  Create the first admin account (requires ADMIN_INVITE_CODE).
POST /auth/login     Exchange credentials for a JWT.
"""

from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import JWT_EXPIRY_HOURS, create_access_token, hash_password, verify_password
from backend.db.session import get_db
from backend.models.admin import AdminUser
from backend.schemas.auth import AdminLogin, AdminRegister, TokenResponse

router = APIRouter(prefix="/auth", tags=["Auth"])

ADMIN_INVITE_CODE: str = os.getenv("ADMIN_INVITE_CODE", "")


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register the first admin account",
    description=(
        "Creates an admin account using the ADMIN_INVITE_CODE environment variable. "
        "Returns a JWT on success."
    ),
)
async def register(body: AdminRegister, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    if not ADMIN_INVITE_CODE:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin registration is not configured (ADMIN_INVITE_CODE not set).",
        )
    if body.invite_code != ADMIN_INVITE_CODE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid invite code.",
        )

    existing = await db.execute(select(AdminUser).where(AdminUser.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Username '{body.username}' is already taken.",
        )

    admin = AdminUser(username=body.username, password_hash=hash_password(body.password))
    db.add(admin)
    await db.commit()

    token = create_access_token(body.username)
    return TokenResponse(access_token=token, expires_in_hours=JWT_EXPIRY_HOURS)


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Admin login",
    description="Exchange username + password for a Bearer JWT.",
)
async def login(body: AdminLogin, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    result = await db.execute(select(AdminUser).where(AdminUser.username == body.username))
    admin = result.scalar_one_or_none()

    if admin is None or not verify_password(body.password, admin.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    token = create_access_token(body.username)
    return TokenResponse(access_token=token, expires_in_hours=JWT_EXPIRY_HOURS)
