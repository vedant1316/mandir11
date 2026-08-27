"""
Cricket router — Phase 2 placeholder.

Ball-by-ball WebSocket scoring and REST endpoints for cricket matches
will be implemented in Phase 2.

See MANDIR11-REFERENCE.md section 13 — Build Phases.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/cricket", tags=["Cricket (Phase 2)"])


@router.get(
    "",
    summary="Cricket scoring — Phase 2",
    description="Ball-by-ball cricket scoring via WebSocket is implemented in Phase 2.",
    status_code=501,
)
async def cricket_placeholder() -> dict:
    return {
        "detail": "Cricket ball-by-ball scoring is coming in Phase 2.",
        "phase": 2,
    }
