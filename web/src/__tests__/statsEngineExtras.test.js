import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/db';
import { playerService } from '../services/playerService';
import * as matchEngine from '../engines/matchEngine';
import * as cricketScorer from '../engines/cricketScorer';
import * as statsEngine from '../engines/statsEngine';

describe('Colony-Wide Dynamic Stats Engine (getColonyInterestingStats)', () => {
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

  it('returns clean empty states when no completed matches exist', async () => {
    await playerService.create('Rahul');
    await playerService.create('Vedant');

    const stats = await statsEngine.getColonyInterestingStats();
    expect(stats.summary.totalCompletedMatches).toBe(0);
    expect(stats.summary.totalPlayers).toBe(2);
    expect(stats.mostWins.leader).toBeNull();
    expect(stats.bestWinPercentage.leader).toBeNull();
    expect(stats.longestStreak.leader).toBeNull();
    expect(stats.mostMatches.leader).toBeNull();
    expect(stats.mostRuns.leader).toBeNull();
    expect(stats.mostWickets.leader).toBeNull();
    expect(stats.bestTeamCombination.leader).toBeNull();
    expect(stats.bestPlayerPair.leader).toBeNull();
    expect(stats.unluckiestPlayer.leader).toBeNull();
    expect(stats.sports.cricket.matches).toBe(0);
    expect(stats.sports.volleyball.matches).toBe(0);
    expect(stats.sports.badminton.matches).toBe(0);
  });

  it('correctly calculates colony leaders across all categories and pair synergies', async () => {
    const rahul = await playerService.create('Rahul');
    const vedant = await playerService.create('Vedant');
    const amit = await playerService.create('Amit');
    const priya = await playerService.create('Priya');

    // ── Match 1: Cricket (Limited Overs) ──
    // Team A: Rahul + Vedant vs Team B: Amit + Priya
    // Team A wins!
    const m1 = await matchEngine.createMatch({ sport: 'cricket', cricket_format: 'limited_overs' });
    const t1 = await matchEngine.createTeams(m1.id, {
      teams: [
        { label: 'Team A', player_ids: [rahul.id, vedant.id] },
        { label: 'Team B', player_ids: [amit.id, priya.id] },
      ],
    });
    const t1A = t1.teams.find((t) => t.label === 'Team A');
    const t1B = t1.teams.find((t) => t.label === 'Team B');
    await matchEngine.startMatch(m1.id);

    // Innings 1: Team A bats. Rahul scores 24 runs (6, 6, 6, 6)
    const inn1 = await cricketScorer.initInnings({
      matchId: m1.id,
      battingTeamId: t1A.id,
      inningsNumber: 1,
      oversLimit: 1,
      openingBatterId: rahul.id,
      openingBowlerId: amit.id,
    });
    await cricketScorer.recordBall({ matchId: m1.id, inningsId: inn1.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: m1.id, inningsId: inn1.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: m1.id, inningsId: inn1.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: m1.id, inningsId: inn1.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: m1.id, inningsId: inn1.innings.id, runs: 0 });
    await cricketScorer.recordBall({ matchId: m1.id, inningsId: inn1.innings.id, runs: 0 });

    // Innings 2: Team B chases. Vedant bowls and takes 2 wickets!
    const inn2 = await cricketScorer.switchInnings({
      matchId: m1.id,
      nextBattingTeamId: t1B.id,
      openingBatterId: amit.id,
      openingBowlerId: vedant.id,
    });
    await cricketScorer.recordBall({ matchId: m1.id, inningsId: inn2.innings.id, runs: 2 });
    await cricketScorer.recordBall({
      matchId: m1.id,
      inningsId: inn2.innings.id,
      runs: 0,
      isWicket: true,
      dismissalType: 'bowled',
      nextBatterId: priya.id,
    });
    await cricketScorer.recordBall({
      matchId: m1.id,
      inningsId: inn2.innings.id,
      runs: 0,
      isWicket: true,
      dismissalType: 'caught',
    }); // All out -> Team A wins!

    // ── Match 2: Volleyball ──
    // Team A: Rahul + Vedant vs Team B: Amit + Priya
    // Team A wins!
    const m2 = await matchEngine.createMatch({ sport: 'volleyball' });
    const t2 = await matchEngine.createTeams(m2.id, {
      teams: [
        { label: 'Team A', player_ids: [rahul.id, vedant.id] },
        { label: 'Team B', player_ids: [amit.id, priya.id] },
      ],
    });
    const t2A = t2.teams.find((t) => t.label === 'Team A');
    await matchEngine.startMatch(m2.id);
    await matchEngine.enterResult(m2.id, {
      team_a_score: 25,
      team_b_score: 18,
      winning_team_id: t2A.id,
    });
    await matchEngine.endMatch(m2.id, { reason: 'completed' });

    // ── Match 3: Badminton ──
    // Team A: Rahul + Vedant vs Team B: Amit + Priya
    // Team A wins!
    const m3 = await matchEngine.createMatch({ sport: 'badminton' });
    const t3 = await matchEngine.createTeams(m3.id, {
      teams: [
        { label: 'Team A', player_ids: [rahul.id, vedant.id] },
        { label: 'Team B', player_ids: [amit.id, priya.id] },
      ],
    });
    const t3A = t3.teams.find((t) => t.label === 'Team A');
    await matchEngine.startMatch(m3.id);
    await matchEngine.enterResult(m3.id, {
      team_a_score: 21,
      team_b_score: 19,
      winning_team_id: t3A.id,
    });
    await matchEngine.endMatch(m3.id, { reason: 'completed' });

    // ── Execute Stats Calculation ──
    const stats = await statsEngine.getColonyInterestingStats();

    // Summary assertions
    expect(stats.summary.totalCompletedMatches).toBe(3);
    expect(stats.summary.sportBreakdown.cricket).toBe(1);
    expect(stats.summary.sportBreakdown.volleyball).toBe(1);
    expect(stats.summary.sportBreakdown.badminton).toBe(1);

    // 1. Most Matches Won: Rahul and Vedant tied at 3 wins
    expect(stats.mostWins.leader.wins).toBe(3);
    expect(['Rahul', 'Vedant']).toContain(stats.mostWins.leader.player.name);

    // 2. Best Win Percentage (Threshold min 3 matches): 100%
    expect(stats.bestWinPercentage.leader.winPercentage).toBe(100);
    expect(stats.bestWinPercentage.minMatchesThreshold).toBe(3);

    // 3. Longest Winning Streak: 3 matches
    expect(stats.longestStreak.leader.streaks.bestWinStreak).toBe(3);

    // 4. Most Matches Played: all 4 players played 3 matches
    expect(stats.mostMatches.leader.matches).toBe(3);

    // 5. Most Runs: Rahul (24 runs)
    expect(stats.mostRuns.leader.player.id).toBe(rahul.id);
    expect(stats.mostRuns.leader.runs).toBe(24);

    // 6. Most Wickets: Vedant (2 wickets)
    expect(stats.mostWickets.leader.player.id).toBe(vedant.id);
    expect(stats.mostWickets.leader.wickets).toBe(2);

    // 7. Most Successful Player Pair: Rahul & Vedant (3 wins together)
    expect(stats.bestPlayerPair.leader).not.toBeNull();
    expect(stats.bestPlayerPair.leader.winsTogether).toBe(3);
    expect(stats.bestPlayerPair.leader.winRate).toBe(100);
    expect(stats.bestPlayerPair.insight).toMatch(/are the deadliest duo 🔥/);
    expect(stats.bestPlayerPair.insight).toContain('Rahul');
    expect(stats.bestPlayerPair.insight).toContain('Vedant');
    expect(stats.bestPlayerPair.insight).toContain('3 wins together');

    // 8. Best Team Combination: [Rahul, Vedant] (3 matches, 3 wins, 100% win rate)
    expect(stats.bestTeamCombination.leader).not.toBeNull();
    expect(stats.bestTeamCombination.leader.wins).toBe(3);
    expect(stats.bestTeamCombination.leader.winRate).toBe(100);

    // 9. Unluckiest Player: Amit & Priya with 3 losses
    expect(stats.unluckiestPlayer.leader.losses).toBe(3);
    expect(['Amit', 'Priya']).toContain(stats.unluckiestPlayer.leader.player.name);

    // 10. Sport-wise stats
    expect(stats.sports.cricket.matches).toBe(1);
    expect(stats.sports.cricket.topBatter.player.id).toBe(rahul.id);
    expect(stats.sports.cricket.topBowler.player.id).toBe(vedant.id);
    expect(stats.sports.cricket.highestIndividualScore.runs).toBe(24);

    expect(stats.sports.volleyball.matches).toBe(1);
    expect(stats.sports.volleyball.topWinner.wins).toBe(1);

    expect(stats.sports.badminton.matches).toBe(1);
    expect(stats.sports.badminton.topWinner.wins).toBe(1);
  });
});
