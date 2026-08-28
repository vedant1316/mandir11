import { db as defaultDb } from '../db/db';
import { PlayerNotFoundError, TeamValidationError } from '../engines/errors';

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'p_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

export const playerService = {
  async list(activeOnly = false, db = defaultDb) {
    let players = await db.players.toArray();
    if (activeOnly) {
      players = players.filter((p) => p.is_active);
    }
    // Sort alphabetically by name
    players.sort((a, b) => a.name.localeCompare(b.name));
    return {
      players,
      total: players.length,
    };
  },

  async get(id, db = defaultDb) {
    const player = await db.players.get(id);
    if (!player) {
      throw new PlayerNotFoundError(`Player '${id}' not found.`);
    }
    return player;
  },

  async create(name, db = defaultDb) {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      throw new TeamValidationError('Player name cannot be empty.');
    }

    const newPlayer = {
      id: generateId(),
      name: trimmed,
      is_active: true,
      created_at: new Date().toISOString(),
    };

    await db.players.add(newPlayer);
    return newPlayer;
  },

  async toggle(id, isActive, db = defaultDb) {
    const player = await db.players.get(id);
    if (!player) {
      throw new PlayerNotFoundError(`Player '${id}' not found.`);
    }

    await db.players.update(id, { is_active: Boolean(isActive) });
    return {
      ...player,
      is_active: Boolean(isActive),
    };
  },
};
