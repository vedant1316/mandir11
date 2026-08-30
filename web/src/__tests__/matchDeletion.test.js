import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/db';
import { playerService } from '../services/playerService';
import * as matchEngine from '../engines/matchEngine';
import * as cricketScorer from '../engines/cricketScorer';
import * as ledgerEngine from '../engines/ledgerEngine';
import { MatchNotFoundError } from '../engines/errors';

describe('Complete Match Record Deletion (Cascading Dexie Transaction)', () => {
  beforeEach(async () => {
    await db.players.clear();
    await db.matches.clear();
    await db.teams.clear();
    await db.team_players.clear();
    await db.match_results.clear();
    await db.innings.clear();
    await db.overs.clear();
    await db.balls.clear();
    await db.ledger_entries.clear();
  });

  async function createPlayerPool() {
    const p1 = await playerService.create('Virat');
    const p2 = await playerService.create('Rohit');
    const p3 = await playerService.create('Bumrah');
    const p4 = await playerService.create('Shami');
    return { p1, p2, p3, p4 };
  }

  // ── 1. Delete standard match (Volleyball) ─────────────────────

  it('permanently deletes a normal match and all associated records (teams, team_players, results)', async () => {
    const { p1, p2, p3, p4 } = await createPlayerPool();

    const match = await matchEngine.createMatch({ sport: 'volleyball' });
    const withTeams = await matchEngine.createTeams(match.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id, p2.id] },
        { label: 'Team B', player_ids: [p3.id, p4.id] },
      ],
    });

    const teamAId = withTeams.teams.find((t) => t.label === 'Team A').id;
    const teamBId = withTeams.teams.find((t) => t.label === 'Team B').id;

    await matchEngine.startMatch(match.id);
    await matchEngine.enterResult(match.id, {
      team_a_score: 25,
      team_b_score: 20,
      winning_team_id: teamAId,
    });
    await matchEngine.endMatch(match.id, { reason: 'completed' });

    // Perform deletion
    const res = await matchEngine.deleteMatch(match.id);
    expect(res.success).toBe(true);

    // Match store
    const matchInDb = await db.matches.get(match.id);
    expect(matchInDb).toBeUndefined();

    // Teams store
    const teamsInDb = await db.teams.where('match_id').equals(match.id).toArray();
    expect(teamsInDb).toEqual([]);

    // Team players store
    const tpsA = await db.team_players.where('team_id').equals(teamAId).toArray();
    const tpsB = await db.team_players.where('team_id').equals(teamBId).toArray();
    expect(tpsA).toEqual([]);
    expect(tpsB).toEqual([]);

    // Results store
    const resultsInDb = await db.match_results.where('match_id').equals(match.id).toArray();
    expect(resultsInDb).toEqual([]);
  });

  // ── 2. Delete cricket match with innings, overs, and balls ────

  it('permanently deletes a cricket match with all innings, overs, and ball deliveries', async () => {
    const { p1, p2, p3, p4 } = await createPlayerPool();

    const match = await matchEngine.createMatch({ sport: 'cricket' });
    const withTeams = await matchEngine.createTeams(match.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id, p2.id] },
        { label: 'Team B', player_ids: [p3.id, p4.id] },
      ],
    });
    const teamA = withTeams.teams.find((t) => t.label === 'Team A');

    await matchEngine.startMatch(match.id);

    const inn = await cricketScorer.initInnings({
      matchId: match.id,
      battingTeamId: teamA.id,
      inningsNumber: 1,
      oversLimit: 2,
      openingBatterId: p1.id,
      openingBowlerId: p3.id,
    });

    // Score several balls
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn.innings.id, runs: 4 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn.innings.id, extraType: 'wide' });

    // Verify records exist before deletion
    const ballsBefore = await db.balls.where('innings_id').equals(inn.innings.id).toArray();
    expect(ballsBefore.length).toBe(3);

    const oversBefore = await db.overs.where('innings_id').equals(inn.innings.id).toArray();
    expect(oversBefore.length).toBe(1);

    // Perform deletion
    await matchEngine.deleteMatch(match.id);

    // Verify all cricket records deleted
    const matchInDb = await db.matches.get(match.id);
    expect(matchInDb).toBeUndefined();

    const inningsInDb = await db.innings.where('match_id').equals(match.id).toArray();
    expect(inningsInDb).toEqual([]);

    const oversInDb = await db.overs.where('innings_id').equals(inn.innings.id).toArray();
    expect(oversInDb).toEqual([]);

    const ballsInDb = await db.balls.where('innings_id').equals(inn.innings.id).toArray();
    expect(ballsInDb).toEqual([]);
  });

  // ── 3. Delete match with money ledger entries ──────────────────

  it('permanently deletes ledger entries associated with the deleted match', async () => {
    const { p1, p2, p3, p4 } = await createPlayerPool();

    const match = await matchEngine.createMatch({ sport: 'volleyball' });
    await matchEngine.createTeams(match.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id, p2.id] },
        { label: 'Team B', player_ids: [p3.id, p4.id] },
      ],
    });

    // Add match ledger stakes
    await ledgerEngine.setMatchLedger(match.id, [
      { player_a_id: p1.id, player_b_id: p3.id, amount: 100 },
      { player_a_id: p2.id, player_b_id: p4.id, amount: 50 },
    ]);

    const ledgerBefore = await db.ledger_entries.where('match_id').equals(match.id).toArray();
    expect(ledgerBefore.length).toBe(2);

    // Delete match
    await matchEngine.deleteMatch(match.id);

    // Ledger entries deleted
    const ledgerAfter = await db.ledger_entries.where('match_id').equals(match.id).toArray();
    expect(ledgerAfter).toEqual([]);
  });

  // ── 4. Global players remain untouched ─────────────────────────

  it('guarantees global player records remain untouched when a match is deleted', async () => {
    const { p1, p2, p3, p4 } = await createPlayerPool();

    const match = await matchEngine.createMatch({ sport: 'badminton' });
    await matchEngine.createTeams(match.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id] },
        { label: 'Team B', player_ids: [p3.id] },
      ],
    });

    await matchEngine.deleteMatch(match.id);

    // Check all players in database
    const allPlayers = await db.players.toArray();
    expect(allPlayers.length).toBe(4);
    expect(allPlayers.map((p) => p.name)).toContain('Virat');
    expect(allPlayers.map((p) => p.name)).toContain('Rohit');
    expect(allPlayers.map((p) => p.name)).toContain('Bumrah');
    expect(allPlayers.map((p) => p.name)).toContain('Shami');
  });

  // ── 5. Another match and its data remain untouched ─────────────

  it('never affects another match or its associated data', async () => {
    const { p1, p2, p3, p4 } = await createPlayerPool();

    // Match 1
    const match1 = await matchEngine.createMatch({ sport: 'volleyball' });
    await matchEngine.createTeams(match1.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id] },
        { label: 'Team B', player_ids: [p3.id] },
      ],
    });

    // Match 2
    const match2 = await matchEngine.createMatch({ sport: 'badminton' });
    const m2WithTeams = await matchEngine.createTeams(match2.id, {
      teams: [
        { label: 'Team A', player_ids: [p2.id] },
        { label: 'Team B', player_ids: [p4.id] },
      ],
    });
    await matchEngine.startMatch(match2.id);
    await matchEngine.enterResult(match2.id, {
      team_a_score: 21,
      team_b_score: 15,
      winning_team_id: m2WithTeams.teams[0].id,
    });
    await matchEngine.endMatch(match2.id, { reason: 'completed' });

    // Delete Match 1 only
    await matchEngine.deleteMatch(match1.id);

    // Verify Match 1 is gone
    expect(await db.matches.get(match1.id)).toBeUndefined();
    expect(await db.teams.where('match_id').equals(match1.id).toArray()).toEqual([]);

    // Verify Match 2 is completely intact
    const m2InDb = await db.matches.get(match2.id);
    expect(m2InDb).toBeDefined();
    expect(m2InDb.status).toBe('completed');
    const m2Teams = await db.teams.where('match_id').equals(match2.id).toArray();
    expect(m2Teams.length).toBe(2);
    const m2Result = await db.match_results.where('match_id').equals(match2.id).first();
    expect(m2Result.team_a_score).toBe(21);
  });

  // ── 6. Deletion across all match states ────────────────────────

  it('allows deletion of upcoming, live, abandoned, and completed matches', async () => {
    const { p1, p2 } = await createPlayerPool();

    // 1. Upcoming match
    const mUpcoming = await matchEngine.createMatch({ sport: 'volleyball' });
    await matchEngine.deleteMatch(mUpcoming.id);
    expect(await db.matches.get(mUpcoming.id)).toBeUndefined();

    // 2. Live match
    const mLive = await matchEngine.createMatch({ sport: 'volleyball' });
    await matchEngine.createTeams(mLive.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id] },
        { label: 'Team B', player_ids: [p2.id] },
      ],
    });
    await matchEngine.startMatch(mLive.id);
    await matchEngine.deleteMatch(mLive.id);
    expect(await db.matches.get(mLive.id)).toBeUndefined();

    // 3. Abandoned match
    const mAbandoned = await matchEngine.createMatch({ sport: 'volleyball' });
    await matchEngine.createTeams(mAbandoned.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id] },
        { label: 'Team B', player_ids: [p2.id] },
      ],
    });
    await matchEngine.startMatch(mAbandoned.id);
    await matchEngine.endMatch(mAbandoned.id, { reason: 'rain' });
    await matchEngine.deleteMatch(mAbandoned.id);
    expect(await db.matches.get(mAbandoned.id)).toBeUndefined();
  });

  // ── 7. Nonexistent match handling ──────────────────────────────

  it('throws MatchNotFoundError when attempting to delete a nonexistent match', async () => {
    await expect(matchEngine.deleteMatch('nonexistent-uuid-123')).rejects.toThrow(
      MatchNotFoundError
    );
  });
});
