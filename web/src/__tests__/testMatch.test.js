import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/db';
import { playerService } from '../services/playerService';
import * as matchEngine from '../engines/matchEngine';
import * as cricketScorer from '../engines/cricketScorer';
import * as statsEngine from '../engines/statsEngine';

describe('Test Match Mode (Multi-Innings, Declarations, Chase, Lead/Trail)', () => {
  let pA1, pA2, pB1, pB2;
  let teamAId, teamBId;

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

    pA1 = await playerService.create('Rohit');
    pA2 = await playerService.create('Kohli');
    pB1 = await playerService.create('Root');
    pB2 = await playerService.create('Stokes');
  });

  async function createTestMatch() {
    const match = await matchEngine.createMatch({
      sport: 'cricket',
      cricket_format: 'test',
    });

    const withTeams = await matchEngine.createTeams(match.id, {
      teams: [
        { label: 'Team A', player_ids: [pA1.id, pA2.id] },
        { label: 'Team B', player_ids: [pB1.id, pB2.id] },
      ],
    });

    const teamA = withTeams.teams.find((t) => t.label === 'Team A');
    const teamB = withTeams.teams.find((t) => t.label === 'Team B');
    teamAId = teamA.id;
    teamBId = teamB.id;

    await matchEngine.startMatch(match.id);
    return match;
  }

  // ── 1. Full 4-Innings Sequence & Win by Wickets ─────────────────

  it('executes a full 4-innings test match sequence and resolves win by wickets', async () => {
    const match = await createTestMatch();

    // ── Innings 1: Team A bats ──
    const inn1 = await cricketScorer.initInnings({
      matchId: match.id,
      battingTeamId: teamAId,
      inningsNumber: 1,
      openingBatterId: pA1.id,
      openingBowlerId: pB1.id,
    });
    expect(inn1.innings.overs_limit).toBe(9999);

    // Score 20 runs
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 4 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 4 }); // 20 runs

    // Declare Innings 1
    await cricketScorer.declareInnings({ matchId: match.id, inningsId: inn1.innings.id });
    const inn1Check = await db.innings.get(inn1.innings.id);
    expect(inn1Check.is_closed).toBe(true);
    expect(inn1Check.is_declared).toBe(true);

    // ── Innings 2: Team B bats ──
    const inn2 = await cricketScorer.switchInnings({
      matchId: match.id,
      openingBatterId: pB1.id,
      openingBowlerId: pA1.id,
    });
    expect(inn2.innings.innings_number).toBe(2);
    expect(inn2.innings.batting_team_id).toBe(teamBId);

    // Score 15 runs and declare (trails by 5)
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn2.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn2.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn2.innings.id, runs: 3 }); // 15 runs
    await cricketScorer.declareInnings({ matchId: match.id, inningsId: inn2.innings.id });

    // Check trail equation
    const inn2State = await cricketScorer.getInningsState(inn2.innings.id);
    expect(inn2State.targetInfo.trailOrLead).toContain('Trail by 5 runs');

    // ── Innings 3: Team A bats (2nd innings) ──
    const inn3 = await cricketScorer.switchInnings({
      matchId: match.id,
      openingBatterId: pA2.id,
      openingBowlerId: pB2.id,
    });
    expect(inn3.innings.innings_number).toBe(3);
    expect(inn3.innings.batting_team_id).toBe(teamAId);

    // Score 10 runs and declare
    // Team A Aggregate: 20 + 10 = 30.
    // Team B Inn 1: 15.
    // Target for Team B: (30 - 15) + 1 = 16 runs.
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn3.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn3.innings.id, runs: 4 }); // 10 runs
    await cricketScorer.declareInnings({ matchId: match.id, inningsId: inn3.innings.id });

    // ── Innings 4: Team B chases Target 16 ──
    const inn4 = await cricketScorer.switchInnings({
      matchId: match.id,
      openingBatterId: pB1.id,
      openingBowlerId: pA1.id,
    });
    expect(inn4.innings.innings_number).toBe(4);
    expect(inn4.targetInfo.targetRuns).toBe(16);
    expect(inn4.targetInfo.runsNeeded).toBe(16);

    // Score 16 runs (6 + 6 + 4)
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn4.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn4.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn4.innings.id, runs: 4 });

    // Verify Match Completed and Team B Won by Wickets
    const finalSc = await cricketScorer.getMatchScorecard(match.id);
    expect(finalSc.match.status).toBe('completed');
    expect(finalSc.winner.id).toBe(teamBId);
    expect(finalSc.resultSummary).toContain('Team B won by 2 wickets');
  });

  // ── 2. Win by Runs in 4th Innings ──────────────────────────────

  it('correctly concludes Team A win by runs when Team B is all out in 4th innings', async () => {
    const match = await createTestMatch();

    // Innings 1: Team A scores 30
    const inn1 = await cricketScorer.initInnings({
      matchId: match.id,
      battingTeamId: teamAId,
      inningsNumber: 1,
      openingBatterId: pA1.id,
      openingBowlerId: pB1.id,
    });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 6 }); // 30
    await cricketScorer.declareInnings({ matchId: match.id, inningsId: inn1.innings.id });

    // Innings 2: Team B scores 20
    const inn2 = await cricketScorer.switchInnings({ matchId: match.id, openingBatterId: pB1.id });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn2.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn2.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn2.innings.id, runs: 8 }); // 20
    await cricketScorer.declareInnings({ matchId: match.id, inningsId: inn2.innings.id });

    // Innings 3: Team A scores 15
    // Team A Total: 45. Team B Inn 1: 20. Target for Team B: (45 - 20) + 1 = 26 runs.
    const inn3 = await cricketScorer.switchInnings({ matchId: match.id, openingBatterId: pA1.id });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn3.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn3.innings.id, runs: 9 }); // 15
    await cricketScorer.declareInnings({ matchId: match.id, inningsId: inn3.innings.id });

    // Innings 4: Team B chases 26, but gets all out at 10 runs
    const inn4 = await cricketScorer.switchInnings({ matchId: match.id, openingBatterId: pB1.id });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn4.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn4.innings.id, runs: 4 }); // 10 runs

    // Wicket 1: pB1 out, pB2 in
    await cricketScorer.recordBall({
      matchId: match.id,
      inningsId: inn4.innings.id,
      isWicket: true,
      dismissalType: 'bowled',
      dismissedPlayerId: pB1.id,
      nextBatterId: pB2.id,
    });

    // Wicket 2: pB2 out (All out)
    await cricketScorer.recordBall({
      matchId: match.id,
      inningsId: inn4.innings.id,
      isWicket: true,
      dismissalType: 'caught',
      dismissedPlayerId: pB2.id,
    });

    // Team A should win by (26 - 1 - 10) = 15 runs!
    const finalSc = await cricketScorer.getMatchScorecard(match.id);
    expect(finalSc.match.status).toBe('completed');
    expect(finalSc.winner.id).toBe(teamAId);
    expect(finalSc.resultSummary).toContain('Team A won by 15 runs');
  });

  // ── 3. Innings Defeat (Win by an Innings and Runs) ───────────────

  it('ends match automatically in 3rd innings if team suffers an innings defeat', async () => {
    const match = await createTestMatch();

    // Innings 1: Team A scores 10
    const inn1 = await cricketScorer.initInnings({
      matchId: match.id,
      battingTeamId: teamAId,
      inningsNumber: 1,
      openingBatterId: pA1.id,
      openingBowlerId: pB1.id,
    });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 10 });
    await cricketScorer.declareInnings({ matchId: match.id, inningsId: inn1.innings.id });

    // Innings 2: Team B scores 50
    const inn2 = await cricketScorer.switchInnings({ matchId: match.id, openingBatterId: pB1.id });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn2.innings.id, runs: 50 });
    await cricketScorer.declareInnings({ matchId: match.id, inningsId: inn2.innings.id });

    // Innings 3: Team A bats, scores 20 (Total A = 30 <= 50) and gets all out
    const inn3 = await cricketScorer.switchInnings({ matchId: match.id, openingBatterId: pA1.id });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn3.innings.id, runs: 20 });

    // Wicket 1
    await cricketScorer.recordBall({
      matchId: match.id,
      inningsId: inn3.innings.id,
      isWicket: true,
      dismissalType: 'bowled',
      dismissedPlayerId: pA1.id,
      nextBatterId: pA2.id,
    });

    // Wicket 2 (All out)
    await cricketScorer.recordBall({
      matchId: match.id,
      inningsId: inn3.innings.id,
      isWicket: true,
      dismissalType: 'bowled',
      dismissedPlayerId: pA2.id,
    });

    // Team B wins by an innings and 20 runs!
    const finalSc = await cricketScorer.getMatchScorecard(match.id);
    expect(finalSc.match.status).toBe('completed');
    expect(finalSc.winner.id).toBe(teamBId);
    expect(finalSc.resultSummary).toContain('Team B won by an innings and 20 runs');
  });

  // ── 4. Test Match Tie ───────────────────────────────────────────

  it('records a Tie when 4th innings ends with exact level aggregate scores', async () => {
    const match = await createTestMatch();

    // Inn 1: A scores 20
    const inn1 = await cricketScorer.initInnings({ matchId: match.id, battingTeamId: teamAId, inningsNumber: 1 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 20 });
    await cricketScorer.declareInnings({ matchId: match.id, inningsId: inn1.innings.id });

    // Inn 2: B scores 20
    const inn2 = await cricketScorer.switchInnings({ matchId: match.id });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn2.innings.id, runs: 20 });
    await cricketScorer.declareInnings({ matchId: match.id, inningsId: inn2.innings.id });

    // Inn 3: A scores 10 (Target for B: 11)
    const inn3 = await cricketScorer.switchInnings({ matchId: match.id });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn3.innings.id, runs: 10 });
    await cricketScorer.declareInnings({ matchId: match.id, inningsId: inn3.innings.id });

    // Inn 4: B scores 10 and gets all out (Total runs 30 each)
    const inn4 = await cricketScorer.switchInnings({ matchId: match.id, openingBatterId: pB1.id });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn4.innings.id, runs: 10 });

    await cricketScorer.recordBall({
      matchId: match.id,
      inningsId: inn4.innings.id,
      isWicket: true,
      dismissalType: 'bowled',
      dismissedPlayerId: pB1.id,
      nextBatterId: pB2.id,
    });
    await cricketScorer.recordBall({
      matchId: match.id,
      inningsId: inn4.innings.id,
      isWicket: true,
      dismissalType: 'bowled',
      dismissedPlayerId: pB2.id,
    });

    const finalSc = await cricketScorer.getMatchScorecard(match.id);
    expect(finalSc.match.status).toBe('completed');
    expect(finalSc.winner).toBeNull();
    expect(finalSc.resultSummary).toBe('Match Tied');
  });

  // ── 5. Test Match Draw ──────────────────────────────────────────

  it('records Match Drawn when endMatchAsDraw is called', async () => {
    const match = await createTestMatch();

    const inn1 = await cricketScorer.initInnings({ matchId: match.id, battingTeamId: teamAId, inningsNumber: 1 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 15 });

    const sc = await cricketScorer.endMatchAsDraw(match.id);
    expect(sc.match.status).toBe('completed');
    expect(sc.match.end_reason).toBe('draw');
    expect(sc.resultSummary).toBe('Match Drawn');
  });

  // ── 6. Multi-Innings Undo & Stats Engine Integration ────────────

  it('supports undo across innings and aggregates batting/bowling statistics', async () => {
    const match = await createTestMatch();

    const inn1 = await cricketScorer.initInnings({
      matchId: match.id,
      battingTeamId: teamAId,
      inningsNumber: 1,
      openingBatterId: pA1.id,
      openingBowlerId: pB1.id,
    });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 4 });
    await cricketScorer.declareInnings({ matchId: match.id, inningsId: inn1.innings.id });

    // Switch to Innings 2
    const inn2 = await cricketScorer.switchInnings({
      matchId: match.id,
      openingBatterId: pB1.id,
      openingBowlerId: pA1.id,
    });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn2.innings.id, runs: 6 });

    // Undo the last delivery in Innings 2
    await cricketScorer.undoLastBall({ matchId: match.id, inningsId: inn2.innings.id });
    const inn2AfterUndo = await cricketScorer.getInningsState(inn2.innings.id);
    expect(inn2AfterUndo.totalRuns).toBe(0);

    // Check stats for pA1 (batting runs: 10 from Innings 1)
    await cricketScorer.endMatchAsDraw(match.id);
    const pA1Stats = await statsEngine.getPlayerStats(pA1.id);
    expect(pA1Stats.sports.cricket.batting.runs).toBe(10);
  });
});
