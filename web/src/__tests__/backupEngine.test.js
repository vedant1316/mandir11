import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/db';
import { playerService } from '../services/playerService';
import * as matchEngine from '../engines/matchEngine';
import * as cricketScorer from '../engines/cricketScorer';
import * as ledgerEngine from '../engines/ledgerEngine';
import * as tournamentEngine from '../engines/tournamentEngine';
import * as statsEngine from '../engines/statsEngine';
import * as backupEngine from '../engines/backupEngine';
import { BackupValidationError } from '../engines/errors';

describe('BackupEngine (Export, Import, Validation, Reset)', () => {
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
    await db.tournaments.clear();
    await db.fixtures.clear();
    await db.ledger_payments.clear();
    await db.debt_adjustments.clear();
  });

  async function seedCompleteDatabase() {
    const p1 = await playerService.create('Virat');
    const p2 = await playerService.create('Rohit');
    const p3 = await playerService.create('Bumrah');
    const p4 = await playerService.create('Shami');

    // 1. Cricket Match with balls
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
      oversLimit: 1,
      openingBatterId: p1.id,
      openingBowlerId: p3.id,
    });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn.innings.id, runs: 6 });
    await cricketScorer.recordBall({ matchId: match.id, inningsId: inn.innings.id, runs: 4 });

    // 2. Ledger Entries & Settlement Payments
    await ledgerEngine.setMatchLedger(match.id, [
      { player_a_id: p1.id, player_b_id: p3.id, amount: 100 },
    ]);
    await ledgerEngine.recordPayment({
      matchId: match.id,
      fromPlayerId: p1.id,
      toPlayerId: p3.id,
      amount: 50,
      note: 'Partial cash payment',
    });

    // 3. Tournament & Fixtures
    const tournament = await tournamentEngine.createTournament({
      name: 'Colony Cup 2026',
      sport: 'volleyball',
      format: 'knockout',
      teams: [
        { name: 'Team 1', player_ids: [p1.id] },
        { name: 'Team 2', player_ids: [p2.id] },
      ],
    });

    return { p1, p2, p3, p4, match, tournament };
  }

  // ── 1. Exporting Backup ────────────────────────────────────────

  it('exports a complete valid backup structure containing all 13 IndexedDB stores', async () => {
    await seedCompleteDatabase();

    const backup = await backupEngine.exportBackup();

    expect(backup._format).toBe('mandir11_backup');
    expect(backup.version).toBe(1);
    expect(backup.app).toBe('Mandir 11');
    expect(backup.exported_at).toBeDefined();

    // Verify all 13 stores exist in backup.data
    expect(backup.data.players.length).toBe(4);
    expect(backup.data.matches.length).toBe(1);
    expect(backup.data.teams.length).toBe(2);
    expect(backup.data.team_players.length).toBe(4);
    expect(backup.data.innings.length).toBe(1);
    expect(backup.data.overs.length).toBe(1);
    expect(backup.data.balls.length).toBe(2);
    expect(backup.data.ledger_entries.length).toBe(1);
    expect(backup.data.tournaments.length).toBe(1);
    expect(backup.data.fixtures.length).toBe(1);
    expect(backup.data.ledger_payments.length).toBe(1);
    expect(backup.data.debt_adjustments.length).toBe(0);

    // Metadata
    expect(backup.metadata.players_count).toBe(4);
    expect(backup.metadata.matches_count).toBe(1);
    expect(backup.metadata.tournaments_count).toBe(1);
    expect(backup.metadata.ledger_payments_count).toBe(1);
  });

  // ── 2. Backup Validation ───────────────────────────────────────

  it('validates correct backups and rejects corrupt or incompatible formats', async () => {
    await seedCompleteDatabase();
    const validBackup = await backupEngine.exportBackup();

    // Valid
    const res = backupEngine.validateBackup(validBackup);
    expect(res.valid).toBe(true);
    expect(res.counts.players).toBe(4);

    // Invalid format identifier
    expect(() =>
      backupEngine.validateBackup({ ...validBackup, _format: 'unknown_app' })
    ).toThrow(BackupValidationError);

    // Invalid version
    expect(() =>
      backupEngine.validateBackup({ ...validBackup, version: 99 })
    ).toThrow(BackupValidationError);

    // Missing store in data
    const brokenData = { ...validBackup.data };
    delete brokenData.players;
    expect(() =>
      backupEngine.validateBackup({ ...validBackup, data: brokenData })
    ).toThrow(BackupValidationError);

    // Null or string
    expect(() => backupEngine.validateBackup(null)).toThrow(BackupValidationError);
    expect(() => backupEngine.validateBackup('not-an-object')).toThrow(BackupValidationError);
  });

  // ── 3. Restoring Backup into Clean Database ────────────────────

  it('restores all records accurately from a backup into an empty database', async () => {
    const { p1 } = await seedCompleteDatabase();
    const backup = await backupEngine.exportBackup();

    // Clear everything
    await backupEngine.resetDatabase();
    expect(await db.players.count()).toBe(0);
    expect(await db.matches.count()).toBe(0);

    // Import backup
    const importRes = await backupEngine.importBackup(backup);
    expect(importRes.success).toBe(true);
    expect(importRes.restoredCounts.players).toBe(4);

    // Verify restored records
    const restoredPlayers = await db.players.toArray();
    expect(restoredPlayers.length).toBe(4);
    expect(restoredPlayers.map((p) => p.name)).toContain('Virat');

    const restoredBalls = await db.balls.toArray();
    expect(restoredBalls.length).toBe(2);

    const restoredTournaments = await db.tournaments.toArray();
    expect(restoredTournaments.length).toBe(1);
    expect(restoredTournaments[0].name).toBe('Colony Cup 2026');

    const restoredPayments = await db.ledger_payments.toArray();
    expect(restoredPayments.length).toBe(1);
    expect(restoredPayments[0].amount).toBe(50);
  });

  // ── 4. Overwrite Restore (Atomicity) ───────────────────────────

  it('completely overwrites existing database data without residual records', async () => {
    // 1. Seed Dataset A
    await seedCompleteDatabase();
    const backupA = await backupEngine.exportBackup();

    // 2. Clear and Seed Dataset B (Different player only)
    await backupEngine.resetDatabase();
    await playerService.create('Unique Player B');
    expect((await db.players.toArray()).map((p) => p.name)).toEqual(['Unique Player B']);

    // 3. Restore Dataset A
    await backupEngine.importBackup(backupA);

    // Unique Player B should not exist anymore
    const allPlayers = await db.players.toArray();
    expect(allPlayers.length).toBe(4);
    expect(allPlayers.map((p) => p.name)).not.toContain('Unique Player B');
    expect(allPlayers.map((p) => p.name)).toContain('Virat');
  });

  // ── 5. Feature Continuity After Restore ────────────────────────

  it('ensures stats, scoring, and tournaments continue functioning after restore', async () => {
    const { p1, match } = await seedCompleteDatabase();
    const backup = await backupEngine.exportBackup();

    // Reset and restore
    await backupEngine.resetDatabase();
    await backupEngine.importBackup(backup);

    // Verify cricket scorer can continue scoring on restored match
    const innings = await db.innings.where('match_id').equals(match.id).first();
    const updatedState = await cricketScorer.recordBall({
      matchId: match.id,
      inningsId: innings.id,
      runs: 1,
    });
    expect(updatedState.innings.total_runs).toBe(11); // 6 + 4 + 1 = 11 runs

    // Verify balls are recorded in database
    const allBalls = await db.balls.where('innings_id').equals(innings.id).toArray();
    expect(allBalls.length).toBe(3);
  });

  // ── 6. Reset Database ──────────────────────────────────────────

  it('permanently clears all 13 database stores on resetDatabase', async () => {
    await seedCompleteDatabase();

    const res = await backupEngine.resetDatabase();
    expect(res.success).toBe(true);

    expect(await db.players.count()).toBe(0);
    expect(await db.matches.count()).toBe(0);
    expect(await db.teams.count()).toBe(0);
    expect(await db.team_players.count()).toBe(0);
    expect(await db.match_results.count()).toBe(0);
    expect(await db.innings.count()).toBe(0);
    expect(await db.overs.count()).toBe(0);
    expect(await db.balls.count()).toBe(0);
    expect(await db.ledger_entries.count()).toBe(0);
    expect(await db.tournaments.count()).toBe(0);
    expect(await db.fixtures.count()).toBe(0);
    expect(await db.ledger_payments.count()).toBe(0);
    expect(await db.debt_adjustments.count()).toBe(0);
  });

  // ── 7. Backward-Compatible Restore for Earlier Backups ────────

  it('gracefully restores older backups that lack ledger_payments and debt_adjustments', async () => {
    await seedCompleteDatabase();
    const backup = await backupEngine.exportBackup();

    // Simulate an older v1 backup without ledger_payments and debt_adjustments
    delete backup.data.ledger_payments;
    delete backup.data.debt_adjustments;

    await backupEngine.resetDatabase();
    const res = await backupEngine.importBackup(backup);
    expect(res.success).toBe(true);
    expect(await db.players.count()).toBe(4);
    expect(await db.ledger_payments.count()).toBe(0);
  });
});
