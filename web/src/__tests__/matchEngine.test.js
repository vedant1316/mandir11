import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/db';
import { playerService } from '../services/playerService';
import * as matchEngine from '../engines/matchEngine';
import {
  MatchStateError,
  TeamValidationError,
  ResultValidationError,
} from '../engines/errors';

describe('MatchEngine (IndexedDB Local-First)', () => {
  beforeEach(async () => {
    await db.players.clear();
    await db.matches.clear();
    await db.teams.clear();
    await db.team_players.clear();
    await db.match_results.clear();
  });

  async function createTestPlayers() {
    const p1 = await playerService.create('Player 1');
    const p2 = await playerService.create('Player 2');
    const p3 = await playerService.create('Player 3');
    const p4 = await playerService.create('Player 4');
    const p5 = await playerService.create('Player 5');
    return { p1, p2, p3, p4, p5 };
  }

  it('creates an upcoming match with valid sport', async () => {
    const match = await matchEngine.createMatch({ sport: 'volleyball' });
    expect(match.id).toBeDefined();
    expect(match.sport).toBe('volleyball');
    expect(match.status).toBe('upcoming');
    expect(match.teams).toEqual([]);
    expect(match.result).toBeNull();
  });

  it('rejects invalid sport', async () => {
    await expect(matchEngine.createMatch({ sport: 'tennis' })).rejects.toThrow(ResultValidationError);
  });

  it('creates valid teams including unequal sizes (3 vs 2)', async () => {
    const { p1, p2, p3, p4, p5 } = await createTestPlayers();
    const match = await matchEngine.createMatch({ sport: 'volleyball' });

    const updated = await matchEngine.createTeams(match.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id, p2.id, p3.id] },
        { label: 'Team B', player_ids: [p4.id, p5.id] },
      ],
    });

    expect(updated.teams.length).toBe(2);
    const teamA = updated.teams.find((t) => t.label === 'Team A');
    const teamB = updated.teams.find((t) => t.label === 'Team B');
    expect(teamA.players.length).toBe(3);
    expect(teamB.players.length).toBe(2);
  });

  it('rejects duplicate player within the same team', async () => {
    const { p1, p2 } = await createTestPlayers();
    const match = await matchEngine.createMatch({ sport: 'volleyball' });

    await expect(
      matchEngine.createTeams(match.id, {
        teams: [
          { label: 'Team A', player_ids: [p1.id, p1.id] },
          { label: 'Team B', player_ids: [p2.id] },
        ],
      })
    ).rejects.toThrow(TeamValidationError);
  });

  it('rejects player assigned to both teams', async () => {
    const { p1, p2 } = await createTestPlayers();
    const match = await matchEngine.createMatch({ sport: 'volleyball' });

    await expect(
      matchEngine.createTeams(match.id, {
        teams: [
          { label: 'Team A', player_ids: [p1.id, p2.id] },
          { label: 'Team B', player_ids: [p1.id] },
        ],
      })
    ).rejects.toThrow(TeamValidationError);
  });

  it('rejects inactive players from being added to teams', async () => {
    const { p1, p2 } = await createTestPlayers();
    await playerService.toggle(p2.id, false);

    const match = await matchEngine.createMatch({ sport: 'volleyball' });

    await expect(
      matchEngine.createTeams(match.id, {
        teams: [
          { label: 'Team A', player_ids: [p1.id] },
          { label: 'Team B', player_ids: [p2.id] },
        ],
      })
    ).rejects.toThrow(TeamValidationError);
  });

  it('starts a match when valid teams exist', async () => {
    const { p1, p2 } = await createTestPlayers();
    const match = await matchEngine.createMatch({ sport: 'volleyball' });
    await matchEngine.createTeams(match.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id] },
        { label: 'Team B', player_ids: [p2.id] },
      ],
    });

    const liveMatch = await matchEngine.startMatch(match.id);
    expect(liveMatch.status).toBe('live');
  });

  it('rejects starting match without teams', async () => {
    const match = await matchEngine.createMatch({ sport: 'volleyball' });
    await expect(matchEngine.startMatch(match.id)).rejects.toThrow(TeamValidationError);
  });

  it('enters volleyball result and ends match as completed', async () => {
    const { p1, p2 } = await createTestPlayers();
    const match = await matchEngine.createMatch({ sport: 'volleyball' });
    const withTeams = await matchEngine.createTeams(match.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id] },
        { label: 'Team B', player_ids: [p2.id] },
      ],
    });
    const teamAId = withTeams.teams.find((t) => t.label === 'Team A').id;

    await matchEngine.startMatch(match.id);

    const withResult = await matchEngine.enterResult(match.id, {
      team_a_score: 25,
      team_b_score: 21,
      winning_team_id: teamAId,
    });

    expect(withResult.result.team_a_score).toBe(25);
    expect(withResult.result.team_b_score).toBe(21);
    expect(withResult.result.winning_team_id).toBe(teamAId);

    const completed = await matchEngine.endMatch(match.id, { reason: 'completed' });
    expect(completed.status).toBe('completed');
    expect(completed.end_reason).toBe('completed');
  });

  it('allows entering badminton result with nullable scores', async () => {
    const { p1, p2 } = await createTestPlayers();
    const match = await matchEngine.createMatch({ sport: 'badminton' });
    const withTeams = await matchEngine.createTeams(match.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id] },
        { label: 'Team B', player_ids: [p2.id] },
      ],
    });
    const teamBId = withTeams.teams.find((t) => t.label === 'Team B').id;

    await matchEngine.startMatch(match.id);
    const withResult = await matchEngine.enterResult(match.id, {
      team_a_score: null,
      team_b_score: null,
      winning_team_id: teamBId,
    });

    expect(withResult.result.winning_team_id).toBe(teamBId);
  });

  it('sets Player of the Match for participants after match completion', async () => {
    const { p1, p2, p3 } = await createTestPlayers();
    const match = await matchEngine.createMatch({ sport: 'volleyball' });
    const withTeams = await matchEngine.createTeams(match.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id] },
        { label: 'Team B', player_ids: [p2.id] },
      ],
    });
    const teamAId = withTeams.teams.find((t) => t.label === 'Team A').id;

    await matchEngine.startMatch(match.id);
    await matchEngine.enterResult(match.id, {
      team_a_score: 25,
      team_b_score: 18,
      winning_team_id: teamAId,
    });
    await matchEngine.endMatch(match.id, { reason: 'completed' });

    // Set participant p1 as POM
    const withPom = await matchEngine.setPlayerOfMatch(match.id, { player_id: p1.id });
    expect(withPom.player_of_match_id).toBe(p1.id);

    // Outsider p3 rejected
    await expect(
      matchEngine.setPlayerOfMatch(match.id, { player_id: p3.id })
    ).rejects.toThrow(TeamValidationError);
  });

  it('allows abandoning a match without entering a result', async () => {
    const { p1, p2 } = await createTestPlayers();
    const match = await matchEngine.createMatch({ sport: 'volleyball' });
    await matchEngine.createTeams(match.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id] },
        { label: 'Team B', player_ids: [p2.id] },
      ],
    });
    await matchEngine.startMatch(match.id);

    const abandoned = await matchEngine.endMatch(match.id, { reason: 'rain' });
    expect(abandoned.status).toBe('abandoned');
    expect(abandoned.end_reason).toBe('rain');
  });

  it('rejects completing match without result', async () => {
    const { p1, p2 } = await createTestPlayers();
    const match = await matchEngine.createMatch({ sport: 'volleyball' });
    await matchEngine.createTeams(match.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id] },
        { label: 'Team B', player_ids: [p2.id] },
      ],
    });
    await matchEngine.startMatch(match.id);

    await expect(matchEngine.endMatch(match.id, { reason: 'completed' })).rejects.toThrow(
      ResultValidationError
    );
  });

  it('rejects invalid state transitions on completed matches', async () => {
    const { p1, p2 } = await createTestPlayers();
    const match = await matchEngine.createMatch({ sport: 'volleyball' });
    const withTeams = await matchEngine.createTeams(match.id, {
      teams: [
        { label: 'Team A', player_ids: [p1.id] },
        { label: 'Team B', player_ids: [p2.id] },
      ],
    });
    const teamAId = withTeams.teams.find((t) => t.label === 'Team A').id;

    await matchEngine.startMatch(match.id);
    await matchEngine.enterResult(match.id, {
      team_a_score: 25,
      team_b_score: 18,
      winning_team_id: teamAId,
    });
    await matchEngine.endMatch(match.id, { reason: 'completed' });

    // Cannot restart completed match
    await expect(matchEngine.startMatch(match.id)).rejects.toThrow(MatchStateError);

    // Cannot enter result on completed match
    await expect(
      matchEngine.enterResult(match.id, {
        team_a_score: 20,
        team_b_score: 25,
        winning_team_id: teamAId,
      })
    ).rejects.toThrow(MatchStateError);

    // Cannot end already completed match
    await expect(matchEngine.endMatch(match.id, { reason: 'rain' })).rejects.toThrow(
      MatchStateError
    );
  });
});
