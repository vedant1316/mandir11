import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/db';
import { playerService } from '../services/playerService';
import * as matchEngine from '../engines/matchEngine';
import * as cricketScorer from '../engines/cricketScorer';
import {
  MatchStateError,
  InningsClosedError,
  IllegalBowlerError,
  InvalidDeliveryError,
  CricketScorerError,
} from '../engines/errors';

describe('CricketScorer State Machine (IndexedDB Local-First)', () => {
  beforeEach(async () => {
    await db.players.clear();
    await db.matches.clear();
    await db.teams.clear();
    await db.team_players.clear();
    await db.match_results.clear();
    await db.innings.clear();
    await db.overs.clear();
    await db.balls.clear();
  });

  async function createCricketMatchFixture() {
    const p1 = await playerService.create('Virat');
    const p2 = await playerService.create('Rohit');
    const p3 = await playerService.create('KL');
    const p4 = await playerService.create('Bumrah');
    const p5 = await playerService.create('Shami');
    const p6 = await playerService.create('Siraj');

    const match = await matchEngine.createMatch({ sport: 'cricket' });
    const matchWithTeams = await matchEngine.createTeams(match.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id, p2.id, p3.id] },
        { label: 'Team B', player_ids: [p4.id, p5.id, p6.id] },
      ],
    });

    const liveMatch = await matchEngine.startMatch(match.id);
    const teamA = matchWithTeams.teams.find((t) => t.label === 'Team A');
    const teamB = matchWithTeams.teams.find((t) => t.label === 'Team B');

    return {
      match: liveMatch,
      teamA,
      teamB,
      players: { p1, p2, p3, p4, p5, p6 },
    };
  }

  // ── 1. Innings Initialization ─────────────────────────────────

  it('initializes Innings 1 with opening batter, opening bowler, and creates Over #1', async () => {
    const { match, teamA, players } = await createCricketMatchFixture();

    const state = await cricketScorer.initInnings({
      matchId: match.id,
      battingTeamId: teamA.id,
      inningsNumber: 1,
      oversLimit: 5,
      openingBatterId: players.p1.id,
      openingBowlerId: players.p4.id,
    });

    expect(state.innings.match_id).toBe(match.id);
    expect(state.innings.batting_team_id).toBe(teamA.id);
    expect(state.innings.innings_number).toBe(1);
    expect(state.innings.overs_limit).toBe(5);
    expect(state.totalRuns).toBe(0);
    expect(state.totalWickets).toBe(0);
    expect(state.currentBatter.id).toBe(players.p1.id);
    expect(state.currentBatter.player.name).toBe('Virat');
    expect(state.activeOverBowler.id).toBe(players.p4.id);
    expect(state.activeOverBowler.name).toBe('Bumrah');
    expect(state.activeOverNumber).toBe(1);
    expect(state.isOverComplete).toBe(false);
  });

  // ── 2. Runs & Boundaries Scoring ──────────────────────────────

  it('records dots, singles, boundaries, and sixes with accurate batter and bowler stats', async () => {
    const { match, teamA, players } = await createCricketMatchFixture();

    const initial = await cricketScorer.initInnings({
      matchId: match.id,
      battingTeamId: teamA.id,
      inningsNumber: 1,
      oversLimit: 2,
      openingBatterId: players.p1.id,
      openingBowlerId: players.p4.id,
    });

    const innId = initial.innings.id;

    // Ball 1: Dot (0 runs)
    await cricketScorer.recordBall({ matchId: match.id, inningsId: innId, runs: 0 });
    // Ball 2: Single (1 run)
    await cricketScorer.recordBall({ matchId: match.id, inningsId: innId, runs: 1 });
    // Ball 3: Boundary (4 runs)
    await cricketScorer.recordBall({ matchId: match.id, inningsId: innId, runs: 4 });
    // Ball 4: Maximum (6 runs)
    const state = await cricketScorer.recordBall({ matchId: match.id, inningsId: innId, runs: 6 });

    expect(state.totalRuns).toBe(11);
    expect(state.totalWickets).toBe(0);
    expect(state.legalBallsBowled).toBe(4);
    expect(state.oversFormatted).toBe('0.4');

    // Striker (Virat) stats
    const batter = state.currentBatter;
    expect(batter.runs).toBe(11);
    expect(batter.balls).toBe(4);
    expect(batter.fours).toBe(1);
    expect(batter.sixes).toBe(1);
    expect(batter.strikeRate).toBe(275);

    // Bowler (Bumrah) stats
    const bowler = state.bowlingScorecard.find((b) => b.id === players.p4.id);
    expect(bowler.runs).toBe(11);
    expect(bowler.legalBalls).toBe(4);
    expect(bowler.oversFormatted).toBe('0.4');
    expect(bowler.economy).toBe(16.5);
  });

  // ── 3. Extras (Wides & No Balls) ──────────────────────────────

  it('handles Wide balls correctly without advancing legal ball count or batter balls faced', async () => {
    const { match, teamA, players } = await createCricketMatchFixture();

    const initial = await cricketScorer.initInnings({
      matchId: match.id,
      battingTeamId: teamA.id,
      inningsNumber: 1,
      oversLimit: 2,
      openingBatterId: players.p1.id,
      openingBowlerId: players.p4.id,
    });
    const innId = initial.innings.id;

    // Standard wide (+1 penalty)
    await cricketScorer.recordBall({
      matchId: match.id,
      inningsId: innId,
      extraType: 'wide',
      extraRuns: 0,
    });

    // Wide + 2 extra byes (total 3 runs)
    const state = await cricketScorer.recordBall({
      matchId: match.id,
      inningsId: innId,
      extraType: 'wide',
      extraRuns: 2,
    });

    expect(state.totalRuns).toBe(4); // 1 + (1 + 2) = 4
    expect(state.legalBallsBowled).toBe(0);
    expect(state.oversFormatted).toBe('0.0');
    expect(state.extras.wides).toBe(4);
    expect(state.currentBatter.balls).toBe(0);
    expect(state.currentBatter.runs).toBe(0);
  });

  it('handles No Balls correctly giving batsman credit for runs off the bat without legal ball', async () => {
    const { match, teamA, players } = await createCricketMatchFixture();

    const initial = await cricketScorer.initInnings({
      matchId: match.id,
      battingTeamId: teamA.id,
      inningsNumber: 1,
      oversLimit: 2,
      openingBatterId: players.p1.id,
      openingBowlerId: players.p4.id,
    });
    const innId = initial.innings.id;

    // No ball + 4 runs off the bat (total 5 runs)
    const state = await cricketScorer.recordBall({
      matchId: match.id,
      inningsId: innId,
      runs: 4,
      extraType: 'no_ball',
      extraRuns: 0,
    });

    expect(state.totalRuns).toBe(5); // 1 penalty + 4 off bat
    expect(state.legalBallsBowled).toBe(0);
    expect(state.currentBatter.runs).toBe(4);
    expect(state.currentBatter.fours).toBe(1);
    expect(state.currentBatter.balls).toBe(1);
  });

  // ── 4. Wicket Handling & Next Batter Selection ────────────────

  it('records wickets, updates bowler wicket count, and sets next batter', async () => {
    const { match, teamA, players } = await createCricketMatchFixture();

    const initial = await cricketScorer.initInnings({
      matchId: match.id,
      battingTeamId: teamA.id,
      inningsNumber: 1,
      oversLimit: 2,
      openingBatterId: players.p1.id,
      openingBowlerId: players.p4.id,
    });
    const innId = initial.innings.id;

    // Virat gets out caught, Rohit comes in
    const state = await cricketScorer.recordBall({
      matchId: match.id,
      inningsId: innId,
      runs: 0,
      isWicket: true,
      dismissalType: 'caught',
      nextBatterId: players.p2.id,
    });

    expect(state.totalWickets).toBe(1);
    expect(state.currentBatter.id).toBe(players.p2.id);
    expect(state.currentBatter.player.name).toBe('Rohit');

    // Check dismissed batter scorecard
    const viratCard = state.battingScorecard.find((b) => b.id === players.p1.id);
    expect(viratCard.isOut).toBe(true);
    expect(viratCard.status).toBe('out');
    expect(viratCard.dismissalType).toBe('caught');

    // Check fall of wickets
    expect(state.fallOfWickets.length).toBe(1);
    expect(state.fallOfWickets[0].wicketNumber).toBe(1);
    expect(state.fallOfWickets[0].batterName).toBe('Virat');

    // Check bowler wickets
    const bowler = state.bowlingScorecard.find((b) => b.id === players.p4.id);
    expect(bowler.wickets).toBe(1);
  });

  it('rejects selecting an already dismissed batter', async () => {
    const { match, teamA, players } = await createCricketMatchFixture();

    const initial = await cricketScorer.initInnings({
      matchId: match.id,
      battingTeamId: teamA.id,
      inningsNumber: 1,
      oversLimit: 2,
      openingBatterId: players.p1.id,
      openingBowlerId: players.p4.id,
    });
    const innId = initial.innings.id;

    // 1st wicket: p1 out, p2 comes in
    await cricketScorer.recordBall({
      matchId: match.id,
      inningsId: innId,
      isWicket: true,
      dismissalType: 'bowled',
      nextBatterId: players.p2.id,
    });

    // 2nd wicket: p2 out, trying to select p1 (already out) should fail
    await expect(
      cricketScorer.recordBall({
        matchId: match.id,
        inningsId: innId,
        isWicket: true,
        dismissalType: 'bowled',
        nextBatterId: players.p1.id,
      })
    ).rejects.toThrow(InvalidDeliveryError);
  });

  // ── 5. All Out Detection & Innings Closure ────────────────────

  it('automatically closes the innings when all team batters are out', async () => {
    const { match, teamA, players } = await createCricketMatchFixture();

    const initial = await cricketScorer.initInnings({
      matchId: match.id,
      battingTeamId: teamA.id,
      inningsNumber: 1,
      oversLimit: 5,
      openingBatterId: players.p1.id,
      openingBowlerId: players.p4.id,
    });
    const innId = initial.innings.id;

    // Team A has 3 players (p1, p2, p3)
    // Wicket 1: p1 out -> p2 in
    await cricketScorer.recordBall({
      matchId: match.id,
      inningsId: innId,
      isWicket: true,
      dismissalType: 'bowled',
      nextBatterId: players.p2.id,
    });

    // Wicket 2: p2 out -> p3 in
    await cricketScorer.recordBall({
      matchId: match.id,
      inningsId: innId,
      isWicket: true,
      dismissalType: 'caught',
      nextBatterId: players.p3.id,
    });

    // Wicket 3: p3 out -> All Out!
    const state = await cricketScorer.recordBall({
      matchId: match.id,
      inningsId: innId,
      isWicket: true,
      dismissalType: 'bowled',
    });

    expect(state.totalWickets).toBe(3);
    expect(state.isAllOut).toBe(true);
    expect(state.isInningsClosed).toBe(true);

    // Further delivery rejected
    await expect(
      cricketScorer.recordBall({ matchId: match.id, inningsId: innId, runs: 1 })
    ).rejects.toThrow(InningsClosedError);
  });

  // ── 6. Over Tracking & Bowler Alternation ─────────────────────

  it('completes over after 6 legal deliveries and enforces bowler alternation', async () => {
    const { match, teamA, players } = await createCricketMatchFixture();

    const initial = await cricketScorer.initInnings({
      matchId: match.id,
      battingTeamId: teamA.id,
      inningsNumber: 1,
      oversLimit: 2,
      openingBatterId: players.p1.id,
      openingBowlerId: players.p4.id,
    });
    const innId = initial.innings.id;

    // Bowl 5 legal balls + 1 wide + 1 legal ball (total 6 legal balls)
    for (let i = 0; i < 5; i++) {
      await cricketScorer.recordBall({ matchId: match.id, inningsId: innId, runs: 1 });
    }
    await cricketScorer.recordBall({ matchId: match.id, inningsId: innId, extraType: 'wide' });
    const endOverState = await cricketScorer.recordBall({ matchId: match.id, inningsId: innId, runs: 2 });

    expect(endOverState.legalBallsInCurrentOver).toBe(6);
    expect(endOverState.isOverComplete).toBe(true);

    // Trying to bowl 7th legal ball without starting next over fails
    await expect(
      cricketScorer.recordBall({ matchId: match.id, inningsId: innId, runs: 1 })
    ).rejects.toThrow(CricketScorerError);

    // Cannot choose same bowler (p4) for consecutive over
    await expect(
      cricketScorer.startNextOver({ inningsId: innId, bowlerId: players.p4.id })
    ).rejects.toThrow(IllegalBowlerError);

    // Valid next bowler (p5 Shami) starts Over 2
    const over2State = await cricketScorer.startNextOver({
      inningsId: innId,
      bowlerId: players.p5.id,
    });

    expect(over2State.activeOverNumber).toBe(2);
    expect(over2State.activeOverBowler.id).toBe(players.p5.id);
    expect(over2State.activeOverBowler.name).toBe('Shami');
    expect(over2State.legalBallsInCurrentOver).toBe(0);
    expect(over2State.isOverComplete).toBe(false);
  });

  // ── 7. Chase, Target Calculation & Automatic Match Completion ──

  it('executes 2nd innings chase and automatically completes match when target is reached (win by wickets)', async () => {
    const { match, teamA, teamB, players } = await createCricketMatchFixture();

    // Innings 1: Team A scores 10 runs in 1 over (6 legal balls)
    const inn1 = await cricketScorer.initInnings({
      matchId: match.id,
      battingTeamId: teamA.id,
      inningsNumber: 1,
      oversLimit: 1,
      openingBatterId: players.p1.id,
      openingBowlerId: players.p4.id,
    });

    // 10 runs in 6 balls (4, 4, 1, 1, 0, 0)
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 4 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 4 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 1 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 1 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 0 });
    const inn1Final = await cricketScorer.recordBall({
      matchId: match.id,
      inningsId: inn1.innings.id,
      runs: 0,
    });

    expect(inn1Final.totalRuns).toBe(10);
    expect(inn1Final.isInningsClosed).toBe(true);

    // Switch to Innings 2: Team B batting (Target = 11)
    const inn2 = await cricketScorer.switchInnings({
      matchId: match.id,
      nextBattingTeamId: teamB.id,
      openingBatterId: players.p4.id,
      openingBowlerId: players.p1.id,
    });

    expect(inn2.innings.innings_number).toBe(2);
    expect(inn2.targetInfo.targetRuns).toBe(11);
    expect(inn2.targetInfo.runsNeeded).toBe(11);

    // Ball 1: Six (6 runs) -> Need 5
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn2.innings.id, runs: 6 });

    // Ball 2: Six (6 runs) -> Total 12 >= 11 Target reached!
    const winState = await cricketScorer.recordBall({
      matchId: match.id,
      inningsId: inn2.innings.id,
      runs: 6,
    });

    expect(winState.totalRuns).toBe(12);
    expect(winState.isInningsClosed).toBe(true);
    expect(winState.isMatchCompleted).toBe(true);

    // Verify Match status and Match Results in DB
    const updatedMatch = await matchEngine.getMatch(match.id);
    expect(updatedMatch.status).toBe('completed');
    expect(updatedMatch.end_reason).toBe('completed');
    expect(updatedMatch.result.winning_team_id).toBe(teamB.id);

    const scorecard = await cricketScorer.getMatchScorecard(match.id);
    expect(scorecard.resultSummary).toContain('Team B won by 3 wickets');
  });

  it('completes match with win by runs when defending team successfully defends target', async () => {
    const { match, teamA, teamB, players } = await createCricketMatchFixture();

    // Innings 1: Team A scores 15 runs
    const inn1 = await cricketScorer.initInnings({
      matchId: match.id,
      battingTeamId: teamA.id,
      inningsNumber: 1,
      oversLimit: 1,
      openingBatterId: players.p1.id,
      openingBowlerId: players.p4.id,
    });

    for (let i = 0; i < 5; i++) {
      await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 3 });
    }
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 0 });

    // Innings 2: Team B scores only 8 runs in 1 over (Target 16)
    const inn2 = await cricketScorer.switchInnings({
      matchId: match.id,
      nextBattingTeamId: teamB.id,
      openingBatterId: players.p4.id,
      openingBowlerId: players.p1.id,
    });

    for (let i = 0; i < 6; i++) {
      await cricketScorer.recordBall({ matchId: match.id, inningsId: inn2.innings.id, runs: 1 });
    }

    const updatedMatch = await matchEngine.getMatch(match.id);
    expect(updatedMatch.status).toBe('completed');
    expect(updatedMatch.result.winning_team_id).toBe(teamA.id);

    const scorecard = await cricketScorer.getMatchScorecard(match.id);
    expect(scorecard.resultSummary).toContain('Team A won by 9 runs');
  });

  // ── 8. Undo Mechanics ─────────────────────────────────────────

  it('reverts runs, wickets, and match completion cleanly when undo is executed', async () => {
    const { match, teamA, players } = await createCricketMatchFixture();

    const initial = await cricketScorer.initInnings({
      matchId: match.id,
      battingTeamId: teamA.id,
      inningsNumber: 1,
      oversLimit: 2,
      openingBatterId: players.p1.id,
      openingBowlerId: players.p4.id,
    });
    const innId = initial.innings.id;

    // Delivery 1: 4 runs
    await cricketScorer.recordBall({ matchId: match.id, inningsId: innId, runs: 4 });
    // Delivery 2: Wicket (Virat out, Rohit in)
    await cricketScorer.recordBall({
      matchId: match.id,
      inningsId: innId,
      isWicket: true,
      dismissalType: 'bowled',
      nextBatterId: players.p2.id,
    });

    let state = await cricketScorer.getInningsState(innId);
    expect(state.totalRuns).toBe(4);
    expect(state.totalWickets).toBe(1);
    expect(state.currentBatter.id).toBe(players.p2.id);

    // Undo wicket delivery!
    const undoneWicket = await cricketScorer.undoLastBall({ matchId: match.id, inningsId: innId });
    expect(undoneWicket.totalWickets).toBe(0);
    expect(undoneWicket.totalRuns).toBe(4);
    expect(undoneWicket.currentBatter.id).toBe(players.p1.id); // Virat restored to crease!
    expect(undoneWicket.battingScorecard.find((b) => b.id === players.p1.id).isOut).toBe(false);

    // Undo 4 runs delivery!
    const undoneRuns = await cricketScorer.undoLastBall({ matchId: match.id, inningsId: innId });
    expect(undoneRuns.totalRuns).toBe(0);
    expect(undoneRuns.legalBallsBowled).toBe(0);
  });

  // ── 9. Immutability on Completed Matches ───────────────────────

  it('rejects modifications on completed cricket matches', async () => {
    const { match, teamA, teamB, players } = await createCricketMatchFixture();

    const inn1 = await cricketScorer.initInnings({
      matchId: match.id,
      battingTeamId: teamA.id,
      inningsNumber: 1,
      oversLimit: 1,
      openingBatterId: players.p1.id,
      openingBowlerId: players.p4.id,
    });

    for (let i = 0; i < 6; i++) {
      await cricketScorer.recordBall({ matchId: match.id, inningsId: inn1.innings.id, runs: 1 });
    }

    const inn2 = await cricketScorer.switchInnings({
      matchId: match.id,
      nextBattingTeamId: teamB.id,
      openingBatterId: players.p4.id,
      openingBowlerId: players.p1.id,
    });

    // Score 7 runs off 2 balls to win
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn2.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn2.innings.id, runs: 1 });

    const completedMatch = await matchEngine.getMatch(match.id);
    expect(completedMatch.status).toBe('completed');

    // Attempting further scoring throws MatchStateError
    await expect(
      cricketScorer.recordBall({ matchId: match.id, inningsId: inn2.innings.id, runs: 1 })
    ).rejects.toThrow(MatchStateError);
  });
});
