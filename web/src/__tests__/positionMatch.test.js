import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/db';
import { playerService } from '../services/playerService';
import * as matchEngine from '../engines/matchEngine';
import * as statsEngine from '../engines/statsEngine';

describe('Position Matches & Multi-Participant Ranking', () => {
  beforeEach(async () => {
    await db.players.clear();
    await db.matches.clear();
    await db.teams.clear();
    await db.team_players.clear();
    await db.match_results.clear();
  });

  async function createTestPlayers() {
    const p1 = await playerService.create('Player 1');
    const p2 = await playerService.create('Player 2');
    const p3 = await playerService.create('Player 3');
    const p4 = await playerService.create('Player 4');
    return { p1, p2, p3, p4 };
  }

  it('creates and completes a valid position match with calculated points', async () => {
    const { p1, p2, p3, p4 } = await createTestPlayers();

    const match = await matchEngine.createPositionMatch({
      rankings: [
        { player_id: p1.id, position: 1 },
        { player_id: p2.id, position: 2 },
        { player_id: p3.id, position: 3 },
        { player_id: p4.id, position: 4 },
      ],
      match_date: '2026-09-05',
    });

    expect(match).toBeDefined();
    expect(match.sport).toBe('position');
    expect(match.status).toBe('completed');
    expect(match.result).toBeDefined();
    expect(match.result.winner_player_id).toBe(p1.id);
    expect(match.result.hydratedRankings).toHaveLength(4);

    const r1 = match.result.hydratedRankings.find((r) => r.player_id === p1.id);
    expect(r1.position).toBe(1);
    expect(r1.points).toBe(3);
    expect(r1.player.name).toBe('Player 1');

    const r2 = match.result.hydratedRankings.find((r) => r.player_id === p2.id);
    expect(r2.position).toBe(2);
    expect(r2.points).toBe(2);

    const r3 = match.result.hydratedRankings.find((r) => r.player_id === p3.id);
    expect(r3.position).toBe(3);
    expect(r3.points).toBe(1);

    const r4 = match.result.hydratedRankings.find((r) => r.player_id === p4.id);
    expect(r4.position).toBe(4);
    expect(r4.points).toBe(0);
  });

  it('rejects position matches with duplicate players', async () => {
    const { p1, p2 } = await createTestPlayers();

    await expect(
      matchEngine.createPositionMatch({
        rankings: [
          { player_id: p1.id, position: 1 },
          { player_id: p1.id, position: 2 },
        ],
      })
    ).rejects.toThrow(/multiple positions/i);
  });

  it('rejects position matches with missing positions or discontinuous placements', async () => {
    const { p1, p2, p3 } = await createTestPlayers();

    await expect(
      matchEngine.createPositionMatch({
        rankings: [
          { player_id: p1.id, position: 1 },
          { player_id: p2.id, position: 3 }, // missing position 2
          { player_id: p3.id, position: 4 },
        ],
      })
    ).rejects.toThrow(/positions/i);
  });

  it('rejects position matches with fewer than 2 participants', async () => {
    const { p1 } = await createTestPlayers();

    await expect(
      matchEngine.createPositionMatch({
        rankings: [{ player_id: p1.id, position: 1 }],
      })
    ).rejects.toThrow(/at least 2/i);
  });

  it('cascades deletion cleanly: deletes match and results while keeping player records untouched', async () => {
    const { p1, p2, p3 } = await createTestPlayers();

    const match = await matchEngine.createPositionMatch({
      rankings: [
        { player_id: p1.id, position: 1 },
        { player_id: p2.id, position: 2 },
        { player_id: p3.id, position: 3 },
      ],
    });

    const matchId = match.id;
    expect(await db.matches.get(matchId)).toBeDefined();
    expect(await db.match_results.where('match_id').equals(matchId).first()).toBeDefined();

    // Delete the match
    await matchEngine.deleteMatch(matchId);

    // Verify match and result are removed
    expect(await db.matches.get(matchId)).toBeUndefined();
    expect(await db.match_results.where('match_id').equals(matchId).first()).toBeUndefined();

    // Verify all players remain in the database
    const survivingP1 = await db.players.get(p1.id);
    const survivingP2 = await db.players.get(p2.id);
    const survivingP3 = await db.players.get(p3.id);
    expect(survivingP1).toBeDefined();
    expect(survivingP2).toBeDefined();
    expect(survivingP3).toBeDefined();
  });

  it('accurately integrates position match statistics into getPlayerStats', async () => {
    const { p1, p2, p3, p4 } = await createTestPlayers();

    await matchEngine.createPositionMatch({
      rankings: [
        { player_id: p1.id, position: 1 },
        { player_id: p2.id, position: 2 },
        { player_id: p3.id, position: 3 },
        { player_id: p4.id, position: 4 },
      ],
    });

    await matchEngine.createPositionMatch({
      rankings: [
        { player_id: p2.id, position: 1 },
        { player_id: p1.id, position: 2 },
        { player_id: p3.id, position: 3 },
        { player_id: p4.id, position: 4 },
      ],
    });

    // p1: one 1st place (3 pts), one 2nd place (2 pts) -> totalPoints = 5
    const p1Stats = await statsEngine.getPlayerStats(p1.id);
    expect(p1Stats.totalMatches).toBe(2);
    expect(p1Stats.rankingPoints).toBe(5);
    expect(p1Stats.sports.position.matches).toBe(2);
    expect(p1Stats.sports.position.firstPlaceCount).toBe(1);
    expect(p1Stats.sports.position.secondPlaceCount).toBe(1);
    expect(p1Stats.sports.position.rankingPoints).toBe(5);

    // p4: two 4th places -> totalPoints = 0
    const p4Stats = await statsEngine.getPlayerStats(p4.id);
    expect(p4Stats.totalMatches).toBe(2);
    expect(p4Stats.rankingPoints).toBe(0);
    expect(p4Stats.sports.position.rankingPoints).toBe(0);
  });

  it('accurately derives sport-specific position leaderboard rankings', async () => {
    const { p1, p2, p3, p4 } = await createTestPlayers();

    await matchEngine.createPositionMatch({
      rankings: [
        { player_id: p1.id, position: 1 },
        { player_id: p2.id, position: 2 },
        { player_id: p3.id, position: 3 },
        { player_id: p4.id, position: 4 },
      ],
    });

    const positionRankings = await statsEngine.getRankings('position');
    expect(positionRankings.sport).toBe('position');
    expect(positionRankings.rankings.length).toBe(4);
    expect(positionRankings.rankings[0].playerId).toBe(p1.id);
    expect(positionRankings.rankings[0].rank).toBe(1);
    expect(positionRankings.rankings[0].rankingPoints).toBe(3);
    expect(positionRankings.rankings[1].playerId).toBe(p2.id);
    expect(positionRankings.rankings[1].rankingPoints).toBe(2);
    expect(positionRankings.rankings[2].playerId).toBe(p3.id);
    expect(positionRankings.rankings[2].rankingPoints).toBe(1);
    expect(positionRankings.rankings[3].playerId).toBe(p4.id);
    expect(positionRankings.rankings[3].rankingPoints).toBe(0);
  });

  it('updates colony interesting stats and position highlights without altering team synergy records', async () => {
    const { p1, p2, p3, p4 } = await createTestPlayers();

    await matchEngine.createPositionMatch({
      rankings: [
        { player_id: p1.id, position: 1 },
        { player_id: p2.id, position: 2 },
        { player_id: p3.id, position: 3 },
        { player_id: p4.id, position: 4 },
      ],
    });

    const colonyStats = await statsEngine.getColonyInterestingStats();
    expect(colonyStats.summary.sportBreakdown.position).toBe(1);
    expect(colonyStats.sports.position.matches).toBe(1);
    expect(colonyStats.sports.position.topWinner.player.name).toBe('Player 1');
    expect(colonyStats.sports.position.mostPoints.points).toBe(3);
    expect(colonyStats.positionStats.matches).toBe(1);
    expect(colonyStats.positionStats.leader.points).toBe(3);

    // Team synergy and pair synergy remain intact (empty because position matches have no teams)
    expect(colonyStats.bestTeamCombination.leader).toBeNull();
    expect(colonyStats.bestPlayerPair.leader).toBeNull();
  });
});
