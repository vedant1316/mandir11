"""Ledger router — Phase 3 placeholder."""

from fastapi import APIRouter

router = APIRouter(prefix="/ledger", tags=["Ledger (Phase 3)"])


@router.get("", summary="Ledger — Phase 3", status_code=501)
async def ledger_placeholder() -> dict:
    return {"detail": "Ledger engine is coming in Phase 3.", "phase": 3}
