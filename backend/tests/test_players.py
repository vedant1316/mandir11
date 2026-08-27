"""
Tests 1–3: Player CRUD and availability.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_player(client: AsyncClient, auth_headers: dict) -> None:
    """Test 1: Create a player."""
    resp = await client.post("/players", json={"name": "Arjun"}, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Arjun"
    assert data["is_active"] is True
    assert "id" in data


@pytest.mark.asyncio
async def test_create_player_requires_auth(client: AsyncClient) -> None:
    """Test 1b: Creating a player without auth is rejected."""
    resp = await client.post("/players", json={"name": "NoAuth"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_create_player_empty_name(client: AsyncClient, auth_headers: dict) -> None:
    """Test 1c: Empty name is rejected."""
    resp = await client.post("/players", json={"name": ""}, headers=auth_headers)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_list_players(client: AsyncClient, auth_headers: dict) -> None:
    """Test 2: List players."""
    await client.post("/players", json={"name": "Player A"}, headers=auth_headers)
    await client.post("/players", json={"name": "Player B"}, headers=auth_headers)

    resp = await client.get("/players")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    names = [p["name"] for p in data["players"]]
    assert "Player A" in names
    assert "Player B" in names


@pytest.mark.asyncio
async def test_list_players_active_only(client: AsyncClient, auth_headers: dict) -> None:
    """Test 2b: active_only filter."""
    r1 = await client.post("/players", json={"name": "Active"}, headers=auth_headers)
    r2 = await client.post("/players", json={"name": "Inactive"}, headers=auth_headers)
    p2_id = r2.json()["id"]

    await client.patch(f"/players/{p2_id}", json={"is_active": False}, headers=auth_headers)

    resp = await client.get("/players?active_only=true")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["players"][0]["name"] == "Active"


@pytest.mark.asyncio
async def test_activate_deactivate_player(client: AsyncClient, auth_headers: dict) -> None:
    """Test 3: Toggle player availability."""
    r = await client.post("/players", json={"name": "Toggle Player"}, headers=auth_headers)
    pid = r.json()["id"]

    # Deactivate
    resp = await client.patch(f"/players/{pid}", json={"is_active": False}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False

    # Reactivate
    resp = await client.patch(f"/players/{pid}", json={"is_active": True}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["is_active"] is True


@pytest.mark.asyncio
async def test_get_player_not_found(client: AsyncClient) -> None:
    """Test: 404 for unknown player."""
    resp = await client.get("/players/nonexistent-id")
    assert resp.status_code == 404
