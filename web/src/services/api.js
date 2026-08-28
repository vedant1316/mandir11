import { playerService } from './playerService';
import * as matchEngine from '../engines/matchEngine';

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
  create: async (sport, tournament_id = null) => {
    const data = await matchEngine.createMatch({ sport, tournament_id });
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
};

export default {
  players: playersApi,
  matches: matchesApi,
  auth: authApi,
};
