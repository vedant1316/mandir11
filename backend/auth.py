"""
JWT authentication utilities for Mandir 11.

- Single "admin" role issued as a JWT.
- Anonymous callers can access read-only (public) endpoints without a token.
- Admin-only operations use the `require_admin` dependency.

Environment variables:
  JWT_SECRET         : signing secret (required in production)
  JWT_EXPIRY_HOURS   : token lifetime, defaults to 168 (1 week)
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.session import get_db
from backend.models.admin import AdminUser

# ─── Config ───────────────────────────────────────────────────────────────────
JWT_SECRET: str = os.getenv("JWT_SECRET", "dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS: int = int(os.getenv("JWT_EXPIRY_HOURS", "168"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


# ─── Password helpers ─────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ─── Token helpers ────────────────────────────────────────────────────────────

def create_access_token(username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS)
    payload = {"sub": username, "exp": expire, "role": "admin"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Raises JWTError if invalid or expired."""
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])


# ─── FastAPI dependencies ─────────────────────────────────────────────────────

async def get_current_admin(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> AdminUser:
    """
    Dependency for admin-only endpoints.
    Raises 401 if token is missing/invalid, 403 if user no longer exists.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_token(credentials.credentials)
        username: str = payload.get("sub", "")
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    result = await db.execute(select(AdminUser).where(AdminUser.username == username))
    admin = result.scalar_one_or_none()
    if admin is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin account not found",
        )
    return admin
