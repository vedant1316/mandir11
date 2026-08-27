"""
Pydantic schemas for Player endpoints.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class PlayerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Player display name")

    @field_validator("name")
    @classmethod
    def name_strip(cls, v: str) -> str:
        return v.strip()


class PlayerRead(BaseModel):
    id: str
    name: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class PlayerUpdate(BaseModel):
    is_active: bool = Field(..., description="Set True to activate, False to deactivate")


class PlayerListResponse(BaseModel):
    players: list[PlayerRead]
    total: int
