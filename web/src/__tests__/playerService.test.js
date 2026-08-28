import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/db';
import { playerService } from '../services/playerService';
import { PlayerNotFoundError, TeamValidationError } from '../engines/errors';

describe('PlayerService (IndexedDB Local-First)', () => {
  beforeEach(async () => {
    await db.players.clear();
  });

  it('creates a player with active status', async () => {
    const player = await playerService.create('Arjun');
    expect(player.id).toBeDefined();
    expect(player.name).toBe('Arjun');
    expect(player.is_active).toBe(true);
  });

  it('rejects empty or whitespace player names', async () => {
    await expect(playerService.create('')).rejects.toThrow(TeamValidationError);
    await expect(playerService.create('   ')).rejects.toThrow(TeamValidationError);
  });

  it('lists all players sorted alphabetically', async () => {
    await playerService.create('Rohit');
    await playerService.create('Arjun');
    await playerService.create('Bumrah');

    const result = await playerService.list(false);
    expect(result.total).toBe(3);
    expect(result.players.map((p) => p.name)).toEqual(['Arjun', 'Bumrah', 'Rohit']);
  });

  it('filters active players when activeOnly is true', async () => {
    await playerService.create('Active Player');
    const p2 = await playerService.create('Inactive Player');

    await playerService.toggle(p2.id, false);

    const result = await playerService.list(true);
    expect(result.total).toBe(1);
    expect(result.players[0].name).toBe('Active Player');
  });

  it('toggles player availability', async () => {
    const player = await playerService.create('Virat');
    expect(player.is_active).toBe(true);

    const deactivated = await playerService.toggle(player.id, false);
    expect(deactivated.is_active).toBe(false);

    const reactivated = await playerService.toggle(player.id, true);
    expect(reactivated.is_active).toBe(true);
  });

  it('throws PlayerNotFoundError when player id does not exist', async () => {
    await expect(playerService.get('nonexistent-id')).rejects.toThrow(PlayerNotFoundError);
    await expect(playerService.toggle('nonexistent-id', false)).rejects.toThrow(PlayerNotFoundError);
  });
});
