import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/db';
import { playersApi, matchesApi } from '../services/api';

describe('API Adapter Layer (Compatibility for UI Components)', () => {
  beforeEach(async () => {
    await db.players.clear();
    await db.matches.clear();
    await db.teams.clear();
    await db.team_players.clear();
    await db.match_results.clear();
  });

  it('provides playersApi with { data } response shape', async () => {
    const createRes = await playersApi.create('KL Rahul');
    expect(createRes.data.name).toBe('KL Rahul');

    const listRes = await playersApi.list(false);
    expect(listRes.data.total).toBe(1);
    expect(listRes.data.players[0].name).toBe('KL Rahul');

    const getRes = await playersApi.get(createRes.data.id);
    expect(getRes.data.name).toBe('KL Rahul');

    const toggleRes = await playersApi.toggle(createRes.data.id, false);
    expect(toggleRes.data.is_active).toBe(false);
  });

  it('provides matchesApi with { data } response shape', async () => {
    const p1Res = await playersApi.create('P1');
    const p2Res = await playersApi.create('P2');

    const matchRes = await matchesApi.create('volleyball');
    expect(matchRes.data.id).toBeDefined();
    expect(matchRes.data.status).toBe('upcoming');

    const teamsRes = await matchesApi.createTeams(matchRes.data.id, [
      { label: 'Team A', player_ids: [p1Res.data.id] },
      { label: 'Team B', player_ids: [p2Res.data.id] },
    ]);
    expect(teamsRes.data.teams.length).toBe(2);

    const startRes = await matchesApi.start(matchRes.data.id);
    expect(startRes.data.status).toBe('live');

    const teamAId = teamsRes.data.teams.find((t) => t.label === 'Team A').id;
    const resultRes = await matchesApi.enterResult(matchRes.data.id, 25, 20, teamAId);
    expect(resultRes.data.result.team_a_score).toBe(25);

    const endRes = await matchesApi.end(matchRes.data.id, 'completed');
    expect(endRes.data.status).toBe('completed');

    const pomRes = await matchesApi.setPlayerOfMatch(matchRes.data.id, p1Res.data.id);
    expect(pomRes.data.player_of_match_id).toBe(p1Res.data.id);

    const listRes = await matchesApi.list({ status: 'completed' });
    expect(listRes.data.total).toBe(1);
  });
});
