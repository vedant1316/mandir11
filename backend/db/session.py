"""
Async SQLAlchemy engine and session factory.

PostgreSQL is the application database for Mandir 11 (via asyncpg).
DATABASE_URL env var controls the connection:
  - Application (PostgreSQL): postgresql+asyncpg://user:password@localhost:5432/mandir11
"""

from __future__ import annotations

import os

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://user:password@localhost:5432/mandir11",
)

# Connect args for engine (e.g. check_same_thread for SQLite in test overrides)
connect_args: dict = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    connect_args=connect_args,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncSession:  # type: ignore[override]
    """FastAPI dependency that yields a database session."""
    async with AsyncSessionLocal() as session:
        yield session
