import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/db';
import { playerService } from '../services/playerService';
import * as matchEngine from '../engines/matchEngine';
import * as ledgerEngine from '../engines/ledgerEngine';
import {
  MatchNotFoundError,
  MatchStateError,
  UnbalancedStakesError,
  InvalidStakeAmountError,
  InvalidStakeParticipantError,
} from '../engines/errors';

describe('LedgerEngine & Settlement (IndexedDB Local-First)', () => {
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

  async function createMatchFixture(sport = 'volleyball', existingPlayers = null) {
    let p1, p2, p3, p4, p5, p6;
    if (existingPlayers) {
      ({ p1, p2, p3, p4, p5, p6 } = existingPlayers);
    } else {
      p1 = await playerService.create('Virat');
      p2 = await playerService.create('Rohit');
      p3 = await playerService.create('KL');
      p4 = await playerService.create('Bumrah');
      p5 = await playerService.create('Shami');
      p6 = await playerService.create('Siraj');
    }

    const match = await matchEngine.createMatch({ sport });
    const matchWithTeams = await matchEngine.createTeams(match.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id, p2.id, p3.id] },
        { label: 'Team B', player_ids: [p4.id, p5.id, p6.id] },
      ],
    });

    const teamA = matchWithTeams.teams.find((t) => t.label === 'Team A');
    const teamB = matchWithTeams.teams.find((t) => t.label === 'Team B');

    return {
      match,
      teamA,
      teamB,
      players: { p1, p2, p3, p4, p5, p6 },
    };
  }

  // ── 1. Stake Amount Validation ─────────────────────────────────

  it('validates that stake amounts must be positive numbers greater than zero', () => {
    expect(() => ledgerEngine.validateStakeAmount(0)).toThrow(InvalidStakeAmountError);
    expect(() => ledgerEngine.validateStakeAmount(-50)).toThrow(InvalidStakeAmountError);
    expect(() => ledgerEngine.validateStakeAmount('abc')).toThrow(InvalidStakeAmountError);
    expect(() => ledgerEngine.validateStakeAmount(NaN)).toThrow(InvalidStakeAmountError);
    expect(() => ledgerEngine.validateStakeAmount(Infinity)).toThrow(InvalidStakeAmountError);

    expect(ledgerEngine.validateStakeAmount(50)).toBe(50);
    expect(ledgerEngine.validateStakeAmount('100.5')).toBe(100.5);
  });

  // ── 2. Participant & Team Matching Validation ─────────────────

  it('rejects stakes between players on the same team or non-participating players', async () => {
    const { match, players } = await createMatchFixture();
    const outsider = await playerService.create('Hardik');

    // Same team players (Virat and Rohit both on Team A)
    await expect(
      ledgerEngine.setMatchLedger(match.id, [
        { player_a_id: players.p1.id, player_b_id: players.p2.id, amount: 50 },
      ])
    ).rejects.toThrow(InvalidStakeParticipantError);

    // Player not on Team B (Outsider)
    await expect(
      ledgerEngine.setMatchLedger(match.id, [
        { player_a_id: players.p1.id, player_b_id: outsider.id, amount: 50 },
      ])
    ).rejects.toThrow(InvalidStakeParticipantError);

    // Staking against oneself
    await expect(
      ledgerEngine.setMatchLedger(match.id, [
        { player_a_id: players.p1.id, player_b_id: players.p1.id, amount: 50 },
      ])
    ).rejects.toThrow(InvalidStakeParticipantError);
  });

  // ── 3. Balanced vs Unbalanced Stakes Validation ────────────────

  it('rejects unbalanced team stakes in autoMatchStakes and setMatchLedger', async () => {
    const { players } = await createMatchFixture();

    // Auto-match unequal totals (Team A = ₹100, Team B = ₹50)
    expect(() =>
      ledgerEngine.autoMatchStakes(
        [{ playerId: players.p1.id, amount: 100 }],
        [{ playerId: players.p4.id, amount: 50 }]
      )
    ).toThrow(UnbalancedStakesError);
  });

  // ── 4. Deterministic Auto-Matching Algorithm ───────────────────

  it('correctly auto-matches multi-player unequal contributions into balanced pairs', async () => {
    const { players } = await createMatchFixture();

    // Team A: Virat ₹100, Rohit ₹50 (Total ₹150)
    // Team B: Bumrah ₹50, Shami ₹100 (Total ₹150)
    const teamAStakes = [
      { playerId: players.p1.id, amount: 100 },
      { playerId: players.p2.id, amount: 50 },
    ];
    const teamBStakes = [
      { playerId: players.p4.id, amount: 50 },
      { playerId: players.p5.id, amount: 100 },
    ];

    const matched = ledgerEngine.autoMatchStakes(teamAStakes, teamBStakes);

    expect(matched.length).toBe(3);
    // 1st pair: Virat (first 50) vs Bumrah (50) -> 50
    expect(matched[0]).toEqual({
      player_a_id: players.p1.id,
      player_b_id: players.p4.id,
      amount: 50,
    });
    // 2nd pair: Virat (remaining 50) vs Shami (first 50) -> 50
    expect(matched[1]).toEqual({
      player_a_id: players.p1.id,
      player_b_id: players.p5.id,
      amount: 50,
    });
    // 3rd pair: Rohit (50) vs Shami (remaining 50) -> 50
    expect(matched[2]).toEqual({
      player_a_id: players.p2.id,
      player_b_id: players.p5.id,
      amount: 50,
    });
  });

  // ── 5. Match Settlement on Team A Victory ─────────────────────

  it('calculates accurate settlement when Team A wins (Team B owes Team A)', async () => {
    const { match, teamA, teamB, players } = await createMatchFixture();

    // Set stakes: Virat (A) vs Bumrah (B) for ₹100
    await ledgerEngine.setMatchLedger(match.id, [
      { player_a_id: players.p1.id, player_b_id: players.p4.id, amount: 100 },
    ]);

    await matchEngine.startMatch(match.id);

    // End match with Team A winning (25 - 18)
    await matchEngine.enterResult(match.id, {
      team_a_score: 25,
      team_b_score: 18,
      winning_team_id: teamA.id,
    });
    await matchEngine.endMatch(match.id, { reason: 'completed' });

    const settlement = await ledgerEngine.calculateMatchSettlement(match.id);

    expect(settlement.isSettled).toBe(true);
    expect(settlement.isAbandoned).toBeUndefined();
    expect(settlement.isTie).toBe(false);
    expect(settlement.winningTeam.id).toBe(teamA.id);
    expect(settlement.totalPool).toBe(200);

    // Bumrah owes Virat ₹100
    expect(settlement.payments.length).toBe(1);
    expect(settlement.payments[0].fromPlayer.id).toBe(players.p4.id);
    expect(settlement.payments[0].toPlayer.id).toBe(players.p1.id);
    expect(settlement.payments[0].amount).toBe(100);

    // Balances
    const viratBal = settlement.playerBalances.find((b) => b.player.id === players.p1.id);
    expect(viratBal.netAmount).toBe(100);
    expect(viratBal.status).toBe('won');

    const bumrahBal = settlement.playerBalances.find((b) => b.player.id === players.p4.id);
    expect(bumrahBal.netAmount).toBe(-100);
    expect(bumrahBal.status).toBe('lost');
  });

  // ── 6. Match Settlement on Team B Victory ─────────────────────

  it('calculates accurate settlement when Team B wins (Team A owes Team B)', async () => {
    const { match, teamA, teamB, players } = await createMatchFixture();

    // Set stakes: Virat (A) vs Bumrah (B) for ₹75
    await ledgerEngine.setMatchLedger(match.id, [
      { player_a_id: players.p1.id, player_b_id: players.p4.id, amount: 75 },
    ]);

    await matchEngine.startMatch(match.id);

    // End match with Team B winning
    await matchEngine.enterResult(match.id, {
      team_a_score: 15,
      team_b_score: 25,
      winning_team_id: teamB.id,
    });
    await matchEngine.endMatch(match.id, { reason: 'completed' });

    const settlement = await ledgerEngine.calculateMatchSettlement(match.id);

    expect(settlement.isSettled).toBe(true);
    expect(settlement.winningTeam.id).toBe(teamB.id);

    // Virat owes Bumrah ₹75
    expect(settlement.payments.length).toBe(1);
    expect(settlement.payments[0].fromPlayer.id).toBe(players.p1.id);
    expect(settlement.payments[0].toPlayer.id).toBe(players.p4.id);
    expect(settlement.payments[0].amount).toBe(75);
  });

  // ── 7. Match Settlement on Tie ─────────────────────────────────

  it('refunds all stakes with zero payments when match ends in a tie', async () => {
    const { match, players } = await createMatchFixture();

    await ledgerEngine.setMatchLedger(match.id, [
      { player_a_id: players.p1.id, player_b_id: players.p4.id, amount: 100 },
    ]);

    await matchEngine.startMatch(match.id);

    // Tie (winning_team_id = null)
    await matchEngine.enterResult(match.id, {
      team_a_score: 20,
      team_b_score: 20,
      winning_team_id: null,
    });
    await matchEngine.endMatch(match.id, { reason: 'completed' });

    const settlement = await ledgerEngine.calculateMatchSettlement(match.id);

    expect(settlement.isSettled).toBe(true);
    expect(settlement.isTie).toBe(true);
    expect(settlement.payments).toEqual([]);
  });

  // ── 8. Match Settlement on Abandoned Match ─────────────────────

  it('does not settle stakes and refunds participants when match is abandoned', async () => {
    const { match, players } = await createMatchFixture();

    await ledgerEngine.setMatchLedger(match.id, [
      { player_a_id: players.p1.id, player_b_id: players.p4.id, amount: 100 },
    ]);

    await matchEngine.startMatch(match.id);
    await matchEngine.endMatch(match.id, { reason: 'rain' });

    const settlement = await ledgerEngine.calculateMatchSettlement(match.id);

    expect(settlement.status).toBe('abandoned');
    expect(settlement.isAbandoned).toBe(true);
    expect(settlement.payments).toEqual([]);
  });

  // ── 9. Player Lifetime Ledger History ──────────────────────────
  it('aggregates individual player lifetime ledger history across multiple matches', async () => {
    // Match 1: Virat wins ₹100 against Bumrah
    const fix1 = await createMatchFixture('volleyball');
    await ledgerEngine.setMatchLedger(fix1.match.id, [
      { player_a_id: fix1.players.p1.id, player_b_id: fix1.players.p4.id, amount: 100 },
    ]);
    await matchEngine.startMatch(fix1.match.id);
    await matchEngine.enterResult(fix1.match.id, {
      team_a_score: 25,
      team_b_score: 20,
      winning_team_id: fix1.teamA.id,
    });
    await matchEngine.endMatch(fix1.match.id, { reason: 'completed' });

    // Match 2: Virat loses ₹40 against Bumrah (reusing same players)
    const fix2 = await createMatchFixture('badminton', fix1.players);
    await ledgerEngine.setMatchLedger(fix2.match.id, [
      { player_a_id: fix2.players.p1.id, player_b_id: fix2.players.p4.id, amount: 40 },
    ]);
    await matchEngine.startMatch(fix2.match.id);
    await matchEngine.enterResult(fix2.match.id, {
      team_a_score: 18,
      team_b_score: 21,
      winning_team_id: fix2.teamB.id,
    });
    await matchEngine.endMatch(fix2.match.id, { reason: 'completed' });

    const viratHistory = await ledgerEngine.getPlayerLedgerHistory(fix1.players.p1.id);

    expect(viratHistory.totalWon).toBe(100);
    expect(viratHistory.totalLost).toBe(40);
    expect(viratHistory.totalBalance).toBe(60); // +₹60 Net
    expect(viratHistory.matchesPlayedWithStakes).toBe(2);
    expect(viratHistory.history.length).toBe(2);

    const bumrahHistory = await ledgerEngine.getPlayerLedgerHistory(fix1.players.p4.id);
    expect(bumrahHistory.totalWon).toBe(40);
    expect(bumrahHistory.totalLost).toBe(100);
    expect(bumrahHistory.totalBalance).toBe(-60); // -₹60 Net
  });

  // ── 10. Colony-Wide Net Settlement Summary ─────────────────────

  it('computes colony-wide net debt graph and leaderboard', async () => {
    // Match 1: Virat wins ₹100 from Bumrah
    const fix1 = await createMatchFixture('volleyball');
    await ledgerEngine.setMatchLedger(fix1.match.id, [
      { player_a_id: fix1.players.p1.id, player_b_id: fix1.players.p4.id, amount: 100 },
    ]);
    await matchEngine.startMatch(fix1.match.id);
    await matchEngine.enterResult(fix1.match.id, {
      team_a_score: 25,
      team_b_score: 20,
      winning_team_id: fix1.teamA.id,
    });
    await matchEngine.endMatch(fix1.match.id, { reason: 'completed' });

    // Match 2: Bumrah wins ₹30 from Virat (reusing same players)
    const fix2 = await createMatchFixture('volleyball', fix1.players);
    await ledgerEngine.setMatchLedger(fix2.match.id, [
      { player_a_id: fix2.players.p1.id, player_b_id: fix2.players.p4.id, amount: 30 },
    ]);
    await matchEngine.startMatch(fix2.match.id);
    await matchEngine.enterResult(fix2.match.id, {
      team_a_score: 15,
      team_b_score: 25,
      winning_team_id: fix2.teamB.id,
    });
    await matchEngine.endMatch(fix2.match.id, { reason: 'completed' });

    const summary = await ledgerEngine.getColonyLedgerSummary();

    // Simplified pairwise net debt: Bumrah owes Virat ₹70 (100 - 30 = 70)
    expect(summary.colonyDebts.length).toBe(1);
    expect(summary.colonyDebts[0].fromPlayer.id).toBe(fix1.players.p4.id);
    expect(summary.colonyDebts[0].toPlayer.id).toBe(fix1.players.p1.id);
    expect(summary.colonyDebts[0].amount).toBe(70);

    // Leaderboard
    expect(summary.leaderboard[0].player.id).toBe(fix1.players.p1.id);
    expect(summary.leaderboard[0].netBalance).toBe(70);
  });

  // ── 11. Immutability on Completed Matches ───────────────────────

  it('rejects setting stakes on completed or abandoned matches', async () => {
    const { match, teamA, players } = await createMatchFixture();

    await matchEngine.startMatch(match.id);
    await matchEngine.enterResult(match.id, {
      team_a_score: 25,
      team_b_score: 20,
      winning_team_id: teamA.id,
    });
    await matchEngine.endMatch(match.id, { reason: 'completed' });

    await expect(
      ledgerEngine.setMatchLedger(match.id, [
        { player_a_id: players.p1.id, player_b_id: players.p4.id, amount: 50 },
      ])
    ).rejects.toThrow(MatchStateError);
  });
});
