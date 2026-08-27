"""Stats router — Phase 4 placeholder."""

from fastapi import APIRouter

router = APIRouter(prefix="/stats", tags=["Stats & Rankings (Phase 4)"])


@router.get("", summary="Stats — Phase 4", status_code=501)
async def stats_placeholder() -> dict:
    return {"detail": "Statistics and rankings engine is coming in Phase 4.", "phase": 4}
