import { playerService } from './playerService';
import * as matchEngine from '../engines/matchEngine';
import * as cricketScorer from '../engines/cricketScorer';
import * as ledgerEngine from '../engines/ledgerEngine';
import * as statsEngine from '../engines/statsEngine';
import * as tournamentEngine from '../engines/tournamentEngine';
import * as backupEngine from '../engines/backupEngine';

// ─── Local-First Auth (No-op / Open Access) ───────────────────────────────────

export const authApi = {
  login: async (_username, _password) => {
    return { data: { access_token: 'local_token' } };
  },
  register: async (_username, _password, _invite_code) => {
    return { data: { access_token: 'local_token' } };
  },
};

// ─── Players API (Local-First Adapter) ────────────────────────────────────────

export const playersApi = {
  list: async (activeOnly = false) => {
    const data = await playerService.list(activeOnly);
    return { data };
  },
  get: async (id) => {
    const data = await playerService.get(id);
    return { data };
  },
  create: async (name) => {
    const data = await playerService.create(name);
    return { data };
  },
  toggle: async (id, isActive) => {
    const data = await playerService.toggle(id, isActive);
    return { data };
  },
};

// ─── Matches API (Local-First Adapter) ────────────────────────────────────────

export const matchesApi = {
  list: async (params = {}) => {
    const data = await matchEngine.listMatches(params);
    return { data };
  },
  get: async (id) => {
    const data = await matchEngine.getMatch(id);
    return { data };
  },
  create: async (sportOrPayload, tournament_id = null) => {
    const payload =
      typeof sportOrPayload === 'string'
        ? { sport: sportOrPayload, tournament_id }
        : sportOrPayload;
    const data = await matchEngine.createMatch(payload);
    return { data };
  },
  createTeams: async (id, teams) => {
    const data = await matchEngine.createTeams(id, { teams });
    return { data };
  },
  start: async (id) => {
    const data = await matchEngine.startMatch(id);
    return { data };
  },
  enterResult: async (id, team_a_score, team_b_score, winning_team_id) => {
    const data = await matchEngine.enterResult(id, {
      team_a_score,
      team_b_score,
      winning_team_id,
    });
    return { data };
  },
  end: async (id, reason) => {
    const data = await matchEngine.endMatch(id, { reason });
    return { data };
  },
  setPlayerOfMatch: async (id, player_id) => {
    const data = await matchEngine.setPlayerOfMatch(id, { player_id });
    return { data };
  },
  delete: async (id) => {
    const data = await matchEngine.deleteMatch(id);
    return { data };
  },
};

// ─── Cricket API (Local-First Adapter) ────────────────────────────────────────

export const cricketApi = {
  initInnings: async (params) => {
    const data = await cricketScorer.initInnings(params);
    return { data };
  },
  recordBall: async (params) => {
    const data = await cricketScorer.recordBall(params);
    return { data };
  },
  startNextOver: async (params) => {
    const data = await cricketScorer.startNextOver(params);
    return { data };
  },
  switchInnings: async (params) => {
    const data = await cricketScorer.switchInnings(params);
    return { data };
  },
  declareInnings: async (params) => {
    const data = await cricketScorer.declareInnings(params);
    return { data };
  },
  endMatchAsDraw: async (matchId) => {
    const data = await cricketScorer.endMatchAsDraw(matchId);
    return { data };
  },
  undoLastBall: async (params) => {
    const data = await cricketScorer.undoLastBall(params);
    return { data };
  },
  changeBatter: async (params) => {
    const data = await cricketScorer.changeBatter(params);
    return { data };
  },
  changeBowler: async (params) => {
    const data = await cricketScorer.changeBowler(params);
    return { data };
  },
  getInningsState: async (inningsId) => {
    const data = await cricketScorer.getInningsState(inningsId);
    return { data };
  },
  getMatchScorecard: async (matchId) => {
    const data = await cricketScorer.getMatchScorecard(matchId);
    return { data };
  },
};

// ─── Ledger API (Local-First Adapter) ─────────────────────────────────────────

export const ledgerApi = {
  setMatchLedger: async (matchId, entries) => {
    const data = await ledgerEngine.setMatchLedger(matchId, entries);
    return { data };
  },
  getMatchLedger: async (matchId) => {
    const data = await ledgerEngine.getMatchLedger(matchId);
    return { data };
  },
  calculateSettlement: async (matchId) => {
    const data = await ledgerEngine.calculateMatchSettlement(matchId);
    return { data };
  },
  getPlayerHistory: async (playerId) => {
    const data = await ledgerEngine.getPlayerLedgerHistory(playerId);
    return { data };
  },
  getColonySummary: async () => {
    const data = await ledgerEngine.getColonyLedgerSummary();
    return { data };
  },
};

// ─── Stats & Rankings API (Local-First Adapter) ───────────────────────────────

export const statsApi = {
  getPlayerStats: async (playerId, sport = null) => {
    const data = await statsEngine.getPlayerStats(playerId, sport);
    return { data };
  },
  getRankings: async (sport = 'overall') => {
    const data = await statsEngine.getRankings(sport);
    return { data };
  },
  getStreaks: async (sport = null) => {
    const data = await statsEngine.getStreaks(sport);
    return { data };
  },
  getLeaderboardSummary: async () => {
    const data = await statsEngine.getLeaderboardSummary();
    return { data };
  },
};

// ─── Tournaments API (Local-First Adapter) ────────────────────────────────────

export const tournamentsApi = {
  list: async (filters = {}) => {
    const data = await tournamentEngine.listTournaments(filters);
    return { data };
  },
  get: async (id) => {
    const data = await tournamentEngine.getTournamentDetails(id);
    return { data };
  },
  create: async (payload) => {
    const data = await tournamentEngine.createTournament(payload);
    return { data };
  },
  startFixtureMatch: async (fixtureId) => {
    const data = await tournamentEngine.startFixtureMatch(fixtureId);
    return { data };
  },
  advance: async (tournamentId) => {
    const data = await tournamentEngine.advanceTournament(tournamentId);
    return { data };
  },
  delete: async (id) => {
    const data = await tournamentEngine.deleteTournament(id);
    return { data };
  },
};

// ─── Backup & Data Management API (Local-First Adapter) ───────────────────────

export const backupApi = {
  export: async () => {
    const data = await backupEngine.exportBackup();
    return { data };
  },
  download: async () => {
    const data = await backupEngine.downloadBackupFile();
    return { data };
  },
  validate: (backup) => {
    return backupEngine.validateBackup(backup);
  },
  import: async (backup) => {
    const data = await backupEngine.importBackup(backup);
    return { data };
  },
  reset: async () => {
    const data = await backupEngine.resetDatabase();
    return { data };
  },
  getStats: async () => {
    const data = await backupEngine.getDatabaseStats();
    return { data };
  },
};

export default {
  players: playersApi,
  matches: matchesApi,
  cricket: cricketApi,
  ledger: ledgerApi,
  stats: statsApi,
  tournaments: tournamentsApi,
  backup: backupApi,
  auth: authApi,
};





