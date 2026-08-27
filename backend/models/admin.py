"""
Admin User ORM model.

There is exactly one role: admin.
Anonymous viewers can read public endpoints without a token.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.db.base import Base


class AdminUser(Base):
    __tablename__ = "admin_users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<AdminUser id={self.id!r} username={self.username!r}>"
