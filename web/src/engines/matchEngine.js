import { db as defaultDb } from '../db/db';
import {
  MatchEngineError,
  MatchNotFoundError,
  PlayerNotFoundError,
  MatchStateError,
  TeamValidationError,
  ResultValidationError,
} from './errors';
import { assignRankingPoints } from './rankingPointEngine';

export {
  MatchEngineError,
  MatchNotFoundError,
  PlayerNotFoundError,
  MatchStateError,
  TeamValidationError,
  ResultValidationError,
};

const VALID_SPORTS = ['cricket', 'volleyball', 'badminton', 'position'];

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
  let hydratedRankings = null;
  if (result?.rankings && Array.isArray(result.rankings)) {
    hydratedRankings = await Promise.all(
      result.rankings.map(async (r) => {
        const player = await db.players.get(r.player_id);
        return {
          ...r,
          player: player || { id: r.player_id, name: 'Player' },
        };
      })
    );
  }

  return {
    ...matchRecord,
    teams: hydratedTeams,
    result: result
      ? {
          ...result,
          hydratedRankings: hydratedRankings || result.rankings,
        }
      : null,
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
    cricket_format: data.cricket_format || (data.sport === 'cricket' ? 'limited_overs' : null),
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

export async function countMatches(params = {}, db = defaultDb) {
  const { status, sport } = params;

  if (status && sport) {
    return db.matches.where('status').equals(status).filter((m) => m.sport === sport).count();
  } else if (status) {
    return db.matches.where('status').equals(status).count();
  } else if (sport) {
    return db.matches.where('sport').equals(sport).count();
  }

  return db.matches.count();
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

  if (matchRecord.sport === 'position') {
    if (!data.rankings || !Array.isArray(data.rankings) || data.rankings.length < 2) {
      throw new ResultValidationError('Position match result must include rankings for at least 2 participants.');
    }
    const decoratedRankings = assignRankingPoints(data.rankings);
    decoratedRankings.sort((a, b) => a.position - b.position);
    const winnerPlayerId = decoratedRankings.find((r) => r.position === 1)?.player_id || null;

    const existingResult = await db.match_results.where('match_id').equals(matchId).first();
    if (existingResult) {
      await db.match_results.update(existingResult.id, {
        winner_player_id: winnerPlayerId,
        rankings: decoratedRankings,
      });
    } else {
      await db.match_results.add({
        id: generateId(),
        match_id: matchId,
        winning_team_id: null,
        winner_player_id: winnerPlayerId,
        rankings: decoratedRankings,
      });
    }
    return getMatch(matchId, db);
  }

  const teams = await db.teams.where('match_id').equals(matchId).toArray();
  const teamIds = new Set(teams.map((t) => t.id));

  if (
    data.winning_team_id !== null &&
    data.winning_team_id !== undefined &&
    !teamIds.has(data.winning_team_id)
  ) {
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

/**
 * Creates and immediately completes a Position Match with participant rankings
 */
export async function createPositionMatch(data, db = defaultDb) {
  if (!data?.rankings || !Array.isArray(data.rankings) || data.rankings.length < 2) {
    throw new ResultValidationError('Position match must have at least 2 ranked participants.');
  }

  const assignedPlayerIds = data.rankings.map((r) => r.player_id);
  const assignedPositions = data.rankings.map((r) => Number(r.position));

  // Check unique players
  const uniquePlayers = new Set(assignedPlayerIds);
  if (uniquePlayers.size !== assignedPlayerIds.length) {
    throw new ResultValidationError('Cannot assign the same player to multiple positions.');
  }

  // Check unique positions 1..N
  const expectedPositions = Array.from({ length: data.rankings.length }, (_, i) => i + 1);
  const positionSet = new Set(assignedPositions);
  for (const exp of expectedPositions) {
    if (!positionSet.has(exp)) {
      throw new ResultValidationError(`All positions from 1st through ${data.rankings.length}th must be assigned.`);
    }
  }

  // Validate all players exist in db
  for (const pid of uniquePlayers) {
    const player = await db.players.get(pid);
    if (!player) {
      throw new PlayerNotFoundError(`Player '${pid}' not found.`);
    }
  }

  // Decorate rankings with ranking points from centralized engine
  const decoratedRankings = assignRankingPoints(data.rankings);
  decoratedRankings.sort((a, b) => a.position - b.position);

  const matchId = generateId();
  const now = new Date().toISOString();
  const dateStr = data.match_date || now.split('T')[0];

  const firstPlace = decoratedRankings.find((r) => r.position === 1);
  const winnerPlayerId = firstPlace?.player_id || null;

  const matchRecord = {
    id: matchId,
    sport: 'position',
    cricket_format: null,
    status: 'completed',
    date: dateStr,
    tournament_id: data.tournament_id || null,
    fixture_id: data.fixture_id || null,
    end_reason: 'completed',
    player_of_match_id: null,
    created_at: now,
  };

  const resultRecord = {
    id: generateId(),
    match_id: matchId,
    winning_team_id: null,
    winner_player_id: winnerPlayerId,
    rankings: decoratedRankings,
    team_a_score: null,
    team_b_score: null,
  };

  await db.transaction('rw', [db.matches, db.match_results], async () => {
    await db.matches.add(matchRecord);
    await db.match_results.add(resultRecord);
  });

  return hydrateMatch(matchRecord, db);
}

export async function calculateMatchMvp(matchId, db = defaultDb) {
  const match = await db.matches.get(matchId);
  if (!match) {
    throw new MatchNotFoundError(`Match '${matchId}' not found.`);
  }

  // MVP is only supported for Cricket matches
  if (match.sport !== 'cricket') {
    return { playerOfMatchId: null, playerOfMatch: null, mvpScores: [] };
  }

  const teams = await db.teams.where('match_id').equals(matchId).toArray();
  if (teams.length === 0) {
    return { playerOfMatchId: null, playerOfMatch: null, mvpScores: [] };
  }

  const result = await db.match_results.where('match_id').equals(matchId).first();
  const winningTeamId = result?.winning_team_id || null;

  // Gather all players with team info
  const playerEntries = [];
  for (const team of teams) {
    const tps = await db.team_players.where('team_id').equals(team.id).toArray();
    for (const tp of tps) {
      const player = await db.players.get(tp.player_id);
      playerEntries.push({
        playerId: tp.player_id,
        playerName: player?.name || 'Unknown',
        player: player || null,
        teamId: team.id,
        teamLabel: team.label,
      });
    }
  }

  if (playerEntries.length === 0) {
    return { playerOfMatchId: null, playerOfMatch: null, mvpScores: [] };
  }

  // Pre-load cricket balls and overs across all innings for this match
  const isCricket = match.sport === 'cricket';
  const ballsByBatter = new Map(); // playerId -> total runs
  const wicketsByBowler = new Map(); // playerId -> total wickets

  if (isCricket) {
    const inningsList = await db.innings.where('match_id').equals(matchId).toArray();
    for (const inn of inningsList) {
      const overs = await db.overs.where('innings_id').equals(inn.id).toArray();
      const overBowlerMap = new Map(overs.map((o) => [o.id, o.bowler_id]));

      const balls = await db.balls.where('innings_id').equals(inn.id).toArray();
      for (const b of balls) {
        // Batter runs
        if (b.batter_id) {
          const currentRuns = ballsByBatter.get(b.batter_id) || 0;
          ballsByBatter.set(b.batter_id, currentRuns + (b.runs || 0));
        }

        // Bowler wickets (non-run-out)
        if (b.is_wicket && b.dismissal_type !== 'run_out' && b.over_id) {
          const bowlerId = overBowlerMap.get(b.over_id);
          if (bowlerId) {
            const currentWickets = wicketsByBowler.get(bowlerId) || 0;
            wicketsByBowler.set(bowlerId, currentWickets + 1);
          }
        }
      }
    }
  }

  const mvpScores = playerEntries.map((pe) => {
    let outcome = 'tie';
    let outcomePoints = 5;

    if (winningTeamId) {
      if (pe.teamId === winningTeamId) {
        outcome = 'win';
        outcomePoints = 10;
      } else {
        outcome = 'loss';
        outcomePoints = 2;
      }
    }

    const runs = isCricket ? ballsByBatter.get(pe.playerId) || 0 : 0;
    const wickets = isCricket ? wicketsByBowler.get(pe.playerId) || 0 : 0;
    const runPoints = runs * 1;
    const wicketPoints = wickets * 5;
    const totalPoints = outcomePoints + runPoints + wicketPoints;

    return {
      playerId: pe.playerId,
      playerName: pe.playerName,
      player: pe.player,
      teamId: pe.teamId,
      teamLabel: pe.teamLabel,
      outcome,
      outcomePoints,
      runs,
      runPoints,
      wickets,
      wicketPoints,
      totalPoints,
    };
  });

  // Deterministic sorting
  mvpScores.sort((a, b) => {
    // 1. Highest total MVP points
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    // 2. Highest wickets
    if (b.wickets !== a.wickets) return b.wickets - a.wickets;
    // 3. Highest runs
    if (b.runs !== a.runs) return b.runs - a.runs;
    // 4. Winning team priority
    const aWin = a.outcome === 'win' ? 1 : 0;
    const bWin = b.outcome === 'win' ? 1 : 0;
    if (bWin !== aWin) return bWin - aWin;
    // 5. Alphabetical name
    const nameCmp = (a.playerName || '').localeCompare(b.playerName || '');
    if (nameCmp !== 0) return nameCmp;
    // 6. ID comparison
    return (a.playerId || '').localeCompare(b.playerId || '');
  });

  const best = mvpScores[0] || null;

  return {
    playerOfMatchId: best ? best.playerId : null,
    playerOfMatch: best ? best.player : null,
    mvpScores,
  };
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

  let autoPomId = null;
  if (matchRecord.sport === 'cricket') {
    autoPomId = matchRecord.player_of_match_id;
    if (targetStatus === 'completed' && !autoPomId) {
      const mvp = await calculateMatchMvp(matchId, db);
      autoPomId = mvp.playerOfMatchId;
    }
  }

  await db.matches.update(matchId, {
    status: targetStatus,
    end_reason: data.reason,
    player_of_match_id: autoPomId || null,
  });

  return getMatch(matchId, db);
}

export async function setPlayerOfMatch(matchId, data, db = defaultDb) {
  const matchRecord = await db.matches.get(matchId);
  if (!matchRecord) {
    throw new MatchNotFoundError(`Match '${matchId}' not found.`);
  }

  if (matchRecord.sport !== 'cricket') {
    throw new MatchStateError('Player of the Match is only available for Cricket matches.');
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

export async function getLastMatch(db = defaultDb) {
  const allMatches = await db.matches.toArray();
  if (allMatches.length === 0) return null;
  allMatches.sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));
  return allMatches[0];
}

export async function getLastMatchTeams(db = defaultDb) {
  const allMatches = await db.matches.toArray();
  if (allMatches.length === 0) return null;
  allMatches.sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));

  for (const m of allMatches) {
    const teams = await db.teams.where('match_id').equals(m.id).toArray();
    if (teams.length >= 2) {
      const teamA = teams.find((t) => t.label === 'Team A') || teams[0];
      const teamB = teams.find((t) => t.label === 'Team B') || teams[1];

      const tpA = await db.team_players.where('team_id').equals(teamA.id).toArray();
      const tpB = await db.team_players.where('team_id').equals(teamB.id).toArray();

      const activePlayersA = [];
      for (const tp of tpA) {
        const p = await db.players.get(tp.player_id);
        if (p && p.is_active) activePlayersA.push(p.id);
      }

      const activePlayersB = [];
      for (const tp of tpB) {
        const p = await db.players.get(tp.player_id);
        if (p && p.is_active) activePlayersB.push(p.id);
      }

      if (activePlayersA.length > 0 && activePlayersB.length > 0) {
        let oversLimit = 5;
        if (m.sport === 'cricket') {
          const inn = await db.innings.where('match_id').equals(m.id).first();
          if (inn?.overs_limit) oversLimit = inn.overs_limit;
        }

        return {
          matchId: m.id,
          sport: m.sport,
          cricketFormat: m.cricket_format || 'limited_overs',
          oversLimit,
          teamA: activePlayersA,
          teamB: activePlayersB,
        };
      }
    }
  }

  return null;
}

export async function getLastMatchSettings(db = defaultDb) {
  const lastMatch = await getLastMatch(db);
  if (!lastMatch) return null;

  let oversLimit = 5;
  if (lastMatch.sport === 'cricket') {
    const inn = await db.innings.where('match_id').equals(lastMatch.id).first();
    if (inn?.overs_limit) oversLimit = inn.overs_limit;
  }

  return {
    matchId: lastMatch.id,
    sport: lastMatch.sport,
    cricketFormat: lastMatch.cricket_format || 'limited_overs',
    oversLimit,
  };
}

export async function deleteMatch(matchId, db = defaultDb) {
  const matchRecord = await db.matches.get(matchId);
  if (!matchRecord) {
    throw new MatchNotFoundError(`Match '${matchId}' not found.`);
  }

  await db.transaction(
    'rw',
    [
      db.matches,
      db.teams,
      db.team_players,
      db.match_results,
      db.innings,
      db.overs,
      db.balls,
      db.ledger_entries,
      db.ledger_payments,
      db.debt_adjustments,
      db.fixtures,
    ],
    async () => {
      // 1. Teams & Team Players
      const teams = await db.teams.where('match_id').equals(matchId).toArray();
      for (const team of teams) {
        await db.team_players.where('team_id').equals(team.id).delete();
      }
      await db.teams.where('match_id').equals(matchId).delete();

      // 2. Match Results
      await db.match_results.where('match_id').equals(matchId).delete();

      // 3. Cricket Innings, Overs, Balls
      const innings = await db.innings.where('match_id').equals(matchId).toArray();
      for (const inn of innings) {
        await db.balls.where('innings_id').equals(inn.id).delete();
        await db.overs.where('innings_id').equals(inn.id).delete();
      }
      await db.innings.where('match_id').equals(matchId).delete();

      // 4. Ledger Entries, Payments & Adjustments
      await db.ledger_entries.where('match_id').equals(matchId).delete();
      await db.ledger_payments.where('match_id').equals(matchId).delete();
      await db.debt_adjustments.where('match_id').equals(matchId).delete();

      // 5. Fixtures referencing this match
      const fixtures = await db.fixtures.where('match_id').equals(matchId).toArray();
      for (const fix of fixtures) {
        await db.fixtures.update(fix.id, { match_id: null });
      }

      // 6. Delete Match record
      await db.matches.delete(matchId);
    }
  );

  return { success: true, matchId };
}


