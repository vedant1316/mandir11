import { db as defaultDb } from '../db/db';
import {
  TournamentValidationError,
  TournamentNotFoundError,
  FixtureNotFoundError,
} from './errors';
import * as matchEngine from './matchEngine';

function generateId() {
  return crypto.randomUUID();
}

/**
 * Creates a new tournament and generates its fixtures
 */
export async function createTournament(data, db = defaultDb) {
  const { name, sport, format, teams } = data;

  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new TournamentValidationError('Tournament name is required.');
  }

  const validSports = ['cricket', 'volleyball', 'badminton'];
  if (!validSports.includes(sport)) {
    throw new TournamentValidationError(
      `Invalid sport '${sport}'. Must be one of: ${validSports.join(', ')}`
    );
  }

  const validFormats = ['knockout', 'round_robin', 'league'];
  if (!validFormats.includes(format)) {
    throw new TournamentValidationError(
      `Invalid format '${format}'. Must be one of: ${validFormats.join(', ')}`
    );
  }

  if (!Array.isArray(teams) || teams.length < 2) {
    throw new TournamentValidationError('At least 2 teams are required to create a tournament.');
  }

  // Validate and normalize teams
  const normalizedTeams = [];
  const teamNames = new Set();

  for (let i = 0; i < teams.length; i++) {
    const t = teams[i];
    const teamName = (t.name || `Team ${i + 1}`).trim();
    if (teamNames.has(teamName.toLowerCase())) {
      throw new TournamentValidationError(`Duplicate team name '${teamName}'.`);
    }
    teamNames.add(teamName.toLowerCase());

    const playerIds = Array.isArray(t.player_ids) ? Array.from(new Set(t.player_ids)) : [];
    if (playerIds.length === 0) {
      throw new TournamentValidationError(`Team '${teamName}' must have at least 1 player.`);
    }

    normalizedTeams.push({
      id: generateId(),
      name: teamName,
      player_ids: playerIds,
    });
  }

  const tournamentId = generateId();
  const tournamentRecord = {
    id: tournamentId,
    name: name.trim(),
    sport,
    format,
    status: 'upcoming',
    teams: normalizedTeams,
    winner_team_id: null,
    winner_team_name: null,
    created_at: new Date().toISOString(),
  };

  // Generate fixtures
  let fixtures = [];
  if (format === 'knockout') {
    fixtures = generateKnockoutFixtures(tournamentId, normalizedTeams);
  } else {
    fixtures = generateRoundRobinFixtures(tournamentId, normalizedTeams);
  }

  await db.transaction('rw', [db.tournaments, db.fixtures], async () => {
    await db.tournaments.add(tournamentRecord);
    for (const f of fixtures) {
      await db.fixtures.add(f);
    }
  });

  return getTournamentDetails(tournamentId, db);
}

/**
 * Generates structured knockout rounds and connects upstream fixtures to downstream rounds
 */
export function generateKnockoutFixtures(tournamentId, teams) {
  const fixtures = [];
  const count = teams.length;

  if (count <= 2) {
    // Single Final match
    fixtures.push({
      id: generateId(),
      tournament_id: tournamentId,
      round_number: 1,
      round_label: 'Final',
      sequence: 1,
      team_a_id: teams[0].id,
      team_a_name: teams[0].name,
      team_a_player_ids: teams[0].player_ids,
      team_a_source: null,
      team_b_id: teams[1]?.id || null,
      team_b_name: teams[1]?.name || null,
      team_b_player_ids: teams[1]?.player_ids || [],
      team_b_source: null,
      next_fixture_id: null,
      next_fixture_slot: null,
      match_id: null,
      winner_team_id: null,
      winner_team_name: null,
      status: teams[1] ? 'ready' : 'waiting',
      created_at: new Date().toISOString(),
    });
    return fixtures;
  }

  if (count <= 4) {
    // 2 Semi-Finals + 1 Final
    const finalId = generateId();

    // SF 1
    fixtures.push({
      id: generateId(),
      tournament_id: tournamentId,
      round_number: 1,
      round_label: 'Semi-Final 1',
      sequence: 1,
      team_a_id: teams[0].id,
      team_a_name: teams[0].name,
      team_a_player_ids: teams[0].player_ids,
      team_a_source: null,
      team_b_id: teams[1].id,
      team_b_name: teams[1].name,
      team_b_player_ids: teams[1].player_ids,
      team_b_source: null,
      next_fixture_id: finalId,
      next_fixture_slot: 'team_a',
      match_id: null,
      winner_team_id: null,
      winner_team_name: null,
      status: 'ready',
      created_at: new Date().toISOString(),
    });

    // SF 2
    fixtures.push({
      id: generateId(),
      tournament_id: tournamentId,
      round_number: 1,
      round_label: 'Semi-Final 2',
      sequence: 2,
      team_a_id: teams[2].id,
      team_a_name: teams[2].name,
      team_a_player_ids: teams[2].player_ids,
      team_a_source: null,
      team_b_id: teams[3]?.id || null,
      team_b_name: teams[3]?.name || null,
      team_b_player_ids: teams[3]?.player_ids || [],
      team_b_source: null,
      next_fixture_id: finalId,
      next_fixture_slot: 'team_b',
      match_id: null,
      winner_team_id: null,
      winner_team_name: null,
      status: teams[3] ? 'ready' : 'waiting',
      created_at: new Date().toISOString(),
    });

    // Final
    fixtures.push({
      id: finalId,
      tournament_id: tournamentId,
      round_number: 2,
      round_label: 'Final',
      sequence: 3,
      team_a_id: null,
      team_a_name: null,
      team_a_player_ids: [],
      team_a_source: 'Winner of SF 1',
      team_b_id: null,
      team_b_name: null,
      team_b_player_ids: [],
      team_b_source: 'Winner of SF 2',
      next_fixture_id: null,
      next_fixture_slot: null,
      match_id: null,
      winner_team_id: null,
      winner_team_name: null,
      status: 'waiting',
      created_at: new Date().toISOString(),
    });

    return fixtures;
  }

  // 8 teams: 4 Quarter-Finals, 2 Semi-Finals, 1 Final
  const sf1Id = generateId();
  const sf2Id = generateId();
  const finalId = generateId();

  // QF 1 -> SF 1 (team_a)
  fixtures.push({
    id: generateId(),
    tournament_id: tournamentId,
    round_number: 1,
    round_label: 'Quarter-Final 1',
    sequence: 1,
    team_a_id: teams[0].id,
    team_a_name: teams[0].name,
    team_a_player_ids: teams[0].player_ids,
    team_b_id: teams[1].id,
    team_b_name: teams[1].name,
    team_b_player_ids: teams[1].player_ids,
    next_fixture_id: sf1Id,
    next_fixture_slot: 'team_a',
    match_id: null,
    status: 'ready',
    created_at: new Date().toISOString(),
  });

  // QF 2 -> SF 1 (team_b)
  fixtures.push({
    id: generateId(),
    tournament_id: tournamentId,
    round_number: 1,
    round_label: 'Quarter-Final 2',
    sequence: 2,
    team_a_id: teams[2].id,
    team_a_name: teams[2].name,
    team_a_player_ids: teams[2].player_ids,
    team_b_id: teams[3].id,
    team_b_name: teams[3].name,
    team_b_player_ids: teams[3].player_ids,
    next_fixture_id: sf1Id,
    next_fixture_slot: 'team_b',
    match_id: null,
    status: 'ready',
    created_at: new Date().toISOString(),
  });

  // QF 3 -> SF 2 (team_a)
  fixtures.push({
    id: generateId(),
    tournament_id: tournamentId,
    round_number: 1,
    round_label: 'Quarter-Final 3',
    sequence: 3,
    team_a_id: teams[4]?.id || null,
    team_a_name: teams[4]?.name || null,
    team_a_player_ids: teams[4]?.player_ids || [],
    team_b_id: teams[5]?.id || null,
    team_b_name: teams[5]?.name || null,
    team_b_player_ids: teams[5]?.player_ids || [],
    next_fixture_id: sf2Id,
    next_fixture_slot: 'team_a',
    match_id: null,
    status: teams[4] && teams[5] ? 'ready' : 'waiting',
    created_at: new Date().toISOString(),
  });

  // QF 4 -> SF 2 (team_b)
  fixtures.push({
    id: generateId(),
    tournament_id: tournamentId,
    round_number: 1,
    round_label: 'Quarter-Final 4',
    sequence: 4,
    team_a_id: teams[6]?.id || null,
    team_a_name: teams[6]?.name || null,
    team_a_player_ids: teams[6]?.player_ids || [],
    team_b_id: teams[7]?.id || null,
    team_b_name: teams[7]?.name || null,
    team_b_player_ids: teams[7]?.player_ids || [],
    next_fixture_id: sf2Id,
    next_fixture_slot: 'team_b',
    match_id: null,
    status: teams[6] && teams[7] ? 'ready' : 'waiting',
    created_at: new Date().toISOString(),
  });

  // SF 1 -> Final (team_a)
  fixtures.push({
    id: sf1Id,
    tournament_id: tournamentId,
    round_number: 2,
    round_label: 'Semi-Final 1',
    sequence: 5,
    team_a_source: 'Winner of QF 1',
    team_b_source: 'Winner of QF 2',
    next_fixture_id: finalId,
    next_fixture_slot: 'team_a',
    match_id: null,
    status: 'waiting',
    created_at: new Date().toISOString(),
  });

  // SF 2 -> Final (team_b)
  fixtures.push({
    id: sf2Id,
    tournament_id: tournamentId,
    round_number: 2,
    round_label: 'Semi-Final 2',
    sequence: 6,
    team_a_source: 'Winner of QF 3',
    team_b_source: 'Winner of QF 4',
    next_fixture_id: finalId,
    next_fixture_slot: 'team_b',
    match_id: null,
    status: 'waiting',
    created_at: new Date().toISOString(),
  });

  // Final
  fixtures.push({
    id: finalId,
    tournament_id: tournamentId,
    round_number: 3,
    round_label: 'Final',
    sequence: 7,
    team_a_source: 'Winner of SF 1',
    team_b_source: 'Winner of SF 2',
    next_fixture_id: null,
    next_fixture_slot: null,
    match_id: null,
    status: 'waiting',
    created_at: new Date().toISOString(),
  });

  return fixtures;
}

/**
 * Generates round-robin schedule ensuring all teams play each other
 */
export function generateRoundRobinFixtures(tournamentId, teams) {
  const fixtures = [];
  let seq = 1;

  // Generate pair-wise matchups
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const teamA = teams[i];
      const teamB = teams[j];

      fixtures.push({
        id: generateId(),
        tournament_id: tournamentId,
        round_number: Math.floor((seq - 1) / Math.floor(teams.length / 2)) + 1,
        round_label: `Match #${seq}`,
        sequence: seq++,
        team_a_id: teamA.id,
        team_a_name: teamA.name,
        team_a_player_ids: teamA.player_ids,
        team_a_source: null,
        team_b_id: teamB.id,
        team_b_name: teamB.name,
        team_b_player_ids: teamB.player_ids,
        team_b_source: null,
        next_fixture_id: null,
        next_fixture_slot: null,
        match_id: null,
        winner_team_id: null,
        winner_team_name: null,
        status: 'ready',
        created_at: new Date().toISOString(),
      });
    }
  }

  return fixtures;
}

/**
 * Starts a live match linked to a tournament fixture
 */
export async function startFixtureMatch(fixtureId, db = defaultDb) {
  const fixture = await db.fixtures.get(fixtureId);
  if (!fixture) {
    throw new FixtureNotFoundError(`Fixture '${fixtureId}' not found.`);
  }

  if (!fixture.team_a_id || !fixture.team_b_id) {
    throw new TournamentValidationError(
      'Both teams must be determined before starting this fixture match.'
    );
  }

  const tournament = await db.tournaments.get(fixture.tournament_id);
  if (!tournament) {
    throw new TournamentNotFoundError(`Tournament '${fixture.tournament_id}' not found.`);
  }

  // If match already created, return it
  if (fixture.match_id) {
    const existingMatch = await db.matches.get(fixture.match_id);
    if (existingMatch) {
      return { match: existingMatch, fixture };
    }
  }

  // Create match
  const match = await matchEngine.createMatch(
    {
      sport: tournament.sport,
      tournament_id: tournament.id,
      fixture_id: fixture.id,
    },
    db
  );

  // Create teams with fixture players
  await matchEngine.createTeams(
    match.id,
    {
      teams: [
        { label: 'Team A', player_ids: fixture.team_a_player_ids },
        { label: 'Team B', player_ids: fixture.team_b_player_ids },
      ],
    },
    db
  );

  // Update fixture and tournament status
  await db.fixtures.update(fixtureId, {
    match_id: match.id,
    status: 'in_progress',
  });

  if (tournament.status === 'upcoming') {
    await db.tournaments.update(tournament.id, { status: 'in_progress' });
  }

  const updatedFixture = await db.fixtures.get(fixtureId);
  const fullMatch = await matchEngine.getMatch(match.id, db);

  return { match: fullMatch, fixture: updatedFixture };
}

/**
 * Evaluates completed matches in a tournament, advances winners downstream, and computes standings
 */
export async function advanceTournament(tournamentId, db = defaultDb) {
  const tournament = await db.tournaments.get(tournamentId);
  if (!tournament) {
    throw new TournamentNotFoundError(`Tournament '${tournamentId}' not found.`);
  }

  const fixtures = await db.fixtures.where('tournament_id').equals(tournamentId).toArray();

  for (const f of fixtures) {
    if (!f.match_id) continue;

    const matchRecord = await db.matches.get(f.match_id);
    if (!matchRecord || matchRecord.status !== 'completed') continue;

    const result = await db.match_results.where('match_id').equals(f.match_id).first();
    const matchTeams = await db.teams.where('match_id').equals(f.match_id).toArray();

    // Determine winner team from match
    let winnerName = null;
    let winnerId = null;
    let winnerPlayers = [];

    if (result && result.winning_team_id) {
      const winTeam = matchTeams.find((t) => t.id === result.winning_team_id);
      if (winTeam) {
        if (winTeam.label === 'Team A' || winTeam.label === f.team_a_name) {
          winnerName = f.team_a_name;
          winnerId = f.team_a_id;
          winnerPlayers = f.team_a_player_ids;
        } else if (winTeam.label === 'Team B' || winTeam.label === f.team_b_name) {
          winnerName = f.team_b_name;
          winnerId = f.team_b_id;
          winnerPlayers = f.team_b_player_ids;
        }
      }
    }

    // Update current fixture if not already completed
    if (f.status !== 'completed') {
      await db.fixtures.update(f.id, {
        status: 'completed',
        winner_team_id: winnerId,
        winner_team_name: winnerName,
      });

      // Downstream Knockout Progression
      if (f.next_fixture_id && winnerId) {
        const nextFix = await db.fixtures.get(f.next_fixture_id);
        if (nextFix) {
          const updates = {};
          if (f.next_fixture_slot === 'team_a') {
            updates.team_a_id = winnerId;
            updates.team_a_name = winnerName;
            updates.team_a_player_ids = winnerPlayers;
          } else if (f.next_fixture_slot === 'team_b') {
            updates.team_b_id = winnerId;
            updates.team_b_name = winnerName;
            updates.team_b_player_ids = winnerPlayers;
          }

          const futureTeamA = updates.team_a_id || nextFix.team_a_id;
          const futureTeamB = updates.team_b_id || nextFix.team_b_id;
          if (futureTeamA && futureTeamB) {
            updates.status = 'ready';
          }

          await db.fixtures.update(nextFix.id, updates);
        }
      }
    }
  }

  // Check tournament completion
  const refreshedFixtures = await db.fixtures
    .where('tournament_id')
    .equals(tournamentId)
    .toArray();
  const allCompleted =
    refreshedFixtures.length > 0 && refreshedFixtures.every((f) => f.status === 'completed');

  if (allCompleted && tournament.status !== 'completed') {
    let championId = null;
    let championName = null;

    if (tournament.format === 'knockout') {
      const finalFixture = refreshedFixtures.find((f) => f.round_label === 'Final');
      if (finalFixture) {
        championId = finalFixture.winner_team_id;
        championName = finalFixture.winner_team_name;
      }
    } else {
      const standings = await calculateStandings(tournamentId, db);
      if (standings.length > 0) {
        championId = standings[0].team_id;
        championName = standings[0].team_name;
      }
    }

    await db.tournaments.update(tournamentId, {
      status: 'completed',
      winner_team_id: championId,
      winner_team_name: championName,
    });
  }

  return getTournamentDetails(tournamentId, db);
}

/**
 * Computes points table and standings for round robin / league tournaments
 */
export async function calculateStandings(tournamentId, db = defaultDb) {
  const tournament = await db.tournaments.get(tournamentId);
  if (!tournament) return [];

  const standingsMap = new Map();
  for (const t of tournament.teams || []) {
    standingsMap.set(t.id, {
      team_id: t.id,
      team_name: t.name,
      played: 0,
      won: 0,
      lost: 0,
      tied: 0,
      points: 0,
      scoreFor: 0,
      scoreAgainst: 0,
      scoreDiff: 0,
    });
  }

  const fixtures = await db.fixtures.where('tournament_id').equals(tournamentId).toArray();

  for (const f of fixtures) {
    if (!f.match_id || f.status !== 'completed') continue;

    const result = await db.match_results.where('match_id').equals(f.match_id).first();
    if (!result) continue;

    const stA = standingsMap.get(f.team_a_id);
    const stB = standingsMap.get(f.team_b_id);

    if (stA) stA.played++;
    if (stB) stB.played++;

    const scoreA = result.team_a_score || 0;
    const scoreB = result.team_b_score || 0;

    if (stA) {
      stA.scoreFor += scoreA;
      stA.scoreAgainst += scoreB;
      stA.scoreDiff = stA.scoreFor - stA.scoreAgainst;
    }
    if (stB) {
      stB.scoreFor += scoreB;
      stB.scoreAgainst += scoreA;
      stB.scoreDiff = stB.scoreFor - stB.scoreAgainst;
    }

    if (f.winner_team_id === f.team_a_id) {
      if (stA) {
        stA.won++;
        stA.points += 2;
      }
      if (stB) stB.lost++;
    } else if (f.winner_team_id === f.team_b_id) {
      if (stB) {
        stB.won++;
        stB.points += 2;
      }
      if (stA) stA.lost++;
    } else {
      // Tie
      if (stA) {
        stA.tied++;
        stA.points += 1;
      }
      if (stB) {
        stB.tied++;
        stB.points += 1;
      }
    }
  }

  const standings = Array.from(standingsMap.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.won !== a.won) return b.won - a.won;
    if (b.scoreDiff !== a.scoreDiff) return b.scoreDiff - a.scoreDiff;
    return b.scoreFor - a.scoreFor;
  });

  return standings.map((s, idx) => ({
    rank: idx + 1,
    ...s,
  }));
}

/**
 * Retrieves hydrated tournament details including fixtures, match statuses, and standings
 */
export async function getTournamentDetails(tournamentId, db = defaultDb) {
  const tournament = await db.tournaments.get(tournamentId);
  if (!tournament) {
    throw new TournamentNotFoundError(`Tournament '${tournamentId}' not found.`);
  }

  const rawFixtures = await db.fixtures.where('tournament_id').equals(tournamentId).toArray();

  // Sort fixtures by sequence
  rawFixtures.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

  // Hydrate fixtures with match records
  const fixtures = await Promise.all(
    rawFixtures.map(async (f) => {
      let match = null;
      if (f.match_id) {
        match = await db.matches.get(f.match_id);
        if (match) {
          const res = await db.match_results.where('match_id').equals(match.id).first();
          match.result = res || null;
        }
      }
      return {
        ...f,
        match,
      };
    })
  );

  const standings =
    tournament.format !== 'knockout' ? await calculateStandings(tournamentId, db) : [];

  const completedCount = fixtures.filter((f) => f.status === 'completed').length;
  const progressPercent =
    fixtures.length > 0 ? Math.round((completedCount / fixtures.length) * 100) : 0;

  return {
    ...tournament,
    fixtures,
    standings,
    totalFixtures: fixtures.length,
    completedFixtures: completedCount,
    progressPercent,
  };
}

/**
 * Lists all tournaments
 */
export async function listTournaments(filters = {}, db = defaultDb) {
  let tournaments = await db.tournaments.toArray();

  if (filters.sport) {
    tournaments = tournaments.filter((t) => t.sport === filters.sport);
  }
  if (filters.status) {
    tournaments = tournaments.filter((t) => t.status === filters.status);
  }

  tournaments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const detailed = await Promise.all(
    tournaments.map((t) => getTournamentDetails(t.id, db))
  );

  return {
    tournaments: detailed,
    total: detailed.length,
  };
}

/**
 * Deletes a tournament and its fixtures permanently, unlinking associated matches
 */
export async function deleteTournament(tournamentId, db = defaultDb) {
  const tournament = await db.tournaments.get(tournamentId);
  if (!tournament) {
    throw new TournamentNotFoundError(`Tournament '${tournamentId}' not found.`);
  }

  await db.transaction('rw', [db.tournaments, db.fixtures, db.matches], async () => {
    // 1. Delete all fixtures
    await db.fixtures.where('tournament_id').equals(tournamentId).delete();

    // 2. Unlink matches
    const matches = await db.matches.where('tournament_id').equals(tournamentId).toArray();
    for (const m of matches) {
      await db.matches.update(m.id, { tournament_id: null, fixture_id: null });
    }

    // 3. Delete tournament record
    await db.tournaments.delete(tournamentId);
  });

  return { success: true, tournamentId };
}
