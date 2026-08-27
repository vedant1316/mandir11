"""
Match, Team, TeamPlayer, and MatchResult ORM models.

Key invariants enforced here and in match_engine.py:
- A Match has exactly two Teams (Team A and Team B), both scoped to that match.
- Teams are never standalone reusable entities.
- A player cannot appear in both teams of the same match.
- MatchResult's winning_team_id must be one of the match's teams.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base

# ─── Enum values (kept as plain strings for SQLite compatibility) ──────────────
SPORT_TYPES = ("cricket", "volleyball", "badminton")
MATCH_STATUSES = ("upcoming", "live", "completed", "abandoned")
END_REASONS = ("completed", "time", "players_unavailable", "rain", "other")
TEAM_LABELS = ("Team A", "Team B")


class Match(Base):
    __tablename__ = "matches"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    sport: Mapped[str] = mapped_column(
        Enum(*SPORT_TYPES, name="sport_type"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        Enum(*MATCH_STATUSES, name="match_status"),
        nullable=False,
        default="upcoming",
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    tournament_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("tournaments.id", ondelete="SET NULL"), nullable=True
    )
    fixture_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    end_reason: Mapped[Optional[str]] = mapped_column(
        Enum(*END_REASONS, name="end_reason_type"), nullable=True
    )
    player_of_match_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("players.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    # Relationships
    teams: Mapped[list["Team"]] = relationship(
        "Team", back_populates="match", cascade="all, delete-orphan"
    )
    result: Mapped[Optional["MatchResult"]] = relationship(
        "MatchResult", back_populates="match", uselist=False, cascade="all, delete-orphan"
    )
    player_of_match: Mapped[Optional["Player"]] = relationship(  # type: ignore[name-defined]
        "Player", foreign_keys=[player_of_match_id]
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Match id={self.id!r} sport={self.sport!r} status={self.status!r}>"


class Team(Base):
    __tablename__ = "teams"
    __table_args__ = (
        UniqueConstraint("match_id", "label", name="uq_team_match_label"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    match_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("matches.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str] = mapped_column(
        Enum(*TEAM_LABELS, name="team_label_type"), nullable=False
    )

    # Relationships
    match: Mapped["Match"] = relationship("Match", back_populates="teams")
    players: Mapped[list["TeamPlayer"]] = relationship(
        "TeamPlayer", back_populates="team", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Team id={self.id!r} label={self.label!r} match={self.match_id!r}>"


class TeamPlayer(Base):
    __tablename__ = "team_players"

    team_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True
    )
    player_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("players.id", ondelete="RESTRICT"), primary_key=True
    )

    # Relationships
    team: Mapped["Team"] = relationship("Team", back_populates="players")
    player: Mapped["Player"] = relationship("Player", back_populates="team_memberships")  # type: ignore[name-defined]

    def __repr__(self) -> str:  # pragma: no cover
        return f"<TeamPlayer team={self.team_id!r} player={self.player_id!r}>"


class MatchResult(Base):
    __tablename__ = "match_results"

    match_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("matches.id", ondelete="CASCADE"), primary_key=True
    )
    team_a_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    team_b_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    winning_team_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("teams.id", ondelete="RESTRICT"), nullable=False
    )

    # Relationships
    match: Mapped["Match"] = relationship("Match", back_populates="result")
    winning_team: Mapped["Team"] = relationship("Team", foreign_keys=[winning_team_id])

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<MatchResult match={self.match_id!r} winner={self.winning_team_id!r}>"
        )
