import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/db';
import { playerService } from '../services/playerService';
import * as matchEngine from '../engines/matchEngine';
import * as cricketScorer from '../engines/cricketScorer';
import * as statsEngine from '../engines/statsEngine';
import { generateScoreboardCanvas } from '../services/scoreboardGenerator';

describe('Automatic MVP, Redesigned Rankings & Team Reuse', () => {
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

  async function createTestPlayers() {
    const p1 = await playerService.create('Virat');
    const p2 = await playerService.create('Rohit');
    const p3 = await playerService.create('Bumrah');
    const p4 = await playerService.create('Shami');
    return { p1, p2, p3, p4 };
  }

  // ── 1. Automatic MVP in Limited Overs Cricket ───────────────────

  it('automatically calculates MVP for limited overs cricket with correct formula', async () => {
    const { p1, p2, p3, p4 } = await createTestPlayers();

    // Match: Team A (p1, p2) vs Team B (p3, p4)
    const match = await matchEngine.createMatch({ sport: 'cricket', cricket_format: 'limited_overs' });
    const withTeams = await matchEngine.createTeams(match.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id, p2.id] },
        { label: 'Team B', player_ids: [p3.id, p4.id] },
      ],
    });
    const teamA = withTeams.teams.find((t) => t.label === 'Team A');
    const teamB = withTeams.teams.find((t) => t.label === 'Team B');
    await matchEngine.startMatch(match.id);

    // Innings 1: Team A bats. p1 (Virat) scores 20 runs (4, 4, 6, 6)
    // p3 (Bumrah) bowls
    const inn1 = await cricketScorer.initInnings({
      matchId: match.id,
      battingTeamId: teamA.id,
      inningsNumber: 1,
      oversLimit: 1,
      openingBatterId: p1.id,
      openingBowlerId: p3.id,
    });

    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 4 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 4 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 0 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 0 });

    // Innings 2: Team B chases (Target 21). p3 (Bumrah) scores 5 runs, p1 bowls and takes 2 wickets!
    const inn2 = await cricketScorer.switchInnings({
      matchId: match.id,
      nextBattingTeamId: teamB.id,
      openingBatterId: p3.id,
      openingBowlerId: p1.id,
    });

    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn2.innings.id, runs: 5 });
    await cricketScorer.recordBall({
      matchId: match.id,
      inningsId: inn2.innings.id,
      runs: 0,
      isWicket: true,
      dismissalType: 'bowled',
      nextBatterId: p4.id,
    });
    // 2nd wicket -> All out! Match completes!
    await cricketScorer.recordBall({
      matchId: match.id,
      inningsId: inn2.innings.id,
      runs: 0,
      isWicket: true,
      dismissalType: 'caught',
    });

    // Check Match Completion & Automatic Player of Match
    const scorecard = await cricketScorer.getMatchScorecard(match.id);
    expect(scorecard.match.status).toBe('completed');
    expect(scorecard.match.player_of_match_id).toBe(p1.id);
    expect(scorecard.playerOfMatch.id).toBe(p1.id);

    // Verify MVP score breakdown for p1:
    // Win = 10 pts, Runs = 20 pts (20 * 1), Wickets = 10 pts (2 * 5) -> Total = 40 pts
    const mvpResult = await matchEngine.calculateMatchMvp(match.id);
    expect(mvpResult.playerOfMatchId).toBe(p1.id);
    const p1Score = mvpResult.mvpScores.find((s) => s.playerId === p1.id);
    expect(p1Score.outcome).toBe('win');
    expect(p1Score.outcomePoints).toBe(10);
    expect(p1Score.runs).toBe(20);
    expect(p1Score.wickets).toBe(2);
    expect(p1Score.totalPoints).toBe(40);

    // p3 (Bumrah): Loss (2) + Runs (5) + Wickets (0) = 7 pts
    const p3Score = mvpResult.mvpScores.find((s) => s.playerId === p3.id);
    expect(p3Score.outcome).toBe('loss');
    expect(p3Score.totalPoints).toBe(7);
  });

  // ── 2. Automatic MVP in Test Cricket (Multi-Innings Support) ────

  it('aggregates runs and wickets from ALL Test innings to determine MVP', async () => {
    const { p1, p2, p3, p4 } = await createTestPlayers();

    const match = await matchEngine.createMatch({ sport: 'cricket', cricket_format: 'test' });
    const withTeams = await matchEngine.createTeams(match.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id, p2.id] },
        { label: 'Team B', player_ids: [p3.id, p4.id] },
      ],
    });
    const teamA = withTeams.teams.find((t) => t.label === 'Team A');
    const teamB = withTeams.teams.find((t) => t.label === 'Team B');
    await matchEngine.startMatch(match.id);

    // Innings 1 (Team A): p1 scores 15 runs
    const inn1 = await cricketScorer.initInnings({
      matchId: match.id,
      battingTeamId: teamA.id,
      inningsNumber: 1,
      openingBatterId: p1.id,
      openingBowlerId: p3.id,
    });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 3 });
    await cricketScorer.declareInnings({ matchId: match.id, inningsId: inn1.innings.id }); // Declared at 15

    // Innings 2 (Team B): p3 scores 10 runs
    const inn2 = await cricketScorer.switchInnings({
      matchId: match.id,
      nextBattingTeamId: teamB.id,
      openingBatterId: p3.id,
      openingBowlerId: p1.id,
    });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn2.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn2.innings.id, runs: 4 });
    await cricketScorer.declareInnings({ matchId: match.id, inningsId: inn2.innings.id }); // Declared at 10

    // Innings 3 (Team A): p1 scores 12 more runs (Total runs for p1 across match = 27)
    const inn3 = await cricketScorer.switchInnings({
      matchId: match.id,
      nextBattingTeamId: teamA.id,
      openingBatterId: p1.id,
      openingBowlerId: p3.id,
    });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn3.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn3.innings.id, runs: 6 });
    await cricketScorer.declareInnings({ matchId: match.id, inningsId: inn3.innings.id }); // Total Team A = 15 + 12 = 27

    // Innings 4 (Team B): Target = (27 - 10) + 1 = 18 runs.
    // p1 bowls and takes 2 wickets -> Team A wins!
    const inn4 = await cricketScorer.switchInnings({
      matchId: match.id,
      nextBattingTeamId: teamB.id,
      openingBatterId: p3.id,
      openingBowlerId: p1.id,
    });
    await cricketScorer.recordBall({
      matchId: match.id,
      inningsId: inn4.innings.id,
      runs: 0,
      isWicket: true,
      dismissalType: 'bowled',
      nextBatterId: p4.id,
    });
    await cricketScorer.recordBall({
      matchId: match.id,
      inningsId: inn4.innings.id,
      runs: 0,
      isWicket: true,
      dismissalType: 'bowled',
    }); // All out -> Match Completed!

    const completedMatch = await matchEngine.getMatch(match.id);
    expect(completedMatch.status).toBe('completed');
    expect(completedMatch.player_of_match_id).toBe(p1.id);

    // p1 stats across all innings:
    // Win (10) + Inn1 runs (15) + Inn3 runs (12) + Inn4 wickets (2 * 5 = 10) = 47 pts
    const mvpResult = await matchEngine.calculateMatchMvp(match.id);
    const p1Score = mvpResult.mvpScores.find((s) => s.playerId === p1.id);
    expect(p1Score.runs).toBe(27);
    expect(p1Score.wickets).toBe(2);
    expect(p1Score.totalPoints).toBe(47);
  });

  // ── 3. Deterministic Tie-Breaking (Cricket) ─────────────────────

  it('handles MVP score ties deterministically by wickets, runs, and name in cricket', async () => {
    const { p1, p2, p3, p4 } = await createTestPlayers();

    // Cricket match: Team A wins
    // p1 (Virat) and p2 (Rohit) both on Team A -> both get 10 pts (0 runs, 0 wickets)
    // Deterministic tie-breaker selects p2 ('Rohit' comes before 'Virat' alphabetically)
    const m = await matchEngine.createMatch({ sport: 'cricket' });
    const t = await matchEngine.createTeams(m.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id, p2.id] },
        { label: 'Team B', player_ids: [p3.id, p4.id] },
      ],
    });
    const teamA = t.teams.find((tm) => tm.label === 'Team A');
    await matchEngine.startMatch(m.id);
    await db.match_results.add({
      id: 'cricket-tie-res',
      match_id: m.id,
      winning_team_id: teamA.id,
    });
    const completed = await matchEngine.endMatch(m.id, { reason: 'completed' });

    expect(completed.status).toBe('completed');
    expect(completed.player_of_match_id).toBeDefined();

    // Rohit ('Rohit') vs Virat ('Virat') -> 'Rohit' < 'Virat' alphabetically
    expect(completed.player_of_match_id).toBe(p2.id);
  });

  // ── 3.1. Volleyball & Badminton Have No MVP ─────────────────────

  it('does not calculate, store, or return MVP for Volleyball and Badminton', async () => {
    const { p1, p2, p3, p4 } = await createTestPlayers();

    // 1. Volleyball Match Completion
    const vb = await matchEngine.createMatch({ sport: 'volleyball' });
    const vbTeams = await matchEngine.createTeams(vb.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id, p2.id] },
        { label: 'Team B', player_ids: [p3.id, p4.id] },
      ],
    });
    const vbTeamA = vbTeams.teams.find((tm) => tm.label === 'Team A');
    await matchEngine.startMatch(vb.id);
    await matchEngine.enterResult(vb.id, {
      team_a_score: 25,
      team_b_score: 18,
      winning_team_id: vbTeamA.id,
    });
    const vbCompleted = await matchEngine.endMatch(vb.id, { reason: 'completed' });

    // Assert NO MVP is stored
    expect(vbCompleted.status).toBe('completed');
    expect(vbCompleted.player_of_match_id).toBeNull();

    // Assert calculateMatchMvp returns null/empty
    const vbMvp = await matchEngine.calculateMatchMvp(vb.id);
    expect(vbMvp.playerOfMatchId).toBeNull();
    expect(vbMvp.playerOfMatch).toBeNull();
    expect(vbMvp.mvpScores).toEqual([]);

    // 2. Badminton Match Completion
    const bm = await matchEngine.createMatch({ sport: 'badminton' });
    const bmTeams = await matchEngine.createTeams(bm.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id] },
        { label: 'Team B', player_ids: [p3.id] },
      ],
    });
    const bmTeamA = bmTeams.teams.find((tm) => tm.label === 'Team A');
    await matchEngine.startMatch(bm.id);
    await matchEngine.enterResult(bm.id, {
      team_a_score: 21,
      team_b_score: 15,
      winning_team_id: bmTeamA.id,
    });
    const bmCompleted = await matchEngine.endMatch(bm.id, { reason: 'completed' });

    // Assert NO MVP is stored
    expect(bmCompleted.status).toBe('completed');
    expect(bmCompleted.player_of_match_id).toBeNull();

    // Assert calculateMatchMvp returns null/empty
    const bmMvp = await matchEngine.calculateMatchMvp(bm.id);
    expect(bmMvp.playerOfMatchId).toBeNull();
    expect(bmMvp.playerOfMatch).toBeNull();
    expect(bmMvp.mvpScores).toEqual([]);
  });

  // ── 4. Dynamic Rankings Point Formula (+10W, +2L, +5T, +1R, +5Wkt)

  it('calculates rankings points dynamically and responds to match deletion', async () => {
    const { p1, p2, p3, p4 } = await createTestPlayers();

    // Cricket Match 1: p1 scores 30 runs + 1 wicket (win)
    // p1 points = 10 (win) + 30 (runs) + 5 (1 wicket) = 45 pts
    const match1 = await matchEngine.createMatch({ sport: 'cricket' });
    const withTeams1 = await matchEngine.createTeams(match1.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id] },
        { label: 'Team B', player_ids: [p3.id] },
      ],
    });
    const teamA = withTeams1.teams.find((t) => t.label === 'Team A');
    const teamB = withTeams1.teams.find((t) => t.label === 'Team B');
    await matchEngine.startMatch(match1.id);

    const inn1 = await cricketScorer.initInnings({
      matchId: match1.id,
      battingTeamId: teamA.id,
      inningsNumber: 1,
      oversLimit: 1,
      openingBatterId: p1.id,
      openingBowlerId: p3.id,
    });
    for (let i = 0; i < 5; i++) {
      await cricketScorer.recordBall({ matchId: match1.id, inningsId: inn1.innings.id, runs: 6 });
    }
    await cricketScorer.recordBall({ matchId: match1.id, inningsId: inn1.innings.id, runs: 0 }); // 30 runs

    const inn2 = await cricketScorer.switchInnings({
      matchId: match1.id,
      nextBattingTeamId: teamB.id,
      openingBatterId: p3.id,
      openingBowlerId: p1.id,
    });
    await cricketScorer.recordBall({
      matchId: match1.id,
      inningsId: inn2.innings.id,
      runs: 0,
      isWicket: true,
      dismissalType: 'bowled',
    }); // All out!

    const p1Stats = await statsEngine.getPlayerStats(p1.id);
    expect(p1Stats.totalWins).toBe(1);
    expect(p1Stats.totalRuns).toBe(30);
    expect(p1Stats.totalWickets).toBe(1);
    expect(p1Stats.rankingPoints).toBe(45); // (1*10) + (30*1) + (1*5)

    const rankings = await statsEngine.getRankings('overall');
    expect(rankings.rankings[0].playerId).toBe(p1.id);
    expect(rankings.rankings[0].rankingPoints).toBe(45);
    expect(rankings.rankings[0].runs).toBe(30);
    expect(rankings.rankings[0].wickets).toBe(1);

    // Delete match -> rankings reset
    await matchEngine.deleteMatch(match1.id);
    const resetStats = await statsEngine.getPlayerStats(p1.id);
    expect(resetStats.totalMatches).toBe(0);
    expect(resetStats.rankingPoints).toBe(0);
    expect(resetStats.totalRuns).toBe(0);
    expect(resetStats.totalWickets).toBe(0);
  });

  // ── 5. Team Reuse & Settings Helpers ───────────────────────────

  it('correctly retrieves last match lineups and settings for team reuse', async () => {
    const { p1, p2, p3, p4 } = await createTestPlayers();

    const match = await matchEngine.createMatch({ sport: 'cricket', cricket_format: 'limited_overs' });
    await matchEngine.createTeams(match.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id, p2.id] },
        { label: 'Team B', player_ids: [p3.id, p4.id] },
      ],
    });

    const lastTeams = await matchEngine.getLastMatchTeams();
    expect(lastTeams).toBeDefined();
    expect(lastTeams.sport).toBe('cricket');
    expect(lastTeams.cricketFormat).toBe('limited_overs');
    expect(lastTeams.teamA).toEqual(expect.arrayContaining([p1.id, p2.id]));
    expect(lastTeams.teamB).toEqual(expect.arrayContaining([p3.id, p4.id]));
    expect(lastTeams.teamA.length).toBe(2);
    expect(lastTeams.teamB.length).toBe(2);

    const lastSettings = await matchEngine.getLastMatchSettings();
    expect(lastSettings).toBeDefined();
    expect(lastSettings.sport).toBe('cricket');
  });

  // ── 6. Scoreboard Canvas Rendering ─────────────────────────────

  it('renders a scoreboard canvas without errors', async () => {
    const { p1, p2, p3, p4 } = await createTestPlayers();
    const match = await matchEngine.createMatch({ sport: 'volleyball' });
    const withTeams = await matchEngine.createTeams(match.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id, p2.id] },
        { label: 'Team B', player_ids: [p3.id, p4.id] },
      ],
    });
    const teamA = withTeams.teams.find((t) => t.label === 'Team A');
    await matchEngine.startMatch(match.id);
    await matchEngine.enterResult(match.id, {
      team_a_score: 25,
      team_b_score: 18,
      winning_team_id: teamA.id,
    });
    const completed = await matchEngine.endMatch(match.id, { reason: 'completed' });

    // Mock HTML5 canvas context in test environment
    const mockCanvas = generateScoreboardCanvas({
      match: completed,
      scorecard: null,
      settlement: null,
      allPlayers: [p1, p2, p3, p4],
    });

    expect(mockCanvas).toBeDefined();
    expect(mockCanvas.width).toBe(1080);
    expect(mockCanvas.height).toBe(1350);
  });
});
