"""
Pydantic schemas for Match, Team, MatchResult, and related endpoints.
"""

from __future__ import annotations

from datetime import date as date_type, datetime
from typing import Optional

from pydantic import BaseModel, Field, model_validator

from backend.schemas.player import PlayerRead

# ─── Allowed values (mirror ORM enums) ────────────────────────────────────────
SPORT_TYPES = ("cricket", "volleyball", "badminton")
MATCH_STATUSES = ("upcoming", "live", "completed", "abandoned")
END_REASONS = ("completed", "time", "players_unavailable", "rain", "other")
TEAM_LABELS = ("Team A", "Team B")


# ─── Team schemas ─────────────────────────────────────────────────────────────

class TeamPlayerRead(BaseModel):
    player_id: str
    player: Optional[PlayerRead] = None

    model_config = {"from_attributes": True}


class TeamRead(BaseModel):
    id: str
    match_id: str
    label: str
    players: list[TeamPlayerRead] = []

    model_config = {"from_attributes": True}


class TeamInput(BaseModel):
    """One team spec inside a CreateTeamsRequest."""
    label: str = Field(..., description="'Team A' or 'Team B'")
    player_ids: list[str] = Field(..., min_length=1, description="At least one player per team")

    @model_validator(mode="after")
    def validate_label(self) -> TeamInput:
        if self.label not in TEAM_LABELS:
            raise ValueError(f"label must be one of {TEAM_LABELS}")
        return self


class CreateTeamsRequest(BaseModel):
    teams: list[TeamInput] = Field(..., min_length=2, max_length=2, description="Exactly two teams: Team A and Team B")

    @model_validator(mode="after")
    def validate_two_distinct_labels(self) -> CreateTeamsRequest:
        labels = [t.label for t in self.teams]
        if sorted(labels) != ["Team A", "Team B"]:
            raise ValueError("Must provide exactly one 'Team A' and one 'Team B'")
        return self


# ─── Match schemas ────────────────────────────────────────────────────────────

class MatchCreate(BaseModel):
    sport: str = Field(..., description="cricket | volleyball | badminton")
    match_date: Optional[date_type] = Field(default=None, description="Match date (defaults to today)")
    tournament_id: Optional[str] = Field(default=None, description="Omit for Quick Match")

    @model_validator(mode="after")
    def validate_sport(self) -> MatchCreate:
        if self.sport not in SPORT_TYPES:
            raise ValueError(f"sport must be one of {SPORT_TYPES}")
        return self


class MatchResultRead(BaseModel):
    match_id: str
    team_a_score: Optional[int] = None
    team_b_score: Optional[int] = None
    winning_team_id: str

    model_config = {"from_attributes": True}


class MatchRead(BaseModel):
    id: str
    sport: str
    status: str
    date: date_type
    tournament_id: Optional[str] = None
    fixture_id: Optional[str] = None
    end_reason: Optional[str] = None
    player_of_match_id: Optional[str] = None
    created_at: datetime
    teams: list[TeamRead] = []
    result: Optional[MatchResultRead] = None

    model_config = {"from_attributes": True}


class MatchListResponse(BaseModel):
    matches: list[MatchRead]
    total: int


# ─── Result entry ─────────────────────────────────────────────────────────────

class EnterResultRequest(BaseModel):
    """Volleyball / Badminton final result entry."""
    team_a_score: Optional[int] = Field(default=None, description="Final score for Team A (nullable for badminton)")
    team_b_score: Optional[int] = Field(default=None, description="Final score for Team B (nullable for badminton)")
    winning_team_id: str = Field(..., description="ID of the winning team (must be Team A or Team B of this match)")


# ─── Match lifecycle ──────────────────────────────────────────────────────────

class MatchEndRequest(BaseModel):
    reason: str = Field(..., description="completed | time | players_unavailable | rain | other")

    @model_validator(mode="after")
    def validate_reason(self) -> MatchEndRequest:
        if self.reason not in END_REASONS:
            raise ValueError(f"reason must be one of {END_REASONS}")
        return self


class PlayerOfMatchRequest(BaseModel):
    player_id: str = Field(..., description="Must be a player who participated in this match")
