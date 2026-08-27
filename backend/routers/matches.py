"""
Matches router.

POST /matches                        Create match (admin)
GET  /matches                        List matches (public)
GET  /matches/{id}                   Match detail (public)
POST /matches/{id}/teams             Create teams (admin)
POST /matches/{id}/start             Start match (admin)
POST /matches/{id}/result            Enter volleyball/badminton result (admin)
POST /matches/{id}/end               End match (admin)
POST /matches/{id}/player_of_match   Set Player of Match (admin)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_admin
from backend.db.session import get_db
from backend.engines import match_engine
from backend.engines.match_engine import (
    MatchEngineError,
    MatchNotFoundError,
    MatchStateError,
    PlayerNotFoundError,
    ResultValidationError,
    TeamValidationError,
)
from backend.models.admin import AdminUser
from backend.schemas.match import (
    CreateTeamsRequest,
    EnterResultRequest,
    MatchCreate,
    MatchEndRequest,
    MatchListResponse,
    MatchRead,
    PlayerOfMatchRequest,
)

router = APIRouter(prefix="/matches", tags=["Matches"])


def _handle_engine_error(exc: MatchEngineError) -> None:
    """Convert Match Engine domain errors to HTTP responses."""
    raise HTTPException(status_code=exc.status_code, detail=exc.detail)


@router.post(
    "",
    response_model=MatchRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a match",
    description="Creates a new match in 'upcoming' state. Requires admin auth.",
)
async def create_match(
    body: MatchCreate,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(get_current_admin),
) -> MatchRead:
    match = await match_engine.create_match(db, body)
    # Re-fetch with eager loads so Pydantic can serialize relationships
    match = await match_engine.get_match(db, match.id)
    return MatchRead.model_validate(match)


@router.get(
    "",
    response_model=MatchListResponse,
    summary="List matches",
    description="List all matches with optional filters. Public endpoint.",
)
async def list_matches(
    sport: str | None = Query(None, description="Filter by sport: cricket | volleyball | badminton"),
    match_status: str | None = Query(None, alias="status", description="Filter by status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> MatchListResponse:
    matches, total = await match_engine.list_matches(db, status=match_status, sport=sport, skip=skip, limit=limit)
    return MatchListResponse(
        matches=[MatchRead.model_validate(m) for m in matches],
        total=total,
    )


@router.get(
    "/{match_id}",
    response_model=MatchRead,
    summary="Get match detail",
    description="Returns full match detail including teams, players, and result. Public endpoint.",
)
async def get_match(match_id: str, db: AsyncSession = Depends(get_db)) -> MatchRead:
    try:
        match = await match_engine.get_match(db, match_id)
    except MatchNotFoundError as e:
        _handle_engine_error(e)
    return MatchRead.model_validate(match)


@router.post(
    "/{match_id}/teams",
    response_model=MatchRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create teams for a match",
    description=(
        "Creates Team A and Team B for an upcoming match. "
        "Validates: active players only, no duplicates, no cross-team duplicates. "
        "Teams are match-scoped — they are never reusable entities. "
        "Requires admin auth."
    ),
)
async def create_teams(
    match_id: str,
    body: CreateTeamsRequest,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(get_current_admin),
) -> MatchRead:
    try:
        match = await match_engine.create_teams(db, match_id, body)
    except MatchEngineError as e:
        _handle_engine_error(e)
    return MatchRead.model_validate(match)


@router.post(
    "/{match_id}/start",
    response_model=MatchRead,
    summary="Start a match",
    description="Transitions match from 'upcoming' to 'live'. Both teams must exist. Requires admin auth.",
)
async def start_match(
    match_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(get_current_admin),
) -> MatchRead:
    try:
        match = await match_engine.start_match(db, match_id)
    except MatchEngineError as e:
        _handle_engine_error(e)
    return MatchRead.model_validate(match)


@router.post(
    "/{match_id}/result",
    response_model=MatchRead,
    summary="Enter volleyball / badminton result",
    description=(
        "Records the final score and winner for a live volleyball or badminton match. "
        "winning_team_id must be one of the match's teams. "
        "Can be called multiple times before ending the match (updates in place). "
        "Requires admin auth."
    ),
)
async def enter_result(
    match_id: str,
    body: EnterResultRequest,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(get_current_admin),
) -> MatchRead:
    try:
        match = await match_engine.enter_result(db, match_id, body)
    except MatchEngineError as e:
        _handle_engine_error(e)
    return MatchRead.model_validate(match)


@router.post(
    "/{match_id}/end",
    response_model=MatchRead,
    summary="End a match",
    description=(
        "Ends a live match. "
        "reason='completed' requires a result to exist (volleyball/badminton). "
        "reason='abandoned'|'time'|'rain'|'players_unavailable'|'other' does not require a result. "
        "Requires admin auth."
    ),
)
async def end_match(
    match_id: str,
    body: MatchEndRequest,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(get_current_admin),
) -> MatchRead:
    try:
        match = await match_engine.end_match(db, match_id, body)
    except MatchEngineError as e:
        _handle_engine_error(e)
    return MatchRead.model_validate(match)


@router.post(
    "/{match_id}/player_of_match",
    response_model=MatchRead,
    summary="Set Player of the Match",
    description=(
        "Manually assign Player of the Match. "
        "Match must be completed. Player must have participated. "
        "Requires admin auth."
    ),
)
async def set_player_of_match(
    match_id: str,
    body: PlayerOfMatchRequest,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(get_current_admin),
) -> MatchRead:
    try:
        match = await match_engine.set_player_of_match(db, match_id, body)
    except MatchEngineError as e:
        _handle_engine_error(e)
    return MatchRead.model_validate(match)
