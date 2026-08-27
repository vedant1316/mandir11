"""
Pydantic schemas for authentication endpoints.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class AdminRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8, description="Minimum 8 characters")
    invite_code: str = Field(..., description="ADMIN_INVITE_CODE from environment")


class AdminLogin(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_hours: int
