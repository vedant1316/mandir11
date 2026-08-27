"""Tournaments router — Phase 5 placeholder."""

from fastapi import APIRouter

router = APIRouter(prefix="/tournaments", tags=["Tournaments (Phase 5)"])


@router.get("", summary="Tournaments — Phase 5", status_code=501)
async def tournaments_placeholder() -> dict:
    return {"detail": "Tournament engine is coming in Phase 5.", "phase": 5}
