import { db as defaultDb } from '../db/db';
import { BackupValidationError } from './errors';

export const CURRENT_BACKUP_VERSION = 1;
export const BACKUP_FORMAT_IDENTIFIER = 'mandir11_backup';

const STORE_NAMES = [
  'players',
  'matches',
  'teams',
  'team_players',
  'match_results',
  'innings',
  'overs',
  'balls',
  'ledger_entries',
  'tournaments',
  'fixtures',
];

/**
 * Exports all Mandir 11 IndexedDB data into a structured JSON backup object
 */
export async function exportBackup(db = defaultDb) {
  const [
    players,
    matches,
    teams,
    team_players,
    match_results,
    innings,
    overs,
    balls,
    ledger_entries,
    tournaments,
    fixtures,
  ] = await Promise.all([
    db.players.toArray(),
    db.matches.toArray(),
    db.teams.toArray(),
    db.team_players.toArray(),
    db.match_results.toArray(),
    db.innings.toArray(),
    db.overs.toArray(),
    db.balls.toArray(),
    db.ledger_entries.toArray(),
    db.tournaments.toArray(),
    db.fixtures.toArray(),
  ]);

  const timestamp = new Date().toISOString();

  return {
    _format: BACKUP_FORMAT_IDENTIFIER,
    version: CURRENT_BACKUP_VERSION,
    exported_at: timestamp,
    app: 'Mandir 11',
    metadata: {
      players_count: players.length,
      matches_count: matches.length,
      tournaments_count: tournaments.length,
      ledger_entries_count: ledger_entries.length,
      balls_count: balls.length,
    },
    data: {
      players,
      matches,
      teams,
      team_players,
      match_results,
      innings,
      overs,
      balls,
      ledger_entries,
      tournaments,
      fixtures,
    },
  };
}

/**
 * Validates a parsed backup object structure and version
 */
export function validateBackup(backup) {
  if (!backup || typeof backup !== 'object') {
    throw new BackupValidationError('Backup data must be a valid JSON object.');
  }

  if (backup._format !== BACKUP_FORMAT_IDENTIFIER) {
    throw new BackupValidationError(
      `Invalid backup format '${backup._format || 'unknown'}'. Expected '${BACKUP_FORMAT_IDENTIFIER}'.`
    );
  }

  if (backup.version !== CURRENT_BACKUP_VERSION) {
    throw new BackupValidationError(
      `Unsupported backup version '${backup.version}'. Expected version ${CURRENT_BACKUP_VERSION}.`
    );
  }

  if (!backup.data || typeof backup.data !== 'object') {
    throw new BackupValidationError("Backup is missing the required 'data' object.");
  }

  for (const store of STORE_NAMES) {
    if (!Array.isArray(backup.data[store])) {
      throw new BackupValidationError(`Backup data is missing array for store '${store}'.`);
    }
  }

  return {
    valid: true,
    exported_at: backup.exported_at,
    counts: {
      players: backup.data.players.length,
      matches: backup.data.matches.length,
      tournaments: backup.data.tournaments.length,
      ledger_entries: backup.data.ledger_entries.length,
      balls: backup.data.balls.length,
    },
  };
}

/**
 * Restores all database stores from a validated backup in an atomic Dexie transaction
 */
export async function importBackup(backup, db = defaultDb) {
  const validation = validateBackup(backup);

  await db.transaction(
    'rw',
    [
      db.players,
      db.matches,
      db.teams,
      db.team_players,
      db.match_results,
      db.innings,
      db.overs,
      db.balls,
      db.ledger_entries,
      db.tournaments,
      db.fixtures,
    ],
    async () => {
      // 1. Clear all existing stores
      await Promise.all([
        db.players.clear(),
        db.matches.clear(),
        db.teams.clear(),
        db.team_players.clear(),
        db.match_results.clear(),
        db.innings.clear(),
        db.overs.clear(),
        db.balls.clear(),
        db.ledger_entries.clear(),
        db.tournaments.clear(),
        db.fixtures.clear(),
      ]);

      // 2. Populate stores with backup data
      const data = backup.data;
      if (data.players.length > 0) await db.players.bulkAdd(data.players);
      if (data.matches.length > 0) await db.matches.bulkAdd(data.matches);
      if (data.teams.length > 0) await db.teams.bulkAdd(data.teams);
      if (data.team_players.length > 0) await db.team_players.bulkAdd(data.team_players);
      if (data.match_results.length > 0) await db.match_results.bulkAdd(data.match_results);
      if (data.innings.length > 0) await db.innings.bulkAdd(data.innings);
      if (data.overs.length > 0) await db.overs.bulkAdd(data.overs);
      if (data.balls.length > 0) await db.balls.bulkAdd(data.balls);
      if (data.ledger_entries.length > 0) await db.ledger_entries.bulkAdd(data.ledger_entries);
      if (data.tournaments.length > 0) await db.tournaments.bulkAdd(data.tournaments);
      if (data.fixtures.length > 0) await db.fixtures.bulkAdd(data.fixtures);
    }
  );

  return {
    success: true,
    restoredAt: new Date().toISOString(),
    restoredCounts: validation.counts,
  };
}

/**
 * Completely resets all Mandir 11 IndexedDB data in an atomic transaction
 */
export async function resetDatabase(db = defaultDb) {
  await db.transaction(
    'rw',
    [
      db.players,
      db.matches,
      db.teams,
      db.team_players,
      db.match_results,
      db.innings,
      db.overs,
      db.balls,
      db.ledger_entries,
      db.tournaments,
      db.fixtures,
    ],
    async () => {
      await Promise.all([
        db.players.clear(),
        db.matches.clear(),
        db.teams.clear(),
        db.team_players.clear(),
        db.match_results.clear(),
        db.innings.clear(),
        db.overs.clear(),
        db.balls.clear(),
        db.ledger_entries.clear(),
        db.tournaments.clear(),
        db.fixtures.clear(),
      ]);
    }
  );

  return {
    success: true,
    resetAt: new Date().toISOString(),
  };
}

/**
 * Returns record counts across all database stores
 */
export async function getDatabaseStats(db = defaultDb) {
  const [
    playersCount,
    matchesCount,
    tournamentsCount,
    ledgerCount,
    ballsCount,
  ] = await Promise.all([
    db.players.count(),
    db.matches.count(),
    db.tournaments.count(),
    db.ledger_entries.count(),
    db.balls.count(),
  ]);

  let storagePersisted = false;
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted) {
    try {
      storagePersisted = await navigator.storage.persisted();
    } catch {
      // ignore
    }
  }

  return {
    playersCount,
    matchesCount,
    tournamentsCount,
    ledgerCount,
    ballsCount,
    storagePersisted,
  };
}

/**
 * Programmatically downloads the backup file in the browser
 */
export async function downloadBackupFile(db = defaultDb) {
  const backup = await exportBackup(db);
  const jsonStr = JSON.stringify(backup, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const filename = `mandir11_backup_${dateStr}_${timeStr}.json`;

  if (typeof document !== 'undefined') {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return { filename, backup };
}
