"""
Ledger ORM model — Phase 3 structural placeholder.

LedgerEntry records who owes whom within a match. Settlement direction
is computed by the Ledger Engine from the winning team + stakes — it is
never stored redundantly. See MANDIR11-REFERENCE.md section 13.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.db.base import Base


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    match_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("matches.id", ondelete="CASCADE"), nullable=False
    )
    player_a_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("players.id", ondelete="RESTRICT"), nullable=False
    )
    player_b_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("players.id", ondelete="RESTRICT"), nullable=False
    )
    # amount > 0 enforced at application layer (SQLite has limited CHECK support)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
