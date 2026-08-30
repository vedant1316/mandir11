import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/db';
import { playerService } from '../services/playerService';
import * as matchEngine from '../engines/matchEngine';
import * as cricketScorer from '../engines/cricketScorer';
import * as statsEngine from '../engines/statsEngine';
import rankingRules from '../config/rankingRules.json';
import { PlayerNotFoundError } from '../engines/errors';

describe('StatsEngine & Leaderboard (IndexedDB Local-First)', () => {
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

  async function createPlayersFixture() {
    const p1 = await playerService.create('Virat');
    const p2 = await playerService.create('Rohit');
    const p3 = await playerService.create('Bumrah');
    const p4 = await playerService.create('Shami');
    return { p1, p2, p3, p4 };
  }

  // ── 1. Cricket Batting Statistics ──────────────────────────────

  it('calculates accurate cricket batting statistics across completed matches', async () => {
    const { p1, p2, p3, p4 } = await createPlayersFixture();

    // Match 1 (Cricket): 1-over match
    const match1 = await matchEngine.createMatch({ sport: 'cricket' });
    const withTeams1 = await matchEngine.createTeams(match1.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id, p2.id] },
        { label: 'Team B', player_ids: [p3.id, p4.id] },
      ],
    });
    const teamA = withTeams1.teams.find((t) => t.label === 'Team A');
    const teamB = withTeams1.teams.find((t) => t.label === 'Team B');
    await matchEngine.startMatch(match1.id);

    // Innings 1: Virat scores 16 off 6 balls (4, 6, 4, 1, 1, 0)
    const inn1 = await cricketScorer.initInnings({
      matchId: match1.id,
      battingTeamId: teamA.id,
      inningsNumber: 1,
      oversLimit: 1,
      openingBatterId: p1.id,
      openingBowlerId: p3.id,
    });

    await cricketScorer.recordBall({ matchId: match1.id, inningsId: inn1.innings.id, runs: 4 });
    await cricketScorer.recordBall({ matchId: match1.id, inningsId: inn1.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: match1.id, inningsId: inn1.innings.id, runs: 4 });
    await cricketScorer.recordBall({ matchId: match1.id, inningsId: inn1.innings.id, runs: 1 });
    await cricketScorer.recordBall({ matchId: match1.id, inningsId: inn1.innings.id, runs: 1 });
    await cricketScorer.recordBall({ matchId: match1.id, inningsId: inn1.innings.id, runs: 0 });

    // Innings 2: Team B chases (target 17), scores 5 runs in 6 balls -> Team A wins
    const inn2 = await cricketScorer.switchInnings({
      matchId: match1.id,
      nextBattingTeamId: teamB.id,
      openingBatterId: p3.id,
      openingBowlerId: p1.id,
    });

    for (let i = 0; i < 5; i++) {
      await cricketScorer.recordBall({ matchId: match1.id, inningsId: inn2.innings.id, runs: 1 });
    }
    // 6th ball: 0 runs -> Match completed automatically!
    await cricketScorer.recordBall({ matchId: match1.id, inningsId: inn2.innings.id, runs: 0 });

    // Query stats for Virat
    const stats = await statsEngine.getPlayerStats(p1.id);
    const batting = stats.sports.cricket.batting;

    expect(batting.runs).toBe(16);
    expect(batting.ballsFaced).toBe(6);
    expect(batting.fours).toBe(2);
    expect(batting.sixes).toBe(1);
    expect(batting.highestScore).toBe(16);
    expect(batting.strikeRate).toBe(266.67);
    expect(batting.battingAverage).toBe(16); // 0 dismissals -> average equals runs
    expect(batting.inningsBatted).toBe(1);
  });

  // ── 2. Cricket Bowling Statistics ──────────────────────────────

  it('calculates accurate cricket bowling statistics (overs, wickets, economy, maidens)', async () => {
    const { p1, p2, p3, p4 } = await createPlayersFixture();

    const match = await matchEngine.createMatch({ sport: 'cricket' });
    const withTeams = await matchEngine.createTeams(match.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id, p2.id] },
        { label: 'Team B', player_ids: [p3.id, p4.id] },
      ],
    });
    const teamA = withTeams.teams.find((t) => t.label === 'Team A');
    const teamB = withTeams.teams.find((t) => t.label === 'Team B');
    await matchEngine.startMatch(match.id);

    // Innings 1: Bumrah bowls to Team A: 0, Wicket (p1 out), 4, 1, 1, Wicket (p2 out -> All out)
    const inn = await cricketScorer.initInnings({
      matchId: match.id,
      battingTeamId: teamA.id,
      inningsNumber: 1,
      oversLimit: 1,
      openingBatterId: p1.id,
      openingBowlerId: p3.id, // Bumrah bowling
    });

    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn.innings.id, runs: 0 });
    await cricketScorer.recordBall({
      matchId: match.id,
      inningsId: inn.innings.id,
      runs: 0,
      isWicket: true,
      dismissalType: 'bowled',
      nextBatterId: p2.id,
    });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn.innings.id, runs: 4 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn.innings.id, runs: 1 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn.innings.id, runs: 1 });
    // 2nd wicket -> All out for Team A (6 runs)
    await cricketScorer.recordBall({
      matchId: match.id,
      inningsId: inn.innings.id,
      runs: 0,
      isWicket: true,
      dismissalType: 'caught',
    });

    // Innings 2: Team B chases (Target 7). Bumrah hits 6 + 1 = 7 -> Match completed!
    const inn2 = await cricketScorer.switchInnings({
      matchId: match.id,
      nextBattingTeamId: teamB.id,
      openingBatterId: p3.id,
      openingBowlerId: p1.id,
    });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn2.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn2.innings.id, runs: 1 });

    // Check Bumrah bowling stats
    const stats = await statsEngine.getPlayerStats(p3.id);
    const bowling = stats.sports.cricket.bowling;

    expect(bowling.oversFormatted).toBe('1.0');
    expect(bowling.legalBalls).toBe(6);
    expect(bowling.runsConceded).toBe(6);
    expect(bowling.wickets).toBe(2);
    expect(bowling.economy).toBe(6);
    expect(bowling.bowlingAverage).toBe(3); // 6 runs / 2 wickets = 3.0
  });

  // ── 3. Volleyball & Badminton Records ──────────────────────────

  it('calculates volleyball and badminton win/loss records and percentages', async () => {
    const { p1, p3 } = await createPlayersFixture();

    // Volleyball Match: Team A wins
    const m1 = await matchEngine.createMatch({ sport: 'volleyball' });
    const t1 = await matchEngine.createTeams(m1.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id] },
        { label: 'Team B', player_ids: [p3.id] },
      ],
    });
    const teamA1 = t1.teams.find((t) => t.label === 'Team A');
    await matchEngine.startMatch(m1.id);
    await matchEngine.enterResult(m1.id, {
      team_a_score: 25,
      team_b_score: 18,
      winning_team_id: teamA1.id,
    });
    await matchEngine.endMatch(m1.id, { reason: 'completed' });

    // Badminton Match: Team B wins
    const m2 = await matchEngine.createMatch({ sport: 'badminton' });
    const t2 = await matchEngine.createTeams(m2.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id] },
        { label: 'Team B', player_ids: [p3.id] },
      ],
    });
    const teamB2 = t2.teams.find((t) => t.label === 'Team B');
    await matchEngine.startMatch(m2.id);
    await matchEngine.enterResult(m2.id, {
      team_a_score: 19,
      team_b_score: 21,
      winning_team_id: teamB2.id,
    });
    await matchEngine.endMatch(m2.id, { reason: 'completed' });

    const p1Stats = await statsEngine.getPlayerStats(p1.id);
    expect(p1Stats.sports.volleyball.matches).toBe(1);
    expect(p1Stats.sports.volleyball.wins).toBe(1);
    expect(p1Stats.sports.volleyball.winPercentage).toBe(100);

    expect(p1Stats.sports.badminton.matches).toBe(1);
    expect(p1Stats.sports.badminton.losses).toBe(1);
    expect(p1Stats.sports.badminton.winPercentage).toBe(0);

    expect(p1Stats.totalMatches).toBe(2);
    expect(p1Stats.totalWins).toBe(1);
    expect(p1Stats.winPercentage).toBe(50);
  });

  // ── 4. Active & Best Win Streak Calculations ───────────────────

  it('accurately calculates active win/loss streaks and best career win streaks', () => {
    // 3 wins, 1 loss, 2 wins -> Active streak: 2W, Best streak: 3W
    const history1 = ['won', 'won', 'won', 'lost', 'won', 'won'];
    const s1 = statsEngine.calculateStreaks(history1);
    expect(s1.currentStreakDisplay).toBe('2W');
    expect(s1.currentStreakType).toBe('W');
    expect(s1.currentStreakCount).toBe(2);
    expect(s1.bestWinStreak).toBe(3);

    // 2 losses at the end -> Active streak: 2L
    const history2 = ['won', 'won', 'lost', 'lost'];
    const s2 = statsEngine.calculateStreaks(history2);
    expect(s2.currentStreakDisplay).toBe('2L');
    expect(s2.currentStreakType).toBe('L');
    expect(s2.currentStreakCount).toBe(2);
    expect(s2.bestWinStreak).toBe(2);

    // Empty history
    const s3 = statsEngine.calculateStreaks([]);
    expect(s3.currentStreakDisplay).toBe('0');
    expect(s3.bestWinStreak).toBe(0);
  });

  // ── 5. Configurable Ranking Rules & Points ─────────────────────

  it('computes ranking points using configurable weights from rankingRules.json', async () => {
    const { p1, p3 } = await createPlayersFixture();

    // 2 matches: 1 win for p1, 1 win for p3
    // Formula for p1: (1 win * 3) + (1 loss * 0) + (2 matches * 0.1) = 3 + 0.2 = 3.2 pts
    const m1 = await matchEngine.createMatch({ sport: 'volleyball' });
    const t1 = await matchEngine.createTeams(m1.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id] },
        { label: 'Team B', player_ids: [p3.id] },
      ],
    });
    const teamA1 = t1.teams.find((t) => t.label === 'Team A');
    await matchEngine.startMatch(m1.id);
    await matchEngine.enterResult(m1.id, {
      team_a_score: 25,
      team_b_score: 20,
      winning_team_id: teamA1.id,
    });
    await matchEngine.endMatch(m1.id, { reason: 'completed' });

    const m2 = await matchEngine.createMatch({ sport: 'volleyball' });
    const t2 = await matchEngine.createTeams(m2.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id] },
        { label: 'Team B', player_ids: [p3.id] },
      ],
    });
    const teamB2 = t2.teams.find((t) => t.label === 'Team B');
    await matchEngine.startMatch(m2.id);
    await matchEngine.enterResult(m2.id, {
      team_a_score: 15,
      team_b_score: 25,
      winning_team_id: teamB2.id,
    });
    await matchEngine.endMatch(m2.id, { reason: 'completed' });

    const p1Stats = await statsEngine.getPlayerStats(p1.id, 'overall', db, rankingRules);
    expect(p1Stats.rankingPoints).toBe(3.2);

    const p3Stats = await statsEngine.getPlayerStats(p3.id, 'overall', db, rankingRules);
    expect(p3Stats.rankingPoints).toBe(3.2);
  });

  // ── 6. Sport-Specific Rankings & Leaderboard ───────────────────

  it('ranks players properly across overall and sport categories', async () => {
    const { p1, p3 } = await createPlayersFixture();

    // Match: p1 (Team A) beats p3 (Team B)
    const m = await matchEngine.createMatch({ sport: 'volleyball' });
    const t = await matchEngine.createTeams(m.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id] },
        { label: 'Team B', player_ids: [p3.id] },
      ],
    });
    const teamA = t.teams.find((tm) => tm.label === 'Team A');
    await matchEngine.startMatch(m.id);
    await matchEngine.enterResult(m.id, {
      team_a_score: 25,
      team_b_score: 20,
      winning_team_id: teamA.id,
    });
    await matchEngine.endMatch(m.id, { reason: 'completed' });

    const overallRankings = await statsEngine.getRankings('overall');
    expect(overallRankings.rankings[0].playerId).toBe(p1.id);
    expect(overallRankings.rankings[0].rank).toBe(1);
    expect(overallRankings.rankings[0].wins).toBe(1);

    const vbRankings = await statsEngine.getRankings('volleyball');
    expect(vbRankings.rankings[0].playerId).toBe(p1.id);
    expect(vbRankings.rankings[0].rank).toBe(1);
  });

  // ── 7. Dynamic Updates & Deletion Reactivity ───────────────────

  it('updates rankings dynamically when matches are completed and rolls back when deleted', async () => {
    const { p1, p3 } = await createPlayersFixture();

    const m = await matchEngine.createMatch({ sport: 'volleyball' });
    const t = await matchEngine.createTeams(m.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id] },
        { label: 'Team B', player_ids: [p3.id] },
      ],
    });
    const teamA = t.teams.find((tm) => tm.label === 'Team A');
    await matchEngine.startMatch(m.id);
    await matchEngine.enterResult(m.id, {
      team_a_score: 25,
      team_b_score: 20,
      winning_team_id: teamA.id,
    });
    await matchEngine.endMatch(m.id, { reason: 'completed' });

    let p1Stats = await statsEngine.getPlayerStats(p1.id);
    expect(p1Stats.totalWins).toBe(1);

    // Delete the match
    await matchEngine.deleteMatch(m.id);

    p1Stats = await statsEngine.getPlayerStats(p1.id);
    expect(p1Stats.totalWins).toBe(0);
    expect(p1Stats.totalMatches).toBe(0);
    expect(p1Stats.rankingPoints).toBe(0);
  });

  // ── 8. Error Handling ──────────────────────────────────────────

  it('throws PlayerNotFoundError on querying non-existent player', async () => {
    await expect(statsEngine.getPlayerStats('invalid-player-id')).rejects.toThrow(
      PlayerNotFoundError
    );
  });
});
