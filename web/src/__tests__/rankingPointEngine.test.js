import { describe, it, expect } from 'vitest';
import {
  DEFAULT_POSITION_POINTS,
  getPositionPoints,
  assignRankingPoints,
  calculatePlayerPositionStats,
  calculateAllPlayersPositionLeaderboard,
} from '../engines/rankingPointEngine';

describe('Ranking Point Engine', () => {
  it('assigns correct default points: 1st=3, 2nd=2, 3rd=1, 4th+=0', () => {
    expect(getPositionPoints(1)).toBe(3);
    expect(getPositionPoints(2)).toBe(2);
    expect(getPositionPoints(3)).toBe(1);
    expect(getPositionPoints(4)).toBe(0);
    expect(getPositionPoints(5)).toBe(0);
    expect(getPositionPoints('1')).toBe(3);
    expect(getPositionPoints('2')).toBe(2);
    expect(getPositionPoints('3')).toBe(1);
    expect(getPositionPoints('4')).toBe(0);
  });

  it('handles invalid or non-positive positions safely', () => {
    expect(getPositionPoints(0)).toBe(0);
    expect(getPositionPoints(-1)).toBe(0);
    expect(getPositionPoints('abc')).toBe(0);
    expect(getPositionPoints(null)).toBe(0);
    expect(getPositionPoints(undefined)).toBe(0);
  });

  it('supports custom ranking rules from configuration', () => {
    const customRules = {
      position_match: {
        points: { 1: 5, 2: 3, 3: 2, 4: 1 },
        default_points: 0,
      },
    };
    expect(getPositionPoints(1, customRules)).toBe(5);
    expect(getPositionPoints(2, customRules)).toBe(3);
    expect(getPositionPoints(3, customRules)).toBe(2);
    expect(getPositionPoints(4, customRules)).toBe(1);
    expect(getPositionPoints(5, customRules)).toBe(0);
  });

  it('decorates ranking lists with appropriate points', () => {
    const rawRankings = [
      { player_id: 'p1', position: 1 },
      { player_id: 'p2', position: 2 },
      { player_id: 'p3', position: 3 },
      { player_id: 'p4', position: 4 },
    ];

    const decorated = assignRankingPoints(rawRankings);
    expect(decorated).toEqual([
      { player_id: 'p1', position: 1, points: 3 },
      { player_id: 'p2', position: 2, points: 2 },
      { player_id: 'p3', position: 3, points: 1 },
      { player_id: 'p4', position: 4, points: 0 },
    ]);
  });

  it('calculates player position stats across multiple matches accurately', () => {
    const completedMatches = [
      { id: 'm1', sport: 'position', status: 'completed' },
      { id: 'm2', sport: 'position', status: 'completed' },
      { id: 'm3', sport: 'position', status: 'completed' },
    ];

    const resultMap = new Map([
      ['m1', { match_id: 'm1', rankings: [{ player_id: 'p1', position: 1, points: 3 }, { player_id: 'p2', position: 2, points: 2 }] }],
      ['m2', { match_id: 'm2', rankings: [{ player_id: 'p1', position: 2, points: 2 }, { player_id: 'p2', position: 1, points: 3 }] }],
      ['m3', { match_id: 'm3', rankings: [{ player_id: 'p1', position: 3, points: 1 }, { player_id: 'p3', position: 1, points: 3 }] }],
    ]);

    const stats = calculatePlayerPositionStats('p1', completedMatches, resultMap);
    expect(stats.matches).toBe(3);
    expect(stats.firstPlaceCount).toBe(1);
    expect(stats.wins).toBe(1);
    expect(stats.secondPlaceCount).toBe(1);
    expect(stats.thirdPlaceCount).toBe(1);
    expect(stats.podiumCount).toBe(3);
    expect(stats.totalPoints).toBe(6); // 3 + 2 + 1
    expect(stats.bestPosition).toBe(1);
    expect(stats.averagePosition).toBe(2); // (1+2+3)/3 = 2
  });

  it('calculates aggregated leaderboard standings across all players', () => {
    const players = [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
      { id: 'p3', name: 'Charlie' },
    ];

    const completedMatches = [
      { id: 'm1', sport: 'position' },
      { id: 'm2', sport: 'position' },
    ];

    const resultMap = new Map([
      ['m1', { rankings: [{ player_id: 'p1', position: 1, points: 3 }, { player_id: 'p2', position: 2, points: 2 }, { player_id: 'p3', position: 3, points: 1 }] }],
      ['m2', { rankings: [{ player_id: 'p2', position: 1, points: 3 }, { player_id: 'p1', position: 2, points: 2 }, { player_id: 'p3', position: 3, points: 1 }] }],
    ]);

    const { standings } = calculateAllPlayersPositionLeaderboard(players, completedMatches, resultMap);
    expect(standings.length).toBe(3);
    // Both Alice and Bob have 5 points (3+2), 1 win, 1 2nd place. Sorted alphabetically Alice then Bob
    expect(standings[0].totalPoints).toBe(5);
    expect(standings[1].totalPoints).toBe(5);
    expect(standings[2].totalPoints).toBe(2);
    expect(standings[2].player.name).toBe('Charlie');
  });
});
