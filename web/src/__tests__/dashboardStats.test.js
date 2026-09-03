import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/db';
import * as matchEngine from '../engines/matchEngine';
import { matchesApi } from '../services/api';

describe('Dashboard Matches Count & Stat Cards', () => {
  beforeEach(async () => {
    await db.matches.clear();
    await db.teams.clear();
    await db.team_players.clear();
    await db.match_results.clear();
  });

  it('returns 0 when there are no matches in IndexedDB', async () => {
    const count = await matchEngine.countMatches();
    expect(count).toBe(0);

    const apiRes = await matchesApi.count();
    expect(apiRes.data).toBe(0);
  });

  it('correctly counts all match statuses (upcoming, live, completed, abandoned)', async () => {
    await db.matches.bulkAdd([
      { id: 'm1', sport: 'cricket', status: 'upcoming', date: '2026-09-01' },
      { id: 'm2', sport: 'volleyball', status: 'live', date: '2026-09-01' },
      { id: 'm3', sport: 'cricket', status: 'completed', date: '2026-09-02' },
      { id: 'm4', sport: 'badminton', status: 'abandoned', date: '2026-09-02' },
    ]);

    const totalCount = await matchEngine.countMatches();
    expect(totalCount).toBe(4);

    const apiRes = await matchesApi.count();
    expect(apiRes.data).toBe(4);
  });

  it('correctly reflects more than 5 matches and does not cap at 5 (e.g. 27 matches)', async () => {
    const matches = [];
    const statuses = ['upcoming', 'live', 'completed', 'abandoned'];
    for (let i = 1; i <= 27; i++) {
      matches.push({
        id: `match_${i}`,
        sport: i % 2 === 0 ? 'cricket' : 'volleyball',
        status: statuses[i % statuses.length],
        date: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`,
        created_at: new Date(2026, 8, i).toISOString(),
      });
    }
    await db.matches.bulkAdd(matches);

    // Test matchEngine count
    const totalCount = await matchEngine.countMatches();
    expect(totalCount).toBe(27);
    expect(totalCount).toBeGreaterThan(5);

    // Test matchesApi.count
    const res = await matchesApi.count();
    expect(res.data).toBe(27);
    expect(typeof res.data).toBe('number');
    expect(String(res.data)).not.toContain('+');
  });

  it('supports filtered count when params are specified', async () => {
    await db.matches.bulkAdd([
      { id: 'm1', sport: 'cricket', status: 'completed' },
      { id: 'm2', sport: 'cricket', status: 'completed' },
      { id: 'm3', sport: 'cricket', status: 'upcoming' },
      { id: 'm4', sport: 'volleyball', status: 'completed' },
      { id: 'm5', sport: 'volleyball', status: 'live' },
    ]);

    const completedCricket = await matchEngine.countMatches({ status: 'completed', sport: 'cricket' });
    expect(completedCricket).toBe(2);

    const allCompleted = await matchEngine.countMatches({ status: 'completed' });
    expect(allCompleted).toBe(3);

    const allVolleyball = await matchEngine.countMatches({ sport: 'volleyball' });
    expect(allVolleyball).toBe(2);

    const totalAll = await matchEngine.countMatches();
    expect(totalAll).toBe(5);
  });

  it('filters matches by status for live and upcoming stat card links', async () => {
    await db.matches.bulkAdd([
      { id: 'm1', sport: 'cricket', status: 'live', date: '2026-09-01' },
      { id: 'm2', sport: 'volleyball', status: 'live', date: '2026-09-02' },
      { id: 'm3', sport: 'cricket', status: 'upcoming', date: '2026-09-03' },
      { id: 'm4', sport: 'badminton', status: 'completed', date: '2026-09-04' },
    ]);

    const liveRes = await matchesApi.list({ status: 'live' });
    expect(liveRes.data.matches.length).toBe(2);
    expect(liveRes.data.matches.map((m) => m.id)).toEqual(['m2', 'm1']);

    const upcomingRes = await matchesApi.list({ status: 'upcoming' });
    expect(upcomingRes.data.matches.length).toBe(1);
    expect(upcomingRes.data.matches[0].id).toBe('m3');
  });
});
