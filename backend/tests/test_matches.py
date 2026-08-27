"""
Tests 4–17: Match lifecycle, team validation, result entry, state machine.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def make_player(client: AsyncClient, headers: dict, name: str) -> str:
    r = await client.post("/players", json={"name": name}, headers=headers)
    assert r.status_code == 201
    return r.json()["id"]


async def make_match(client: AsyncClient, headers: dict, sport: str = "volleyball") -> str:
    r = await client.post("/matches", json={"sport": sport}, headers=headers)
    assert r.status_code == 201
    return r.json()["id"]


async def make_teams(
    client: AsyncClient,
    headers: dict,
    match_id: str,
    team_a_ids: list[str],
    team_b_ids: list[str],
) -> dict:
    r = await client.post(
        f"/matches/{match_id}/teams",
        json={
            "teams": [
                {"label": "Team A", "player_ids": team_a_ids},
                {"label": "Team B", "player_ids": team_b_ids},
            ]
        },
        headers=headers,
    )
    return r


# ─── Test 4: Create match ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_match(client: AsyncClient, auth_headers: dict) -> None:
    """Test 4: Create a match."""
    resp = await client.post("/matches", json={"sport": "volleyball"}, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["sport"] == "volleyball"
    assert data["status"] == "upcoming"


@pytest.mark.asyncio
async def test_create_match_invalid_sport(client: AsyncClient, auth_headers: dict) -> None:
    resp = await client.post("/matches", json={"sport": "tennis"}, headers=auth_headers)
    assert resp.status_code == 422


# ─── Test 5: Create valid teams ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_valid_teams(client: AsyncClient, auth_headers: dict) -> None:
    """Test 5: Create valid teams including unequal sizes."""
    p1 = await make_player(client, auth_headers, "P1")
    p2 = await make_player(client, auth_headers, "P2")
    p3 = await make_player(client, auth_headers, "P3")
    p4 = await make_player(client, auth_headers, "P4")
    p5 = await make_player(client, auth_headers, "P5")

    mid = await make_match(client, auth_headers)

    # Unequal teams: 3 vs 2
    resp = await make_teams(client, auth_headers, mid, [p1, p2, p3], [p4, p5])
    assert resp.status_code == 201
    match = resp.json()
    assert len(match["teams"]) == 2
    team_a = next(t for t in match["teams"] if t["label"] == "Team A")
    team_b = next(t for t in match["teams"] if t["label"] == "Team B")
    assert len(team_a["players"]) == 3
    assert len(team_b["players"]) == 2


# ─── Test 6: Reject duplicate player within same team ─────────────────────────

@pytest.mark.asyncio
async def test_reject_duplicate_player_same_team(client: AsyncClient, auth_headers: dict) -> None:
    """Test 6: Duplicate player_id in same team is rejected."""
    p1 = await make_player(client, auth_headers, "P1")
    p2 = await make_player(client, auth_headers, "P2")
    mid = await make_match(client, auth_headers)

    resp = await make_teams(client, auth_headers, mid, [p1, p1], [p2])  # duplicate in Team A
    assert resp.status_code == 422


# ─── Test 7: Reject player in both teams ─────────────────────────────────────

@pytest.mark.asyncio
async def test_reject_player_in_both_teams(client: AsyncClient, auth_headers: dict) -> None:
    """Test 7: Player cannot be in both Team A and Team B."""
    p1 = await make_player(client, auth_headers, "P1")
    p2 = await make_player(client, auth_headers, "P2")
    mid = await make_match(client, auth_headers)

    resp = await make_teams(client, auth_headers, mid, [p1, p2], [p1])  # p1 in both
    assert resp.status_code == 422


# ─── Test 8: Reject inactive player ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_reject_inactive_player(client: AsyncClient, auth_headers: dict) -> None:
    """Test 8: Inactive player cannot be added to a team."""
    p1 = await make_player(client, auth_headers, "Active")
    p2 = await make_player(client, auth_headers, "Inactive")

    await client.patch(f"/players/{p2}", json={"is_active": False}, headers=auth_headers)

    mid = await make_match(client, auth_headers)
    resp = await make_teams(client, auth_headers, mid, [p1], [p2])
    assert resp.status_code == 422


# ─── Test 9: Reject invalid team configuration ────────────────────────────────

@pytest.mark.asyncio
async def test_reject_empty_team(client: AsyncClient, auth_headers: dict) -> None:
    """Test 9: Empty player_ids list is rejected."""
    p1 = await make_player(client, auth_headers, "P1")
    mid = await make_match(client, auth_headers)

    resp = await client.post(
        f"/matches/{mid}/teams",
        json={
            "teams": [
                {"label": "Team A", "player_ids": [p1]},
                {"label": "Team B", "player_ids": []},
            ]
        },
        headers=auth_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_reject_only_one_team(client: AsyncClient, auth_headers: dict) -> None:
    """Test 9b: Providing only one team is rejected."""
    p1 = await make_player(client, auth_headers, "P1")
    mid = await make_match(client, auth_headers)

    resp = await client.post(
        f"/matches/{mid}/teams",
        json={"teams": [{"label": "Team A", "player_ids": [p1]}]},
        headers=auth_headers,
    )
    assert resp.status_code == 422


# ─── Test 10: Start valid match ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_start_match(client: AsyncClient, auth_headers: dict) -> None:
    """Test 10: Start a match with valid teams."""
    p1 = await make_player(client, auth_headers, "P1")
    p2 = await make_player(client, auth_headers, "P2")
    mid = await make_match(client, auth_headers)
    await make_teams(client, auth_headers, mid, [p1], [p2])

    resp = await client.post(f"/matches/{mid}/start", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "live"


@pytest.mark.asyncio
async def test_start_match_without_teams(client: AsyncClient, auth_headers: dict) -> None:
    """Test 10b: Cannot start match without teams."""
    mid = await make_match(client, auth_headers)
    resp = await client.post(f"/matches/{mid}/start", headers=auth_headers)
    assert resp.status_code in (409, 422)


# ─── Test 11: Enter volleyball result ────────────────────────────────────────

@pytest.mark.asyncio
async def test_enter_volleyball_result(client: AsyncClient, auth_headers: dict) -> None:
    """Test 11: Enter a volleyball result."""
    p1 = await make_player(client, auth_headers, "P1")
    p2 = await make_player(client, auth_headers, "P2")
    mid = await make_match(client, auth_headers, sport="volleyball")
    r = await make_teams(client, auth_headers, mid, [p1], [p2])
    teams = r.json()["teams"]
    team_a_id = next(t["id"] for t in teams if t["label"] == "Team A")

    await client.post(f"/matches/{mid}/start", headers=auth_headers)

    resp = await client.post(
        f"/matches/{mid}/result",
        json={"team_a_score": 25, "team_b_score": 20, "winning_team_id": team_a_id},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    result = resp.json()["result"]
    assert result["team_a_score"] == 25
    assert result["team_b_score"] == 20
    assert result["winning_team_id"] == team_a_id


# ─── Test 12: Enter badminton result ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_enter_badminton_result(client: AsyncClient, auth_headers: dict) -> None:
    """Test 12: Enter a badminton result (nullable scores)."""
    p1 = await make_player(client, auth_headers, "P1")
    p2 = await make_player(client, auth_headers, "P2")
    mid = await make_match(client, auth_headers, sport="badminton")
    r = await make_teams(client, auth_headers, mid, [p1], [p2])
    teams = r.json()["teams"]
    team_b_id = next(t["id"] for t in teams if t["label"] == "Team B")

    await client.post(f"/matches/{mid}/start", headers=auth_headers)

    resp = await client.post(
        f"/matches/{mid}/result",
        json={"team_a_score": 21, "team_b_score": 19, "winning_team_id": team_b_id},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    result = resp.json()["result"]
    assert result["winning_team_id"] == team_b_id


# ─── Test 13: Select Player of Match ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_player_of_match(client: AsyncClient, auth_headers: dict) -> None:
    """Test 13: Set Player of the Match."""
    p1 = await make_player(client, auth_headers, "MVP Player")
    p2 = await make_player(client, auth_headers, "P2")
    mid = await make_match(client, auth_headers)
    r = await make_teams(client, auth_headers, mid, [p1], [p2])
    teams = r.json()["teams"]
    team_a_id = next(t["id"] for t in teams if t["label"] == "Team A")

    await client.post(f"/matches/{mid}/start", headers=auth_headers)
    await client.post(
        f"/matches/{mid}/result",
        json={"team_a_score": 3, "team_b_score": 0, "winning_team_id": team_a_id},
        headers=auth_headers,
    )
    await client.post(
        f"/matches/{mid}/end",
        json={"reason": "completed"},
        headers=auth_headers,
    )

    resp = await client.post(
        f"/matches/{mid}/player_of_match",
        json={"player_id": p1},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["player_of_match_id"] == p1


@pytest.mark.asyncio
async def test_player_of_match_must_be_participant(client: AsyncClient, auth_headers: dict) -> None:
    """Test 13b: Player of Match must have played in the match."""
    p1 = await make_player(client, auth_headers, "P1")
    p2 = await make_player(client, auth_headers, "P2")
    outsider = await make_player(client, auth_headers, "Outsider")

    mid = await make_match(client, auth_headers)
    r = await make_teams(client, auth_headers, mid, [p1], [p2])
    teams = r.json()["teams"]
    team_a_id = next(t["id"] for t in teams if t["label"] == "Team A")

    await client.post(f"/matches/{mid}/start", headers=auth_headers)
    await client.post(
        f"/matches/{mid}/result",
        json={"team_a_score": 3, "team_b_score": 0, "winning_team_id": team_a_id},
        headers=auth_headers,
    )
    await client.post(f"/matches/{mid}/end", json={"reason": "completed"}, headers=auth_headers)

    resp = await client.post(
        f"/matches/{mid}/player_of_match",
        json={"player_id": outsider},
        headers=auth_headers,
    )
    assert resp.status_code == 422


# ─── Test 14: End match ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_end_match_completed(client: AsyncClient, auth_headers: dict) -> None:
    """Test 14: End match with reason='completed'."""
    p1 = await make_player(client, auth_headers, "P1")
    p2 = await make_player(client, auth_headers, "P2")
    mid = await make_match(client, auth_headers)
    r = await make_teams(client, auth_headers, mid, [p1], [p2])
    teams = r.json()["teams"]
    team_a_id = next(t["id"] for t in teams if t["label"] == "Team A")

    await client.post(f"/matches/{mid}/start", headers=auth_headers)
    await client.post(
        f"/matches/{mid}/result",
        json={"team_a_score": 25, "team_b_score": 20, "winning_team_id": team_a_id},
        headers=auth_headers,
    )

    resp = await client.post(
        f"/matches/{mid}/end",
        json={"reason": "completed"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "completed"
    assert data["end_reason"] == "completed"


@pytest.mark.asyncio
async def test_end_match_abandoned(client: AsyncClient, auth_headers: dict) -> None:
    """Test 14b: End match with reason='rain' (abandoned, no result required)."""
    p1 = await make_player(client, auth_headers, "P1")
    p2 = await make_player(client, auth_headers, "P2")
    mid = await make_match(client, auth_headers)
    await make_teams(client, auth_headers, mid, [p1], [p2])
    await client.post(f"/matches/{mid}/start", headers=auth_headers)

    resp = await client.post(
        f"/matches/{mid}/end",
        json={"reason": "rain"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "abandoned"
    assert data["end_reason"] == "rain"


# ─── Test 15: Retrieve completed match ────────────────────────────────────────

@pytest.mark.asyncio
async def test_retrieve_completed_match(client: AsyncClient, auth_headers: dict) -> None:
    """Test 15: Completed match is visible in list and detail."""
    p1 = await make_player(client, auth_headers, "P1")
    p2 = await make_player(client, auth_headers, "P2")
    mid = await make_match(client, auth_headers)
    r = await make_teams(client, auth_headers, mid, [p1], [p2])
    teams = r.json()["teams"]
    team_a_id = next(t["id"] for t in teams if t["label"] == "Team A")

    await client.post(f"/matches/{mid}/start", headers=auth_headers)
    await client.post(
        f"/matches/{mid}/result",
        json={"team_a_score": 3, "team_b_score": 1, "winning_team_id": team_a_id},
        headers=auth_headers,
    )
    await client.post(f"/matches/{mid}/end", json={"reason": "completed"}, headers=auth_headers)

    # Detail
    detail_resp = await client.get(f"/matches/{mid}")
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["status"] == "completed"
    assert detail["result"]["winning_team_id"] == team_a_id

    # In list
    list_resp = await client.get("/matches?status=completed")
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] >= 1


# ─── Test 16: Invalid state transitions ───────────────────────────────────────

@pytest.mark.asyncio
async def test_reject_completed_to_live(client: AsyncClient, auth_headers: dict) -> None:
    """Test 16: Cannot start a completed match."""
    p1 = await make_player(client, auth_headers, "P1")
    p2 = await make_player(client, auth_headers, "P2")
    mid = await make_match(client, auth_headers)
    r = await make_teams(client, auth_headers, mid, [p1], [p2])
    teams = r.json()["teams"]
    team_a_id = next(t["id"] for t in teams if t["label"] == "Team A")

    await client.post(f"/matches/{mid}/start", headers=auth_headers)
    await client.post(
        f"/matches/{mid}/result",
        json={"team_a_score": 3, "team_b_score": 0, "winning_team_id": team_a_id},
        headers=auth_headers,
    )
    await client.post(f"/matches/{mid}/end", json={"reason": "completed"}, headers=auth_headers)

    # Attempt to start again
    resp = await client.post(f"/matches/{mid}/start", headers=auth_headers)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_reject_result_on_completed_match(client: AsyncClient, auth_headers: dict) -> None:
    """Test 16b: Cannot enter result on a completed match."""
    p1 = await make_player(client, auth_headers, "P1")
    p2 = await make_player(client, auth_headers, "P2")
    mid = await make_match(client, auth_headers)
    r = await make_teams(client, auth_headers, mid, [p1], [p2])
    teams = r.json()["teams"]
    team_a_id = next(t["id"] for t in teams if t["label"] == "Team A")

    await client.post(f"/matches/{mid}/start", headers=auth_headers)
    await client.post(
        f"/matches/{mid}/result",
        json={"team_a_score": 3, "team_b_score": 0, "winning_team_id": team_a_id},
        headers=auth_headers,
    )
    await client.post(f"/matches/{mid}/end", json={"reason": "completed"}, headers=auth_headers)

    resp = await client.post(
        f"/matches/{mid}/result",
        json={"team_a_score": 1, "team_b_score": 0, "winning_team_id": team_a_id},
        headers=auth_headers,
    )
    assert resp.status_code == 409


# ─── Test 17: Prevent modification of completed match ─────────────────────────

@pytest.mark.asyncio
async def test_cannot_end_completed_match(client: AsyncClient, auth_headers: dict) -> None:
    """Test 17: Cannot end an already completed match."""
    p1 = await make_player(client, auth_headers, "P1")
    p2 = await make_player(client, auth_headers, "P2")
    mid = await make_match(client, auth_headers)
    r = await make_teams(client, auth_headers, mid, [p1], [p2])
    teams = r.json()["teams"]
    team_a_id = next(t["id"] for t in teams if t["label"] == "Team A")

    await client.post(f"/matches/{mid}/start", headers=auth_headers)
    await client.post(
        f"/matches/{mid}/result",
        json={"team_a_score": 25, "team_b_score": 0, "winning_team_id": team_a_id},
        headers=auth_headers,
    )
    await client.post(f"/matches/{mid}/end", json={"reason": "completed"}, headers=auth_headers)

    # Try ending again
    resp = await client.post(
        f"/matches/{mid}/end",
        json={"reason": "rain"},
        headers=auth_headers,
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_result_requires_valid_winner(client: AsyncClient, auth_headers: dict) -> None:
    """Test: winning_team_id must be a team in the match."""
    p1 = await make_player(client, auth_headers, "P1")
    p2 = await make_player(client, auth_headers, "P2")
    mid = await make_match(client, auth_headers)
    await make_teams(client, auth_headers, mid, [p1], [p2])
    await client.post(f"/matches/{mid}/start", headers=auth_headers)

    resp = await client.post(
        f"/matches/{mid}/result",
        json={"team_a_score": 25, "team_b_score": 20, "winning_team_id": "nonexistent-team-id"},
        headers=auth_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_complete_without_result_rejected(client: AsyncClient, auth_headers: dict) -> None:
    """Test: Cannot complete a match without entering a result first."""
    p1 = await make_player(client, auth_headers, "P1")
    p2 = await make_player(client, auth_headers, "P2")
    mid = await make_match(client, auth_headers)
    await make_teams(client, auth_headers, mid, [p1], [p2])
    await client.post(f"/matches/{mid}/start", headers=auth_headers)

    resp = await client.post(
        f"/matches/{mid}/end",
        json={"reason": "completed"},
        headers=auth_headers,
    )
    assert resp.status_code == 422
