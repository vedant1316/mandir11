import { db as defaultDb } from '../db/db';
import {
  MatchEngineError,
  MatchNotFoundError,
  PlayerNotFoundError,
  MatchStateError,
  TeamValidationError,
  ResultValidationError,
} from './errors';

export {
  MatchEngineError,
  MatchNotFoundError,
  PlayerNotFoundError,
  MatchStateError,
  TeamValidationError,
  ResultValidationError,
};

const VALID_SPORTS = ['cricket', 'volleyball', 'badminton'];

const VALID_TRANSITIONS = {
  upcoming: ['live', 'abandoned'],
  live: ['completed', 'abandoned'],
  completed: [],
  abandoned: [],
};

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'id_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

function assertTransition(current, target) {
  const allowed = VALID_TRANSITIONS[current] || [];
  if (!allowed.includes(target)) {
    throw new MatchStateError(
      `Cannot transition match from '${current}' to '${target}'. Allowed: ${
        allowed.length > 0 ? allowed.join(', ') : 'none (terminal state)'
      }.`
    );
  }
}

async function hydrateMatch(matchRecord, db = defaultDb) {
  if (!matchRecord) return null;

  const teams = await db.teams.where('match_id').equals(matchRecord.id).toArray();
  const hydratedTeams = await Promise.all(
    teams.map(async (team) => {
      const teamPlayers = await db.team_players.where('team_id').equals(team.id).toArray();
      const hydratedPlayers = await Promise.all(
        teamPlayers.map(async (tp) => {
          const player = await db.players.get(tp.player_id);
          return {
            id: tp.id,
            team_id: tp.team_id,
            player_id: tp.player_id,
            player: player || null,
          };
        })
      );
      return {
        ...team,
        players: hydratedPlayers,
      };
    })
  );

  const result = await db.match_results.where('match_id').equals(matchRecord.id).first();

  return {
    ...matchRecord,
    teams: hydratedTeams,
    result: result || null,
  };
}

export async function createMatch(data, db = defaultDb) {
  if (!data?.sport || !VALID_SPORTS.includes(data.sport)) {
    throw new ResultValidationError(`Invalid sport '${data?.sport}'. Allowed: ${VALID_SPORTS.join(', ')}`);
  }

  const matchId = generateId();
  const now = new Date().toISOString();
  const dateStr = data.match_date || now.split('T')[0];

  const matchRecord = {
    id: matchId,
    sport: data.sport,
    status: 'upcoming',
    date: dateStr,
    tournament_id: data.tournament_id || null,
    fixture_id: data.fixture_id || null,
    end_reason: null,
    player_of_match_id: null,
    created_at: now,
  };

  await db.matches.add(matchRecord);
  return hydrateMatch(matchRecord, db);
}

export async function getMatch(matchId, db = defaultDb) {
  const matchRecord = await db.matches.get(matchId);
  if (!matchRecord) {
    throw new MatchNotFoundError(`Match '${matchId}' not found.`);
  }
  return hydrateMatch(matchRecord, db);
}

export async function listMatches(params = {}, db = defaultDb) {
  const { status, sport, skip = 0, limit = 50 } = params;

  let query = db.matches.toCollection();

  if (status && sport) {
    query = db.matches.where('status').equals(status).filter((m) => m.sport === sport);
  } else if (status) {
    query = db.matches.where('status').equals(status);
  } else if (sport) {
    query = db.matches.where('sport').equals(sport);
  }

  const allMatches = await query.toArray();

  // Sort by created_at desc
  allMatches.sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));

  const total = allMatches.length;
  const paged = allMatches.slice(skip, skip + limit);
  const hydrated = await Promise.all(paged.map((m) => hydrateMatch(m, db)));

  return {
    matches: hydrated,
    total,
  };
}

export async function createTeams(matchId, data, db = defaultDb) {
  const matchRecord = await db.matches.get(matchId);
  if (!matchRecord) {
    throw new MatchNotFoundError(`Match '${matchId}' not found.`);
  }

  if (matchRecord.status !== 'upcoming') {
    throw new MatchStateError(
      `Teams can only be created for upcoming matches (current status: '${matchRecord.status}').`
    );
  }

  const existingTeams = await db.teams.where('match_id').equals(matchId).count();
  if (existingTeams > 0) {
    throw new MatchStateError('Teams already exist for this match. Cannot re-create teams.');
  }

  if (!data?.teams || !Array.isArray(data.teams) || data.teams.length < 2) {
    throw new TeamValidationError('Must provide at least two teams.');
  }

  const allPlayerIds = [];
  for (const teamInput of data.teams) {
    if (!teamInput.player_ids || teamInput.player_ids.length === 0) {
      throw new TeamValidationError(`Team '${teamInput.label}' must have at least one player.`);
    }
    allPlayerIds.push(...teamInput.player_ids);
  }

  // Check duplicate inside each team
  for (const teamInput of data.teams) {
    const uniqueIds = new Set(teamInput.player_ids);
    if (uniqueIds.size !== teamInput.player_ids.length) {
      throw new TeamValidationError(`Duplicate player IDs found within ${teamInput.label}.`);
    }
  }

  // Check cross-team duplicate
  const totalUnique = new Set(allPlayerIds);
  if (totalUnique.size !== allPlayerIds.length) {
    throw new TeamValidationError('A player cannot be assigned to both teams in the same match.');
  }

  // Validate active players
  for (const pid of totalUnique) {
    const player = await db.players.get(pid);
    if (!player) {
      throw new PlayerNotFoundError(`Player '${pid}' not found.`);
    }
    if (!player.is_active) {
      throw new TeamValidationError(
        `Player '${player.name}' is inactive and cannot be selected for a match.`
      );
    }
  }

  // Create teams and assignments
  for (const teamInput of data.teams) {
    const teamId = generateId();
    await db.teams.add({
      id: teamId,
      match_id: matchId,
      label: teamInput.label,
    });

    for (const pid of teamInput.player_ids) {
      await db.team_players.add({
        id: generateId(),
        team_id: teamId,
        player_id: pid,
      });
    }
  }

  return getMatch(matchId, db);
}

export async function startMatch(matchId, db = defaultDb) {
  const matchRecord = await db.matches.get(matchId);
  if (!matchRecord) {
    throw new MatchNotFoundError(`Match '${matchId}' not found.`);
  }

  assertTransition(matchRecord.status, 'live');

  const teams = await db.teams.where('match_id').equals(matchId).toArray();
  const teamLabels = new Set(teams.map((t) => t.label));

  if (!teamLabels.has('Team A') || !teamLabels.has('Team B')) {
    throw new TeamValidationError("Cannot start match: both 'Team A' and 'Team B' must exist.");
  }

  for (const team of teams) {
    const pCount = await db.team_players.where('team_id').equals(team.id).count();
    if (pCount === 0) {
      throw new TeamValidationError(`Cannot start match: '${team.label}' has no players.`);
    }
  }

  await db.matches.update(matchId, { status: 'live' });
  return getMatch(matchId, db);
}

export async function enterResult(matchId, data, db = defaultDb) {
  const matchRecord = await db.matches.get(matchId);
  if (!matchRecord) {
    throw new MatchNotFoundError(`Match '${matchId}' not found.`);
  }

  if (matchRecord.status !== 'live') {
    throw new MatchStateError(
      `Result can only be entered for live matches (current status: '${matchRecord.status}').`
    );
  }

  if (matchRecord.sport === 'cricket') {
    throw new MatchEngineError(
      'Cricket result entry is handled by the ball-by-ball scorer (Phase 2). Use the cricket scoring endpoints.'
    );
  }

  const teams = await db.teams.where('match_id').equals(matchId).toArray();
  const teamIds = new Set(teams.map((t) => t.id));

  if (!teamIds.has(data.winning_team_id)) {
    throw new ResultValidationError(
      `winning_team_id '${data.winning_team_id}' is not a team in match '${matchId}'.`
    );
  }

  if (data.team_a_score !== null && data.team_a_score !== undefined && data.team_a_score < 0) {
    throw new ResultValidationError('team_a_score cannot be negative.');
  }
  if (data.team_b_score !== null && data.team_b_score !== undefined && data.team_b_score < 0) {
    throw new ResultValidationError('team_b_score cannot be negative.');
  }

  const existingResult = await db.match_results.where('match_id').equals(matchId).first();
  if (existingResult) {
    await db.match_results.update(existingResult.id, {
      team_a_score: data.team_a_score !== undefined ? data.team_a_score : null,
      team_b_score: data.team_b_score !== undefined ? data.team_b_score : null,
      winning_team_id: data.winning_team_id,
    });
  } else {
    await db.match_results.add({
      id: generateId(),
      match_id: matchId,
      team_a_score: data.team_a_score !== undefined ? data.team_a_score : null,
      team_b_score: data.team_b_score !== undefined ? data.team_b_score : null,
      winning_team_id: data.winning_team_id,
    });
  }

  return getMatch(matchId, db);
}

export async function endMatch(matchId, data, db = defaultDb) {
  const matchRecord = await db.matches.get(matchId);
  if (!matchRecord) {
    throw new MatchNotFoundError(`Match '${matchId}' not found.`);
  }

  const targetStatus = data.reason === 'completed' ? 'completed' : 'abandoned';
  assertTransition(matchRecord.status, targetStatus);

  if (targetStatus === 'completed' && matchRecord.sport !== 'cricket') {
    const result = await db.match_results.where('match_id').equals(matchId).first();
    if (!result) {
      throw new ResultValidationError(
        'Cannot complete match without a result. Enter the result first.'
      );
    }
  }

  await db.matches.update(matchId, {
    status: targetStatus,
    end_reason: data.reason,
  });

  return getMatch(matchId, db);
}

export async function setPlayerOfMatch(matchId, data, db = defaultDb) {
  const matchRecord = await db.matches.get(matchId);
  if (!matchRecord) {
    throw new MatchNotFoundError(`Match '${matchId}' not found.`);
  }

  if (matchRecord.status !== 'completed') {
    throw new MatchStateError('Player of the Match can only be set for completed matches.');
  }

  const teams = await db.teams.where('match_id').equals(matchId).toArray();
  const matchPlayerIds = new Set();
  for (const team of teams) {
    const tps = await db.team_players.where('team_id').equals(team.id).toArray();
    for (const tp of tps) {
      matchPlayerIds.add(tp.player_id);
    }
  }

  if (!matchPlayerIds.has(data.player_id)) {
    throw new TeamValidationError(
      `Player '${data.player_id}' did not participate in match '${matchId}'.`
    );
  }

  await db.matches.update(matchId, {
    player_of_match_id: data.player_id,
  });

  return getMatch(matchId, db);
}
