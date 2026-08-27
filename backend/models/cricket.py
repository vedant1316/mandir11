"""
Cricket ORM models — Phase 2 structural placeholders.

These tables are defined so the schema can be created in full, but no
Phase 2 scoring logic is implemented here. The cricket_scorer.py engine
(Phase 2) will populate these.

See MANDIR11-REFERENCE.md section 13 — Build Phases.
"""

from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import (
    Boolean,
    Enum,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base

EXTRA_TYPES = ("none", "wide", "no_ball")
DISMISSAL_TYPES = ("bowled", "caught", "run_out", "lbw", "stumped", "other")


class Innings(Base):
    """One innings for one team in one match. innings_number supports Test matches (1 or 2)."""

    __tablename__ = "innings"
    __table_args__ = (
        UniqueConstraint("match_id", "innings_number", name="uq_innings_match_number"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    match_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("matches.id", ondelete="CASCADE"), nullable=False
    )
    batting_team_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False
    )
    innings_number: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    overs_limit: Mapped[Optional[int]] = mapped_column(SmallInteger, nullable=True)
    total_runs: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_wickets: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    is_closed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    overs: Mapped[list["Over"]] = relationship(
        "Over", back_populates="innings", cascade="all, delete-orphan"
    )


class Over(Base):
    """One over within an innings. Each over records its bowler."""

    __tablename__ = "overs"
    __table_args__ = (
        UniqueConstraint("innings_id", "over_number", name="uq_over_innings_number"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    innings_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("innings.id", ondelete="CASCADE"), nullable=False
    )
    over_number: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    bowler_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("players.id", ondelete="RESTRICT"), nullable=False
    )

    innings: Mapped["Innings"] = relationship("Innings", back_populates="overs")
    balls: Mapped[list["Ball"]] = relationship(
        "Ball", back_populates="over", cascade="all, delete-orphan"
    )


class Ball(Base):
    """
    One delivery. Wide balls don't count as legal deliveries —
    over completion logic in cricket_scorer.py counts legal balls only.
    """

    __tablename__ = "balls"
    __table_args__ = (
        UniqueConstraint("over_id", "ball_number", name="uq_ball_over_number"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    over_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("overs.id", ondelete="CASCADE"), nullable=False
    )
    ball_number: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    runs: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    extra_type: Mapped[str] = mapped_column(
        Enum(*EXTRA_TYPES, name="extra_type"), nullable=False, default="none"
    )
    is_wicket: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    dismissal_type: Mapped[Optional[str]] = mapped_column(
        Enum(*DISMISSAL_TYPES, name="dismissal_type"), nullable=True
    )
    batter_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("players.id", ondelete="RESTRICT"), nullable=False
    )
    dismissed_player_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("players.id", ondelete="RESTRICT"), nullable=True
    )
    next_batter_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("players.id", ondelete="RESTRICT"), nullable=True
    )

    over: Mapped["Over"] = relationship("Over", back_populates="balls")
