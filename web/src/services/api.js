import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request if present
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mandir11_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (username, password) =>
    api.post('/auth/login', { username, password }),
  register: (username, password, invite_code) =>
    api.post('/auth/register', { username, password, invite_code }),
};

// ─── Players ──────────────────────────────────────────────────────────────────

export const playersApi = {
  list: (activeOnly = false) =>
    api.get('/players', { params: { active_only: activeOnly } }),
  get: (id) => api.get(`/players/${id}`),
  create: (name) => api.post('/players', { name }),
  toggle: (id, is_active) => api.patch(`/players/${id}`, { is_active }),
};

// ─── Matches ──────────────────────────────────────────────────────────────────

export const matchesApi = {
  list: (params = {}) => api.get('/matches', { params }),
  get: (id) => api.get(`/matches/${id}`),
  create: (sport, tournament_id = null) =>
    api.post('/matches', { sport, tournament_id }),
  createTeams: (id, teams) =>
    api.post(`/matches/${id}/teams`, { teams }),
  start: (id) => api.post(`/matches/${id}/start`),
  enterResult: (id, team_a_score, team_b_score, winning_team_id) =>
    api.post(`/matches/${id}/result`, { team_a_score, team_b_score, winning_team_id }),
  end: (id, reason) =>
    api.post(`/matches/${id}/end`, { reason }),
  setPlayerOfMatch: (id, player_id) =>
    api.post(`/matches/${id}/player_of_match`, { player_id }),
};

export default api;
