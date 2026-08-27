"""
Match Engine — the ONLY component allowed to write match state.

All match lifecycle operations go through this module. Route handlers call
engine functions; they do not write match state directly.

Phase 1 responsibilities:
  - create_match
  - create_teams (with full validation)
  - start_match  (upcoming → live)
  - enter_result (volleyball / badminton final scores)
  - end_match    (live → completed | abandoned)
  - set_player_of_match

State machine:
  upcoming → live → completed
  upcoming → abandoned
  live     → abandoned

Invalid transitions raise MatchStateError.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.models.match import Match, MatchResult, Team, TeamPlayer
from backend.models.player import Player
from backend.schemas.match import (
    CreateTeamsRequest,
    EnterResultRequest,
    MatchCreate,
    MatchEndRequest,
    PlayerOfMatchRequest,
)


# ─── Domain errors ────────────────────────────────────────────────────────────

class MatchEngineError(Exception):
    """Base class for all Match Engine errors. Route handlers convert these to HTTP errors."""
    status_code: int = 400

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class MatchNotFoundError(MatchEngineError):
    status_code = 404


class PlayerNotFoundError(MatchEngineError):
    status_code = 404


class MatchStateError(MatchEngineError):
    status_code = 409


class TeamValidationError(MatchEngineError):
    status_code = 422


class ResultValidationError(MatchEngineError):
    status_code = 422


# ─── Valid state transitions ──────────────────────────────────────────────────

_VALID_TRANSITIONS: dict[str, list[str]] = {
    "upcoming": ["live", "abandoned"],
    "live": ["completed", "abandoned"],
    "completed": [],   # terminal — no transitions allowed
    "abandoned": [],   # terminal — no transitions allowed
}


def _assert_transition(current: str, target: str) -> None:
    allowed = _VALID_TRANSITIONS.get(current, [])
    if target not in allowed:
        raise MatchStateError(
            f"Cannot transition match from '{current}' to '{target}'. "
            f"Allowed: {allowed or 'none (terminal state)'}."
        )


# ─── Helper queries ───────────────────────────────────────────────────────────

async def _get_match_or_raise(db: AsyncSession, match_id: str) -> Match:
    result = await db.execute(
        select(Match)
        .where(Match.id == match_id)
        .options(
            selectinload(Match.teams).selectinload(Team.players).selectinload(TeamPlayer.player),
            selectinload(Match.result),
        )
    )
    match = result.scalar_one_or_none()
    if match is None:
        raise MatchNotFoundError(f"Match '{match_id}' not found.")
    return match


async def _get_active_player_or_raise(db: AsyncSession, player_id: str) -> Player:
    result = await db.execute(select(Player).where(Player.id == player_id))
    player = result.scalar_one_or_none()
    if player is None:
        raise PlayerNotFoundError(f"Player '{player_id}' not found.")
    if not player.is_active:
        raise TeamValidationError(
            f"Player '{player.name}' is inactive and cannot be selected for a match."
        )
    return player


# ─── Engine functions ─────────────────────────────────────────────────────────

async def create_match(db: AsyncSession, data: MatchCreate) -> Match:
    """Create a new match in 'upcoming' state."""
    from datetime import date as date_cls
    match = Match(
        sport=data.sport,
        status="upcoming",
        date=data.match_date or date_cls.today(),
        tournament_id=data.tournament_id,
    )
    db.add(match)
    await db.commit()
    await db.refresh(match)
    return match


async def get_match(db: AsyncSession, match_id: str) -> Match:
    """Return a match with teams and result eagerly loaded."""
    return await _get_match_or_raise(db, match_id)


async def list_matches(
    db: AsyncSession,
    status: Optional[str] = None,
    sport: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[Match], int]:
    """Return paginated matches with optional status/sport filters."""
    query = (
        select(Match)
        .options(
            selectinload(Match.teams).selectinload(Team.players).selectinload(TeamPlayer.player),
            selectinload(Match.result),
        )
        .order_by(Match.created_at.desc())
    )
    if status:
        query = query.where(Match.status == status)
    if sport:
        query = query.where(Match.sport == sport)

    count_query = select(Match)
    if status:
        count_query = count_query.where(Match.status == status)
    if sport:
        count_query = count_query.where(Match.sport == sport)

    total_result = await db.execute(count_query)
    total = len(total_result.scalars().all())

    result = await db.execute(query.offset(skip).limit(limit))
    matches = list(result.scalars().all())
    return matches, total


async def create_teams(db: AsyncSession, match_id: str, data: CreateTeamsRequest) -> Match:
    """
    Create Team A and Team B for a match.

    Validation rules enforced:
    1. Match must be in 'upcoming' state.
    2. Teams must not already exist for this match.
    3. All player IDs must belong to active players.
    4. No player can appear twice in the same team.
    5. No player can appear in both teams.
    """
    match = await _get_match_or_raise(db, match_id)

    if match.status != "upcoming":
        raise MatchStateError(
            f"Teams can only be created for upcoming matches (current status: '{match.status}')."
        )

    if match.teams:
        raise MatchStateError("Teams already exist for this match. Cannot re-create teams.")

    # Collect and validate all player IDs across both teams
    all_player_ids: list[str] = []
    for team_input in data.teams:
        all_player_ids.extend(team_input.player_ids)

    # Check for duplicate within teams
    for team_input in data.teams:
        if len(team_input.player_ids) != len(set(team_input.player_ids)):
            raise TeamValidationError(
                f"Duplicate player IDs found within {team_input.label}."
            )

    # Check for cross-team duplicates
    if len(all_player_ids) != len(set(all_player_ids)):
        raise TeamValidationError(
            "A player cannot be assigned to both teams in the same match."
        )

    # Validate all players exist and are active
    validated_players: dict[str, Player] = {}
    for pid in set(all_player_ids):
        player = await _get_active_player_or_raise(db, pid)
        validated_players[pid] = player

    # Create teams and team_players
    for team_input in data.teams:
        team = Team(match_id=match_id, label=team_input.label)
        db.add(team)
        await db.flush()  # get team.id

        for pid in team_input.player_ids:
            tp = TeamPlayer(team_id=team.id, player_id=pid)
            db.add(tp)

    await db.commit()
    db.expire_all()  # force fresh reads so the re-query sees the new teams
    return await _get_match_or_raise(db, match_id)


async def start_match(db: AsyncSession, match_id: str) -> Match:
    """
    Transition match from 'upcoming' → 'live'.

    Requirements:
    - Match must be upcoming.
    - Both Team A and Team B must exist with at least one player each.
    """
    match = await _get_match_or_raise(db, match_id)
    _assert_transition(match.status, "live")

    team_labels = {t.label for t in match.teams}
    if "Team A" not in team_labels or "Team B" not in team_labels:
        raise TeamValidationError(
            "Cannot start match: both 'Team A' and 'Team B' must exist."
        )

    for team in match.teams:
        if not team.players:
            raise TeamValidationError(
                f"Cannot start match: '{team.label}' has no players."
            )

    match.status = "live"
    await db.commit()
    await db.refresh(match)
    return await _get_match_or_raise(db, match_id)


async def enter_result(
    db: AsyncSession, match_id: str, data: EnterResultRequest
) -> Match:
    """
    Record the final result for a volleyball or badminton match.

    - Match must be 'live'.
    - winning_team_id must be one of the match's teams.
    - Cricket result entry is handled by Phase 2 cricket_scorer.
    """
    match = await _get_match_or_raise(db, match_id)

    if match.status != "live":
        raise MatchStateError(
            f"Result can only be entered for live matches (current status: '{match.status}')."
        )

    if match.sport == "cricket":
        raise MatchEngineError(
            "Cricket result entry is handled by the ball-by-ball scorer (Phase 2). "
            "Use the cricket scoring endpoints."
        )

    # Validate winning team belongs to this match
    team_ids = {t.id for t in match.teams}
    if data.winning_team_id not in team_ids:
        raise ResultValidationError(
            f"winning_team_id '{data.winning_team_id}' is not a team in match '{match_id}'."
        )

    # Validate scores are non-negative if provided
    if data.team_a_score is not None and data.team_a_score < 0:
        raise ResultValidationError("team_a_score cannot be negative.")
    if data.team_b_score is not None and data.team_b_score < 0:
        raise ResultValidationError("team_b_score cannot be negative.")

    # Upsert result (allow re-entry before match is ended)
    if match.result:
        match.result.team_a_score = data.team_a_score
        match.result.team_b_score = data.team_b_score
        match.result.winning_team_id = data.winning_team_id
    else:
        result = MatchResult(
            match_id=match_id,
            team_a_score=data.team_a_score,
            team_b_score=data.team_b_score,
            winning_team_id=data.winning_team_id,
        )
        db.add(result)

    await db.commit()
    db.expire_all()
    return await _get_match_or_raise(db, match_id)


async def end_match(db: AsyncSession, match_id: str, data: MatchEndRequest) -> Match:
    """
    End a match, transitioning it to 'completed' or 'abandoned'.

    Rules:
    - 'completed' requires a result to be already entered (volleyball/badminton).
    - 'abandoned' does not require a result.
    - Cricket completed via cricket scorer (Phase 2).
    """
    match = await _get_match_or_raise(db, match_id)

    if data.reason == "completed":
        target_status = "completed"
    else:
        target_status = "abandoned"

    _assert_transition(match.status, target_status)

    # For non-cricket completed matches, a result must exist
    if target_status == "completed" and match.sport != "cricket":
        if match.result is None:
            raise ResultValidationError(
                "Cannot complete match without a result. Enter the result first."
            )

    match.status = target_status
    match.end_reason = data.reason
    await db.commit()
    return await _get_match_or_raise(db, match_id)


async def set_player_of_match(
    db: AsyncSession, match_id: str, data: PlayerOfMatchRequest
) -> Match:
    """
    Set the Player of the Match.

    - Match must be completed.
    - The selected player must have participated in the match.
    """
    match = await _get_match_or_raise(db, match_id)

    if match.status != "completed":
        raise MatchStateError(
            "Player of the Match can only be set for completed matches."
        )

    # Collect all player IDs in this match
    match_player_ids: set[str] = set()
    for team in match.teams:
        for tp in team.players:
            match_player_ids.add(tp.player_id)

    if data.player_id not in match_player_ids:
        raise TeamValidationError(
            f"Player '{data.player_id}' did not participate in match '{match_id}'."
        )

    match.player_of_match_id = data.player_id
    await db.commit()
    return await _get_match_or_raise(db, match_id)
