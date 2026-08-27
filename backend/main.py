"""
Mandir 11 — FastAPI application entrypoint.

Run with:
  uvicorn main:app --reload

Swagger docs at:
  http://localhost:8000/docs
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()  # loads .env if present (ignored in production where env vars are set directly)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.db.base import Base
from backend.db.session import engine

# Import all models to ensure metadata is populated before create_all
import backend.models  # noqa: F401

from backend.routers import auth, cricket, ledger, matches, players, stats, tournaments

# ─── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create all tables on startup (dev-only; use migrations in production)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Mandir 11 API",
    description=(
        "Private colony sports platform. "
        "Phase 1: Player CRUD + Match lifecycle for Volleyball and Badminton. "
        "Cricket scoring (Phase 2), Ledger (Phase 3), Stats (Phase 4), Tournaments (Phase 5) coming soon."
    ),
    version="1.0.0-phase1",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
# In production, replace ["*"] with your actual frontend origin(s).
_cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────

app.include_router(auth.router)
app.include_router(players.router)
app.include_router(matches.router)
app.include_router(cricket.router)
app.include_router(tournaments.router)
app.include_router(ledger.router)
app.include_router(stats.router)


# ─── Health check ─────────────────────────────────────────────────────────────

@app.get("/health", tags=["System"], summary="Health check")
async def health() -> dict:
    return {"status": "ok", "phase": 1}
