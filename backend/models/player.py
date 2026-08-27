"""
Player ORM model.

A Player is a permanent member of the colony pool.
- is_active=True  → available for team selection
- is_active=False → deactivated (historical record preserved, cannot be selected)
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class Player(Base):
    __tablename__ = "players"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    # Relationships (back-populated by match.py)
    team_memberships: Mapped[list["TeamPlayer"]] = relationship(  # type: ignore[name-defined]
        "TeamPlayer", back_populates="player"
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Player id={self.id!r} name={self.name!r} active={self.is_active}>"
