"""
Test configuration for Mandir 11 backend.

Uses an in-memory SQLite database for fast, isolated test runs.
Each test gets a fresh database via the `db` fixture.
"""

from __future__ import annotations

import os

# Override DATABASE_URL before any app code imports session.py
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["ADMIN_INVITE_CODE"] = "test-invite"

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.db.base import Base
from backend.db.session import get_db
import backend.models  # noqa: F401 — populate metadata

# ─── Test database engine ─────────────────────────────────────────────────────

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
)

TestSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="function")
async def db() -> AsyncSession:
    """Fresh in-memory DB per test."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with TestSessionLocal() as session:
        yield session

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture(scope="function")
async def client(db: AsyncSession) -> AsyncClient:
    """AsyncClient wired to the test database."""
    from backend.main import app

    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture(scope="function")
async def admin_token(client: AsyncClient) -> str:
    """Register + login an admin, return Bearer token."""
    await client.post(
        "/auth/register",
        json={"username": "testadmin", "password": "password123", "invite_code": "test-invite"},
    )
    resp = await client.post(
        "/auth/login",
        json={"username": "testadmin", "password": "password123"},
    )
    assert resp.status_code == 200
    return resp.json()["access_token"]


@pytest_asyncio.fixture(scope="function")
async def auth_headers(admin_token: str) -> dict:
    return {"Authorization": f"Bearer {admin_token}"}
