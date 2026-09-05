import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../db/db';
import { playerService } from '../services/playerService';
import * as matchEngine from '../engines/matchEngine';
import * as backupEngine from '../engines/backupEngine';
import * as fileExportService from '../services/fileExportService';
import { generateScoreboardCanvas, downloadScoreboardImage } from '../services/scoreboardGenerator';

describe('Export & Download Engine (Scorecards, Backups & Position Matches)', () => {
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

  async function seedDatabaseWithPositionMatch() {
    const p1 = await playerService.create('Alice');
    const p2 = await playerService.create('Bob');
    const p3 = await playerService.create('Charlie');

    const match = await matchEngine.createPositionMatch({
      rankings: [
        { player_id: p1.id, position: 1 },
        { player_id: p2.id, position: 2 },
        { player_id: p3.id, position: 3 },
      ],
      match_date: '2026-09-05',
    });

    return { p1, p2, p3, match };
  }

  it('exports database backup containing position matches and validates JSON structure', async () => {
    const { p1, match } = await seedDatabaseWithPositionMatch();

    const backup = await backupEngine.exportBackup();
    expect(backup).toBeDefined();
    expect(backup._format).toBe('mandir11_backup');
    expect(backup.version).toBe(1);
    expect(backup.data.players.length).toBeGreaterThanOrEqual(3);
    expect(backup.data.matches.some((m) => m.id === match.id && m.sport === 'position')).toBe(true);

    const matchResult = backup.data.match_results.find((r) => r.match_id === match.id);
    expect(matchResult).toBeDefined();
    expect(matchResult.rankings).toHaveLength(3);
    expect(matchResult.rankings[0].player_id).toBe(p1.id);
    expect(matchResult.rankings[0].position).toBe(1);
    expect(matchResult.rankings[0].points).toBe(3);
  });

  it('restores backup with position matches into an empty database', async () => {
    const { match } = await seedDatabaseWithPositionMatch();
    const backup = await backupEngine.exportBackup();

    // Clear everything
    await db.players.clear();
    await db.matches.clear();
    await db.match_results.clear();

    expect(await db.matches.count()).toBe(0);

    // Restore from exported backup object
    const restoreResult = await backupEngine.importBackup(backup, db);
    expect(restoreResult.success).toBe(true);

    const restoredMatch = await db.matches.get(match.id);
    expect(restoredMatch).toBeDefined();
    expect(restoredMatch.sport).toBe('position');

    const restoredResult = await db.match_results.where('match_id').equals(match.id).first();
    expect(restoredResult).toBeDefined();
    expect(restoredResult.rankings).toHaveLength(3);
  });

  it('renders a scoreboard canvas for a Position Match without errors', async () => {
    const { p1, p2, p3, match } = await seedDatabaseWithPositionMatch();

    const canvas = generateScoreboardCanvas({
      match,
      scorecard: null,
      settlement: null,
      allPlayers: [p1, p2, p3],
    });

    expect(canvas).toBeDefined();
    expect(canvas.width).toBe(1080);
    expect(canvas.height).toBe(1350);
  });

  it('downloads scoreboard image via exportImageFile with safe async resolution', async () => {
    const { p1, p2, p3, match } = await seedDatabaseWithPositionMatch();

    const result = await downloadScoreboardImage({
      match,
      scorecard: null,
      settlement: null,
      allPlayers: [p1, p2, p3],
      filename: 'test_scorecard.png',
    });
    expect(result.success).toBe(true);
    expect(result.filename).toMatch(/mandir11_position_/);
  });

  it('downloads backup file via exportTextFile and handles file export safely', async () => {
    const exportSpy = vi.spyOn(fileExportService, 'exportTextFile').mockResolvedValue({
      success: true,
      filename: 'backup.json',
      mode: 'browser_download',
    });

    const result = await backupEngine.downloadBackupFile();
    expect(exportSpy).toHaveBeenCalledTimes(1);
    expect(result.filename).toBeDefined();
    expect(result.backup).toBeDefined();

    exportSpy.mockRestore();
  });
});
