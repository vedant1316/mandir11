"""
Players router.

GET  /players       List all players (public)
POST /players       Create a player (admin only)
PATCH /players/{id} Toggle is_active (admin only)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_admin
from backend.db.session import get_db
from backend.models.admin import AdminUser
from backend.models.player import Player
from backend.schemas.player import PlayerCreate, PlayerListResponse, PlayerRead, PlayerUpdate

router = APIRouter(prefix="/players", tags=["Players"])


@router.get(
    "",
    response_model=PlayerListResponse,
    summary="List all players",
    description="Returns all players (active and inactive). Public endpoint — no auth required.",
)
async def list_players(
    active_only: bool = False,
    db: AsyncSession = Depends(get_db),
) -> PlayerListResponse:
    query = select(Player).order_by(Player.name)
    if active_only:
        query = query.where(Player.is_active == True)  # noqa: E712
    result = await db.execute(query)
    players = list(result.scalars().all())
    return PlayerListResponse(
        players=[PlayerRead.model_validate(p) for p in players],
        total=len(players),
    )


@router.post(
    "",
    response_model=PlayerRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a player",
    description="Adds a player to the permanent pool. Requires admin authentication.",
)
async def create_player(
    body: PlayerCreate,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(get_current_admin),
) -> PlayerRead:
    player = Player(name=body.name, is_active=True)
    db.add(player)
    await db.commit()
    await db.refresh(player)
    return PlayerRead.model_validate(player)


@router.patch(
    "/{player_id}",
    response_model=PlayerRead,
    summary="Toggle player availability",
    description="Activate or deactivate a player. Inactive players cannot be selected for new matches. Requires admin auth.",
)
async def update_player(
    player_id: str,
    body: PlayerUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(get_current_admin),
) -> PlayerRead:
    result = await db.execute(select(Player).where(Player.id == player_id))
    player = result.scalar_one_or_none()
    if player is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found.")

    player.is_active = body.is_active
    await db.commit()
    await db.refresh(player)
    return PlayerRead.model_validate(player)


@router.get(
    "/{player_id}",
    response_model=PlayerRead,
    summary="Get a single player",
    description="Returns a single player by ID. Public endpoint.",
)
async def get_player(player_id: str, db: AsyncSession = Depends(get_db)) -> PlayerRead:
    result = await db.execute(select(Player).where(Player.id == player_id))
    player = result.scalar_one_or_none()
    if player is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found.")
    return PlayerRead.model_validate(player)
