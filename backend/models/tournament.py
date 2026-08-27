"""
Tournament and Fixture ORM models — Phase 5 structural placeholders.

These are defined so the schema is complete, but no tournament logic
is implemented in Phase 1. See MANDIR11-REFERENCE.md section 13.
"""

from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from backend.db.base import Base

TOURNAMENT_FORMATS = ("knockout", "round_robin", "league")
TOURNAMENT_STATUSES = ("upcoming", "in_progress", "completed")


class Tournament(Base):
    __tablename__ = "tournaments"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    sport: Mapped[str] = mapped_column(
        Enum("cricket", "volleyball", "badminton", name="tournament_sport_type"),
        nullable=False,
    )
    format: Mapped[str] = mapped_column(
        Enum(*TOURNAMENT_FORMATS, name="tournament_format"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        Enum(*TOURNAMENT_STATUSES, name="tournament_status"),
        nullable=False,
        default="upcoming",
    )


class Fixture(Base):
    __tablename__ = "fixtures"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    tournament_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False
    )
    round_label: Mapped[str] = mapped_column(String(50), nullable=False)
    match_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("matches.id", ondelete="SET NULL"), nullable=True
    )
    team_a_source: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    team_b_source: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
