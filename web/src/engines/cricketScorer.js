import { db as defaultDb } from '../db/db';
import { calculateMatchMvp } from './matchEngine';
import {
  MatchNotFoundError,
  MatchStateError,
  TeamValidationError,
  InningsClosedError,
  IllegalBowlerError,
  InvalidDeliveryError,
  CricketScorerError,
} from './errors';

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'id_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

/**
 * Formats balls into overs string (e.g., 10 legal balls -> "1.4")
 */
export function formatOvers(legalBalls) {
  const overs = Math.floor(legalBalls / 6);
  const balls = legalBalls % 6;
  return `${overs}.${balls}`;
}

/**
 * Calculates Run Rate
 */
export function calculateRunRate(runs, legalBalls) {
  if (!legalBalls || legalBalls === 0) return 0;
  return parseFloat(((runs / legalBalls) * 6).toFixed(2));
}

/**
 * Calculates Strike Rate
 */
export function calculateStrikeRate(runs, ballsFaced) {
  if (!ballsFaced || ballsFaced === 0) return 0;
  return parseFloat(((runs / ballsFaced) * 100).toFixed(1));
}

/**
 * Calculates Economy Rate
 */
export function calculateEconomy(runs, legalBalls) {
  if (!legalBalls || legalBalls === 0) return 0;
  return parseFloat(((runs / (legalBalls / 6))).toFixed(2));
}

/**
 * Initialize a cricket innings
 */
export async function initInnings(
  {
    matchId,
    battingTeamId,
    inningsNumber = 1,
    oversLimit = null,
    openingBatterId = null,
    openingBowlerId = null,
  },
  db = defaultDb
) {
  const match = await db.matches.get(matchId);
  if (!match) {
    throw new MatchNotFoundError(`Match '${matchId}' not found.`);
  }

  if (match.status === 'completed' || match.status === 'abandoned') {
    throw new MatchStateError(`Cannot start innings on a ${match.status} match.`);
  }

  const teams = await db.teams.where('match_id').equals(matchId).toArray();
  const battingTeam = teams.find((t) => t.id === battingTeamId);
  if (!battingTeam) {
    throw new TeamValidationError(`Team '${battingTeamId}' is not part of match '${matchId}'.`);
  }

  const bowlingTeam = teams.find((t) => t.id !== battingTeamId);

  // Check if this innings number already exists for match
  const existingInnings = await db.innings
    .where('match_id')
    .equals(matchId)
    .filter((inn) => inn.innings_number === inningsNumber)
    .first();

  if (existingInnings) {
    return getInningsState(existingInnings.id, db);
  }

  const battingPlayers = await db.team_players.where('team_id').equals(battingTeam.id).toArray();
  if (battingPlayers.length === 0) {
    throw new TeamValidationError(`Batting team has no players.`);
  }

  const selectedBatterId = openingBatterId || battingPlayers[0].player_id;
  let selectedBowlerId = openingBowlerId;

  if (bowlingTeam) {
    const bowlingPlayers = await db.team_players.where('team_id').equals(bowlingTeam.id).toArray();
    if (bowlingPlayers.length > 0 && !selectedBowlerId) {
      selectedBowlerId = bowlingPlayers[0].player_id;
    }
  }

  const inningsId = generateId();
  const now = new Date().toISOString();
  const isTest = match.cricket_format === 'test' || match.format === 'test';
  const effectiveOversLimit = isTest ? (oversLimit ? parseInt(oversLimit, 10) : 9999) : (parseInt(oversLimit, 10) || 5);

  const inningsRecord = {
    id: inningsId,
    match_id: matchId,
    batting_team_id: battingTeamId,
    innings_number: inningsNumber,
    overs_limit: effectiveOversLimit,
    total_runs: 0,
    total_wickets: 0,
    is_closed: false,
    is_declared: false,
    current_batter_id: selectedBatterId,
    current_bowler_id: selectedBowlerId || null,
    created_at: now,
  };

  await db.innings.add(inningsRecord);

  // If opening bowler is selected, initialize Over #1
  if (selectedBowlerId) {
    const overRecord = {
      id: generateId(),
      innings_id: inningsId,
      over_number: 1,
      bowler_id: selectedBowlerId,
      created_at: now,
    };
    await db.overs.add(overRecord);
  }

  return getInningsState(inningsId, db);
}

/**
 * Record a single ball delivery in the active innings
 */
export async function recordBall(
  {
    matchId,
    inningsId,
    runs = 0,
    extraType = 'none',
    extraRuns = 0,
    isWicket = false,
    dismissalType = null,
    dismissedPlayerId = null,
    nextBatterId = null,
    batterId = null,
    bowlerId = null,
  },
  db = defaultDb
) {
  const match = await db.matches.get(matchId);
  if (!match) throw new MatchNotFoundError(`Match '${matchId}' not found.`);

  if (match.status === 'completed' || match.status === 'abandoned') {
    throw new MatchStateError(`Cannot record ball: match is ${match.status}.`);
  }

  const innings = await db.innings.get(inningsId);
  if (!innings) throw new CricketScorerError(`Innings '${inningsId}' not found.`, 404);

  if (innings.is_closed) {
    throw new InningsClosedError('Innings is closed. Cannot score further deliveries.');
  }

  const validExtraTypes = ['none', 'wide', 'no_ball'];
  if (!validExtraTypes.includes(extraType)) {
    throw new InvalidDeliveryError(`Invalid extra_type '${extraType}'. Allowed: ${validExtraTypes.join(', ')}`);
  }

  const runsInt = Math.max(0, parseInt(runs, 10) || 0);
  const extraRunsInt = Math.max(0, parseInt(extraRuns, 10) || 0);

  // Find or determine the active over
  const allOvers = await db.overs.where('innings_id').equals(inningsId).toArray();
  allOvers.sort((a, b) => a.over_number - b.over_number);

  let currentOver = allOvers[allOvers.length - 1];

  if (!currentOver) {
    // If no over created yet, create Over #1
    const activeBowler = bowlerId || innings.current_bowler_id;
    if (!activeBowler) {
      throw new IllegalBowlerError('Bowler must be assigned before bowling an over.');
    }
    currentOver = {
      id: generateId(),
      innings_id: inningsId,
      over_number: 1,
      bowler_id: activeBowler,
      created_at: new Date().toISOString(),
    };
    await db.overs.add(currentOver);
  }

  // Count legal deliveries in current over
  const ballsInCurrentOver = await db.balls.where('over_id').equals(currentOver.id).toArray();
  const legalBallsInCurrentOver = ballsInCurrentOver.filter((b) => b.extra_type === 'none').length;

  if (legalBallsInCurrentOver >= 6) {
    throw new CricketScorerError('Current over is complete (6 legal balls). Please start the next over with a new bowler.');
  }

  const activeBatterId = batterId || innings.current_batter_id;
  if (!activeBatterId) {
    throw new InvalidDeliveryError('No active batter at the crease.');
  }

  const activeBowlerId = bowlerId || currentOver.bowler_id || innings.current_bowler_id;
  if (!activeBowlerId) {
    throw new IllegalBowlerError('No active bowler assigned.');
  }

  // Determine delivery runs
  let totalBallRuns = 0;
  if (extraType === 'wide') {
    // Wide: 1 penalty + extraRuns + any running runs
    totalBallRuns = 1 + extraRunsInt + runsInt;
  } else if (extraType === 'no_ball') {
    // No-ball: 1 penalty + runs off bat + extraRuns
    totalBallRuns = 1 + runsInt + extraRunsInt;
  } else {
    // Legal delivery
    totalBallRuns = runsInt;
  }

  // Batting team players for all-out checking
  const battingTeamPlayers = await db.team_players
    .where('team_id')
    .equals(innings.batting_team_id)
    .toArray();
  const totalBattersCount = battingTeamPlayers.length;

  // Wicket validation
  let newTotalWickets = innings.total_wickets;
  let isAllOut = false;
  let effectiveNextBatter = null;
  let effectiveDismissedPlayer = null;

  if (isWicket) {
    const validDismissalTypes = ['bowled', 'caught', 'run_out', 'lbw', 'stumped', 'other'];
    if (!dismissalType || !validDismissalTypes.includes(dismissalType)) {
      throw new InvalidDeliveryError(
        `Invalid dismissal_type '${dismissalType}'. Allowed: ${validDismissalTypes.join(', ')}`
      );
    }

    effectiveDismissedPlayer = dismissedPlayerId || activeBatterId;
    newTotalWickets = innings.total_wickets + 1;

    if (newTotalWickets >= totalBattersCount) {
      isAllOut = true;
      effectiveNextBatter = null;
    } else {
      // Find who already got out
      const priorBalls = await db.balls.where('innings_id').equals(inningsId).toArray();
      const dismissedIds = new Set(
        priorBalls.filter((b) => b.is_wicket && b.dismissed_player_id).map((b) => b.dismissed_player_id)
      );
      dismissedIds.add(effectiveDismissedPlayer);

      if (nextBatterId) {
        const isTeamMember = battingTeamPlayers.some((tp) => tp.player_id === nextBatterId);
        if (!isTeamMember) {
          throw new TeamValidationError(`Player '${nextBatterId}' does not belong to the batting team.`);
        }
        if (dismissedIds.has(nextBatterId)) {
          throw new InvalidDeliveryError(`Player '${nextBatterId}' has already been dismissed.`);
        }
        effectiveNextBatter = nextBatterId;
      } else {
        // Auto-select first available remaining batter
        const available = battingTeamPlayers.find((tp) => !dismissedIds.has(tp.player_id));
        effectiveNextBatter = available ? available.player_id : null;
      }
    }
  }

  const newTotalRuns = innings.total_runs + totalBallRuns;
  const now = new Date().toISOString();

  // Create Ball record
  const ballRecord = {
    id: generateId(),
    over_id: currentOver.id,
    innings_id: inningsId,
    ball_number: ballsInCurrentOver.length + 1,
    runs: runsInt,
    extra_type: extraType,
    extra_runs: extraRunsInt,
    is_wicket: !!isWicket,
    dismissal_type: isWicket ? dismissalType : null,
    batter_id: activeBatterId,
    dismissed_player_id: effectiveDismissedPlayer,
    next_batter_id: effectiveNextBatter,
    created_at: now,
  };

  await db.balls.add(ballRecord);

  // Count total legal balls bowled in entire innings
  const allInningsBalls = await db.balls.where('innings_id').equals(inningsId).toArray();
  const totalLegalBallsInInnings = allInningsBalls.filter((b) => b.extra_type === 'none').length;

  let shouldCloseInnings = false;
  let matchCompleted = false;
  let winningTeamId = null;
  let matchEndReason = null;

  const isTest = match.cricket_format === 'test' || match.format === 'test';

  // Check if all out
  if (isAllOut) {
    shouldCloseInnings = true;
  }

  // Check overs limit (for limited overs)
  if (!isTest) {
    const maxLegalBalls = innings.overs_limit * 6;
    if (totalLegalBallsInInnings >= maxLegalBalls) {
      shouldCloseInnings = true;
    }

    // 2nd Innings Target & Chase Logic
    if (innings.innings_number === 2) {
      const innings1 = await db.innings
        .where('match_id')
        .equals(matchId)
        .filter((inn) => inn.innings_number === 1)
        .first();

      const targetRuns = (innings1?.total_runs ?? 0) + 1;

      if (newTotalRuns >= targetRuns) {
        // Chasing team won!
        shouldCloseInnings = true;
        matchCompleted = true;
        winningTeamId = innings.batting_team_id;
        matchEndReason = 'completed';
      } else if (shouldCloseInnings) {
        // 2nd innings ended (all out or overs finished) without reaching target
        matchCompleted = true;
        matchEndReason = 'completed';
        if (newTotalRuns === (innings1?.total_runs ?? 0)) {
          // Tied match
          winningTeamId = null;
        } else {
          // 1st batting team won
          winningTeamId = innings1.batting_team_id;
        }
      }
    }
  } else {
    // ─── Test Match Logic ─────────────────────────────────────────
    if (innings.innings_number === 3 && shouldCloseInnings) {
      // Innings defeat check:
      // Innings 1 (Team A), Innings 2 (Team B), Innings 3 (Team A)
      const allInns = await db.innings.where('match_id').equals(matchId).toArray();
      const inn1 = allInns.find((i) => i.innings_number === 1);
      const inn2 = allInns.find((i) => i.innings_number === 2);
      const teamATotal = (inn1?.total_runs ?? 0) + newTotalRuns;
      const teamBTotal = inn2?.total_runs ?? 0;

      if (teamATotal <= teamBTotal) {
        // Team B won by an innings!
        matchCompleted = true;
        winningTeamId = inn2.batting_team_id;
        matchEndReason = 'completed';
      }
    } else if (innings.innings_number === 4) {
      // 4th Innings Chase:
      const allInns = await db.innings.where('match_id').equals(matchId).toArray();
      const inn1 = allInns.find((i) => i.innings_number === 1);
      const inn2 = allInns.find((i) => i.innings_number === 2);
      const inn3 = allInns.find((i) => i.innings_number === 3);

      const teamATotal = (inn1?.total_runs ?? 0) + (inn3?.total_runs ?? 0);
      const teamBInn1 = inn2?.total_runs ?? 0;
      const targetRuns = (teamATotal - teamBInn1) + 1;

      if (newTotalRuns >= targetRuns) {
        // Team B chased down target in 4th innings!
        shouldCloseInnings = true;
        matchCompleted = true;
        winningTeamId = innings.batting_team_id;
        matchEndReason = 'completed';
      } else if (shouldCloseInnings) {
        // 4th innings ended (all out)
        matchCompleted = true;
        matchEndReason = 'completed';
        if (newTotalRuns === targetRuns - 1) {
          winningTeamId = null; // Tie!
        } else if (newTotalRuns < targetRuns - 1) {
          winningTeamId = inn1.batting_team_id; // Team A won by runs!
        }
      }
    }
  }

  // Update Innings record
  await db.innings.update(inningsId, {
    total_runs: newTotalRuns,
    total_wickets: newTotalWickets,
    current_batter_id: isWicket ? effectiveNextBatter : activeBatterId,
    current_bowler_id: activeBowlerId,
    is_closed: shouldCloseInnings,
  });

  if (matchCompleted) {
    const teams = await db.teams.where('match_id').equals(matchId).toArray();
    const teamA = teams.find((t) => t.label === 'Team A');

    const allInns = await db.innings.where('match_id').equals(matchId).toArray();
    const teamAInnings = allInns.filter((inn) => inn.batting_team_id === teamA?.id);
    const teamBInnings = allInns.filter((inn) => inn.batting_team_id !== teamA?.id);

    const scoreA = teamAInnings.reduce((acc, inn) => acc + (inn.total_runs || 0), 0);
    const scoreB = teamBInnings.reduce((acc, inn) => acc + (inn.total_runs || 0), 0);

    const existingResult = await db.match_results.where('match_id').equals(matchId).first();
    if (existingResult) {
      await db.match_results.update(existingResult.id, {
        winning_team_id: winningTeamId,
        team_a_score: scoreA,
        team_b_score: scoreB,
      });
    } else {
      await db.match_results.add({
        id: generateId(),
        match_id: matchId,
        winning_team_id: winningTeamId,
        team_a_score: scoreA,
        team_b_score: scoreB,
      });
    }

    const mvp = await calculateMatchMvp(matchId, db);

    await db.matches.update(matchId, {
      status: 'completed',
      end_reason: matchEndReason,
      player_of_match_id: mvp.playerOfMatchId || null,
    });
  }

  return getInningsState(inningsId, db);
}

/**
 * Start the next over with a new bowler
 */
export async function startNextOver({ inningsId, bowlerId }, db = defaultDb) {
  const innings = await db.innings.get(inningsId);
  if (!innings) throw new CricketScorerError(`Innings '${inningsId}' not found.`, 404);

  if (innings.is_closed) {
    throw new InningsClosedError('Innings is closed. Cannot start a new over.');
  }

  const match = await db.matches.get(innings.match_id);
  if (match.status === 'completed' || match.status === 'abandoned') {
    throw new MatchStateError(`Cannot start over on a ${match.status} match.`);
  }

  const teams = await db.teams.where('match_id').equals(innings.match_id).toArray();
  const bowlingTeam = teams.find((t) => t.id !== innings.batting_team_id);
  if (!bowlingTeam) throw new TeamValidationError('Bowling team not found.');

  const bowlingPlayers = await db.team_players.where('team_id').equals(bowlingTeam.id).toArray();
  const isBowlerInTeam = bowlingPlayers.some((tp) => tp.player_id === bowlerId);
  if (!isBowlerInTeam) {
    throw new TeamValidationError(`Player '${bowlerId}' does not belong to the bowling team.`);
  }

  // Get previous over
  const allOvers = await db.overs.where('innings_id').equals(inningsId).toArray();
  allOvers.sort((a, b) => a.over_number - b.over_number);
  const lastOver = allOvers[allOvers.length - 1];

  if (lastOver) {
    const lastOverBalls = await db.balls.where('over_id').equals(lastOver.id).toArray();
    const legalBallsInLastOver = lastOverBalls.filter((b) => b.extra_type === 'none').length;
    if (legalBallsInLastOver < 6) {
      throw new CricketScorerError(
        `Previous over is not complete yet (${legalBallsInLastOver}/6 legal balls).`
      );
    }

    // Check consecutive bowler restriction (if bowling team has more than 1 player)
    if (bowlingPlayers.length > 1 && lastOver.bowler_id === bowlerId) {
      throw new IllegalBowlerError('Same bowler cannot bowl consecutive overs.');
    }
  }

  const nextOverNumber = lastOver ? lastOver.over_number + 1 : 1;
  const newOverRecord = {
    id: generateId(),
    innings_id: inningsId,
    over_number: nextOverNumber,
    bowler_id: bowlerId,
    created_at: new Date().toISOString(),
  };

  await db.overs.add(newOverRecord);
  await db.innings.update(inningsId, { current_bowler_id: bowlerId });

  return getInningsState(inningsId, db);
}

/**
 * Switch / Start Next innings (Supports Limited Overs 1..2 and Test Match 1..4)
 */
export async function switchInnings(
  { matchId, nextBattingTeamId, openingBatterId = null, openingBowlerId = null },
  db = defaultDb
) {
  const match = await db.matches.get(matchId);
  if (!match) throw new MatchNotFoundError(`Match '${matchId}' not found.`);

  if (match.status === 'completed' || match.status === 'abandoned') {
    throw new MatchStateError(`Cannot switch innings on a ${match.status} match.`);
  }

  const isTest = match.cricket_format === 'test' || match.format === 'test';
  const allInnings = await db.innings.where('match_id').equals(matchId).toArray();
  allInnings.sort((a, b) => a.innings_number - b.innings_number);

  if (allInnings.length === 0) {
    throw new CricketScorerError('Innings 1 has not been created yet.');
  }

  const latestInnings = allInnings[allInnings.length - 1];
  if (!latestInnings.is_closed) {
    // Automatically close previous innings if switching
    await db.innings.update(latestInnings.id, { is_closed: true });
  }

  const maxInnings = isTest ? 4 : 2;
  const nextInningsNumber = allInnings.length + 1;

  if (nextInningsNumber > maxInnings) {
    throw new CricketScorerError(`Match already reached maximum innings (${maxInnings}).`);
  }

  const teams = await db.teams.where('match_id').equals(matchId).toArray();
  const targetBattingTeamId =
    nextBattingTeamId || teams.find((t) => t.id !== latestInnings.batting_team_id)?.id;

  return initInnings(
    {
      matchId,
      battingTeamId: targetBattingTeamId,
      inningsNumber: nextInningsNumber,
      oversLimit: isTest ? null : allInnings[0].overs_limit,
      openingBatterId,
      openingBowlerId,
    },
    db
  );
}

/**
 * Manually declare an innings in progress (Test match or casual match)
 */
export async function declareInnings({ matchId, inningsId }, db = defaultDb) {
  const match = await db.matches.get(matchId);
  if (!match) throw new MatchNotFoundError(`Match '${matchId}' not found.`);
  if (match.status === 'completed' || match.status === 'abandoned') {
    throw new MatchStateError(`Cannot declare on a ${match.status} match.`);
  }

  const innings = await db.innings.get(inningsId);
  if (!innings) throw new CricketScorerError(`Innings '${inningsId}' not found.`, 404);
  if (innings.is_closed) {
    throw new InningsClosedError('Innings is already closed.');
  }

  await db.innings.update(inningsId, {
    is_closed: true,
    is_declared: true,
  });

  const isTest = match.cricket_format === 'test' || match.format === 'test';
  let matchCompleted = false;
  let winningTeamId = null;
  let matchEndReason = null;

  if (isTest) {
    if (innings.innings_number === 3) {
      // Innings defeat check
      const allInns = await db.innings.where('match_id').equals(matchId).toArray();
      const inn1 = allInns.find((i) => i.innings_number === 1);
      const inn2 = allInns.find((i) => i.innings_number === 2);
      const teamATotal = (inn1?.total_runs ?? 0) + innings.total_runs;
      const teamBTotal = inn2?.total_runs ?? 0;

      if (teamATotal <= teamBTotal) {
        matchCompleted = true;
        winningTeamId = inn2.batting_team_id;
        matchEndReason = 'completed';
      }
    } else if (innings.innings_number === 4) {
      const allInns = await db.innings.where('match_id').equals(matchId).toArray();
      const inn1 = allInns.find((i) => i.innings_number === 1);
      const inn2 = allInns.find((i) => i.innings_number === 2);
      const inn3 = allInns.find((i) => i.innings_number === 3);

      const teamATotal = (inn1?.total_runs ?? 0) + (inn3?.total_runs ?? 0);
      const teamBInn1 = inn2?.total_runs ?? 0;
      const targetRuns = (teamATotal - teamBInn1) + 1;

      matchCompleted = true;
      matchEndReason = 'completed';
      if (innings.total_runs === targetRuns - 1) {
        winningTeamId = null; // Tie
      } else if (innings.total_runs < targetRuns - 1) {
        winningTeamId = inn1.batting_team_id; // Team A
      } else {
        winningTeamId = innings.batting_team_id; // Team B
      }
    }
  }

  if (matchCompleted) {
    const teams = await db.teams.where('match_id').equals(matchId).toArray();
    const teamA = teams.find((t) => t.label === 'Team A');

    const allInns = await db.innings.where('match_id').equals(matchId).toArray();
    const teamAInnings = allInns.filter((inn) => inn.batting_team_id === teamA?.id);
    const teamBInnings = allInns.filter((inn) => inn.batting_team_id !== teamA?.id);

    const scoreA = teamAInnings.reduce((acc, inn) => acc + (inn.total_runs || 0), 0);
    const scoreB = teamBInnings.reduce((acc, inn) => acc + (inn.total_runs || 0), 0);

    const existingResult = await db.match_results.where('match_id').equals(matchId).first();
    if (existingResult) {
      await db.match_results.update(existingResult.id, {
        winning_team_id: winningTeamId,
        team_a_score: scoreA,
        team_b_score: scoreB,
      });
    } else {
      await db.match_results.add({
        id: generateId(),
        match_id: matchId,
        winning_team_id: winningTeamId,
        team_a_score: scoreA,
        team_b_score: scoreB,
      });
    }

    const mvp = await calculateMatchMvp(matchId, db);

    await db.matches.update(matchId, {
      status: 'completed',
      end_reason: matchEndReason,
      player_of_match_id: mvp.playerOfMatchId || null,
    });
  }

  return getInningsState(inningsId, db);
}

/**
 * End match as Draw (e.g. Test match time expired or called off)
 */
export async function endMatchAsDraw(matchId, db = defaultDb) {
  const match = await db.matches.get(matchId);
  if (!match) throw new MatchNotFoundError(`Match '${matchId}' not found.`);

  // Close any open innings
  const allInns = await db.innings.where('match_id').equals(matchId).toArray();
  for (const inn of allInns) {
    if (!inn.is_closed) {
      await db.innings.update(inn.id, { is_closed: true });
    }
  }

  const teams = await db.teams.where('match_id').equals(matchId).toArray();
  const teamA = teams.find((t) => t.label === 'Team A');

  const teamAInnings = allInns.filter((inn) => inn.batting_team_id === teamA?.id);
  const teamBInnings = allInns.filter((inn) => inn.batting_team_id !== teamA?.id);

  const scoreA = teamAInnings.reduce((acc, inn) => acc + (inn.total_runs || 0), 0);
  const scoreB = teamBInnings.reduce((acc, inn) => acc + (inn.total_runs || 0), 0);

  const existingResult = await db.match_results.where('match_id').equals(matchId).first();
  if (existingResult) {
    await db.match_results.update(existingResult.id, {
      winning_team_id: null,
      team_a_score: scoreA,
      team_b_score: scoreB,
    });
  } else {
    await db.match_results.add({
      id: generateId(),
      match_id: matchId,
      winning_team_id: null,
      team_a_score: scoreA,
      team_b_score: scoreB,
    });
  }

  const mvp = await calculateMatchMvp(matchId, db);

  await db.matches.update(matchId, {
    status: 'completed',
    end_reason: 'draw',
    player_of_match_id: mvp.playerOfMatchId || null,
  });

  return getMatchScorecard(matchId, db);
}

/**
 * Undo the most recent ball delivery safely
 */
export async function undoLastBall({ matchId, inningsId }, db = defaultDb) {
  let targetInnings = null;
  if (inningsId) {
    targetInnings = await db.innings.get(inningsId);
  } else if (matchId) {
    const allInnings = await db.innings.where('match_id').equals(matchId).toArray();
    allInnings.sort((a, b) => b.innings_number - a.innings_number);
    targetInnings = allInnings[0];
  }

  if (!targetInnings) {
    throw new CricketScorerError('No innings found to undo.');
  }

  const innId = targetInnings.id;
  const match = await db.matches.get(targetInnings.match_id);

  // Find all balls in this innings sorted by created_at
  const allBalls = await db.balls.where('innings_id').equals(innId).toArray();
  if (allBalls.length === 0) {
    throw new CricketScorerError('No deliveries found in this innings to undo.');
  }

  allBalls.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  const lastBall = allBalls[allBalls.length - 1];

  // If match was completed, roll it back to live
  if (match && match.status === 'completed') {
    await db.matches.update(match.id, {
      status: 'live',
      end_reason: null,
    });
    // Remove match result if present
    const res = await db.match_results.where('match_id').equals(match.id).first();
    if (res) {
      await db.match_results.delete(res.id);
    }
  }

  // Delete the ball
  await db.balls.delete(lastBall.id);

  // If the over that held this ball is now empty (and not Over 1), clean it up
  const overBalls = await db.balls.where('over_id').equals(lastBall.over_id).toArray();
  if (overBalls.length === 0) {
    const overRecord = await db.overs.get(lastBall.over_id);
    if (overRecord && overRecord.over_number > 1) {
      await db.overs.delete(lastBall.over_id);
    }
  }

  // Recalculate innings total_runs and total_wickets from remaining balls
  const remainingBalls = allBalls.slice(0, allBalls.length - 1);
  let recomputedRuns = 0;
  let recomputedWickets = 0;

  for (const b of remainingBalls) {
    if (b.extra_type === 'wide') {
      recomputedRuns += 1 + (b.extra_runs || 0) + (b.runs || 0);
    } else if (b.extra_type === 'no_ball') {
      recomputedRuns += 1 + (b.runs || 0) + (b.extra_runs || 0);
    } else {
      recomputedRuns += (b.runs || 0);
    }

    if (b.is_wicket) {
      recomputedWickets += 1;
    }
  }

  // Restore current striker: the striker who faced the undone ball!
  const restoredBatterId = lastBall.batter_id;

  // Active bowler: from the current active over
  const remainingOvers = await db.overs.where('innings_id').equals(innId).toArray();
  remainingOvers.sort((a, b) => a.over_number - b.over_number);
  const activeOver = remainingOvers[remainingOvers.length - 1];
  const restoredBowlerId = activeOver ? activeOver.bowler_id : targetInnings.current_bowler_id;

  await db.innings.update(innId, {
    total_runs: recomputedRuns,
    total_wickets: recomputedWickets,
    is_closed: false,
    current_batter_id: restoredBatterId,
    current_bowler_id: restoredBowlerId,
  });

  return getInningsState(innId, db);
}

/**
 * Manually change the active striker
 */
export async function changeBatter({ inningsId, batterId }, db = defaultDb) {
  const innings = await db.innings.get(inningsId);
  if (!innings) throw new CricketScorerError(`Innings '${inningsId}' not found.`, 404);

  const battingPlayers = await db.team_players
    .where('team_id')
    .equals(innings.batting_team_id)
    .toArray();
  const isMember = battingPlayers.some((tp) => tp.player_id === batterId);
  if (!isMember) {
    throw new TeamValidationError(`Player '${batterId}' is not in the batting team.`);
  }

  await db.innings.update(inningsId, { current_batter_id: batterId });
  return getInningsState(inningsId, db);
}

/**
 * Manually change current over bowler
 */
export async function changeBowler({ inningsId, bowlerId }, db = defaultDb) {
  const innings = await db.innings.get(inningsId);
  if (!innings) throw new CricketScorerError(`Innings '${inningsId}' not found.`, 404);

  const teams = await db.teams.where('match_id').equals(innings.match_id).toArray();
  const bowlingTeam = teams.find((t) => t.id !== innings.batting_team_id);
  const bowlingPlayers = await db.team_players
    .where('team_id')
    .equals(bowlingTeam?.id)
    .toArray();
  const isMember = bowlingPlayers.some((tp) => tp.player_id === bowlerId);
  if (!isMember) {
    throw new TeamValidationError(`Player '${bowlerId}' does not belong to the bowling team.`);
  }

  const allOvers = await db.overs.where('innings_id').equals(inningsId).toArray();
  allOvers.sort((a, b) => a.over_number - b.over_number);
  const activeOver = allOvers[allOvers.length - 1];

  if (activeOver) {
    await db.overs.update(activeOver.id, { bowler_id: bowlerId });
  }
  await db.innings.update(inningsId, { current_bowler_id: bowlerId });

  return getInningsState(inningsId, db);
}

/**
 * Reconstructs detailed innings state with batting/bowling cards, overs, and target equation
 */
export async function getInningsState(inningsId, db = defaultDb) {
  const innings = await db.innings.get(inningsId);
  if (!innings) return null;

  const match = await db.matches.get(innings.match_id);
  const teams = await db.teams.where('match_id').equals(innings.match_id).toArray();
  const battingTeam = teams.find((t) => t.id === innings.batting_team_id);
  const bowlingTeam = teams.find((t) => t.id !== innings.batting_team_id);

  // Fetch players
  const battingTeamPlayers = await db.team_players
    .where('team_id')
    .equals(innings.batting_team_id)
    .toArray();
  const bowlingTeamPlayers = bowlingTeam
    ? await db.team_players.where('team_id').equals(bowlingTeam.id).toArray()
    : [];

  const allPlayerIds = [
    ...battingTeamPlayers.map((tp) => tp.player_id),
    ...bowlingTeamPlayers.map((tp) => tp.player_id),
  ];

  const playerRecords = await Promise.all(allPlayerIds.map((id) => db.players.get(id)));
  const playerMap = new Map();
  playerRecords.filter(Boolean).forEach((p) => playerMap.set(p.id, p));

  // Fetch all overs & balls for this innings
  const overs = await db.overs.where('innings_id').equals(inningsId).toArray();
  overs.sort((a, b) => a.over_number - b.over_number);

  const balls = await db.balls.where('innings_id').equals(inningsId).toArray();
  balls.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

  // Build Batting Scorecard
  const battingStats = new Map();
  battingTeamPlayers.forEach((tp) => {
    battingStats.set(tp.player_id, {
      id: tp.player_id,
      player: playerMap.get(tp.player_id) || { id: tp.player_id, name: 'Unknown' },
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      strikeRate: 0,
      isOut: false,
      dismissalType: null,
      dismissedBy: null,
      status: 'yet_to_bat', // 'batting' | 'out' | 'yet_to_bat'
    });
  });

  // Build Bowling Scorecard
  const bowlingStats = new Map();
  bowlingTeamPlayers.forEach((tp) => {
    bowlingStats.set(tp.player_id, {
      id: tp.player_id,
      player: playerMap.get(tp.player_id) || { id: tp.player_id, name: 'Unknown' },
      legalBalls: 0,
      oversFormatted: '0.0',
      maidens: 0,
      runs: 0,
      wickets: 0,
      economy: 0,
      hasBowled: false,
    });
  });

  const fallOfWickets = [];
  let runningRuns = 0;
  let runningWickets = 0;
  let runningLegalBalls = 0;
  let widesCount = 0;
  let noBallsCount = 0;

  // Process all balls
  balls.forEach((ball) => {
    const isLegal = ball.extra_type === 'none';
    if (isLegal) runningLegalBalls += 1;

    let ballRuns = 0;
    if (ball.extra_type === 'wide') {
      widesCount += 1 + (ball.extra_runs || 0) + (ball.runs || 0);
      ballRuns = 1 + (ball.extra_runs || 0) + (ball.runs || 0);
    } else if (ball.extra_type === 'no_ball') {
      noBallsCount += 1 + (ball.extra_runs || 0);
      ballRuns = 1 + (ball.runs || 0) + (ball.extra_runs || 0);
    } else {
      ballRuns = ball.runs;
    }

    runningRuns += ballRuns;

    // Batter stats
    const batter = battingStats.get(ball.batter_id);
    if (batter) {
      batter.status = 'batting';
      if (ball.extra_type !== 'wide') {
        batter.balls += 1;
        batter.runs += ball.runs;
        if (ball.runs === 4) batter.fours += 1;
        if (ball.runs === 6) batter.sixes += 1;
      }
    }

    // Over & Bowler
    const overObj = overs.find((o) => o.id === ball.over_id);
    const bowlerId = overObj?.bowler_id;
    if (bowlerId) {
      let bStats = bowlingStats.get(bowlerId);
      if (!bStats) {
        bStats = {
          id: bowlerId,
          player: playerMap.get(bowlerId) || { id: bowlerId, name: 'Unknown' },
          legalBalls: 0,
          oversFormatted: '0.0',
          maidens: 0,
          runs: 0,
          wickets: 0,
          economy: 0,
          hasBowled: true,
        };
        bowlingStats.set(bowlerId, bStats);
      }
      bStats.hasBowled = true;
      if (isLegal) bStats.legalBalls += 1;
      bStats.runs += ballRuns;
      if (ball.is_wicket && ball.dismissal_type !== 'run_out') {
        bStats.wickets += 1;
      }
    }

    // Wicket stats
    if (ball.is_wicket) {
      runningWickets += 1;
      const dismissedId = ball.dismissed_player_id || ball.batter_id;
      const dismissedBatter = battingStats.get(dismissedId);
      if (dismissedBatter) {
        dismissedBatter.isOut = true;
        dismissedBatter.status = 'out';
        dismissedBatter.dismissalType = ball.dismissal_type;
        dismissedBatter.dismissedBy = bowlerId ? (playerMap.get(bowlerId)?.name || 'Bowler') : null;
      }

      fallOfWickets.push({
        wicketNumber: runningWickets,
        score: runningRuns,
        overs: formatOvers(runningLegalBalls),
        batterName: dismissedBatter?.player?.name || 'Batter',
      });
    }
  });

  // Calculate maidens per over
  overs.forEach((ov) => {
    const ovBalls = balls.filter((b) => b.over_id === ov.id);
    const legalCount = ovBalls.filter((b) => b.extra_type === 'none').length;
    let ovRuns = 0;
    ovBalls.forEach((b) => {
      if (b.extra_type === 'wide') ovRuns += 1 + (b.extra_runs || 0) + (b.runs || 0);
      else if (b.extra_type === 'no_ball') ovRuns += 1 + (b.runs || 0) + (b.extra_runs || 0);
      else ovRuns += b.runs;
    });

    if (legalCount === 6 && ovRuns === 0) {
      const bStats = bowlingStats.get(ov.bowler_id);
      if (bStats) bStats.maidens += 1;
    }
  });

  // Finalize stats calculations
  battingStats.forEach((b) => {
    b.strikeRate = calculateStrikeRate(b.runs, b.balls);
    if (!b.isOut && b.id === innings.current_batter_id && !innings.is_closed) {
      b.status = 'batting';
    }
  });

  bowlingStats.forEach((b) => {
    b.oversFormatted = formatOvers(b.legalBalls);
    b.economy = calculateEconomy(b.runs, b.legalBalls);
  });

  // Active Over and Ball Deliveries
  const activeOver = overs[overs.length - 1] || null;
  const activeOverBalls = activeOver ? balls.filter((b) => b.over_id === activeOver.id) : [];
  const activeOverLegalBalls = activeOverBalls.filter((b) => b.extra_type === 'none').length;

  // Hydrated active batter & bowler
  const currentBatterStats = innings.current_batter_id
    ? battingStats.get(innings.current_batter_id) || null
    : null;

  const currentBowlerId = activeOver?.bowler_id || innings.current_bowler_id;
  const currentBowlerStats = currentBowlerId ? bowlingStats.get(currentBowlerId) || null : null;

  // Chase / Target Info
  let targetInfo = null;
  const isTest = match?.cricket_format === 'test' || match?.format === 'test';

  if (!isTest) {
    if (innings.innings_number === 2) {
      const inn1 = await db.innings
        .where('match_id')
        .equals(innings.match_id)
        .filter((inn) => inn.innings_number === 1)
        .first();

      const targetRuns = (inn1?.total_runs ?? 0) + 1;
      const runsNeeded = targetRuns - runningRuns;
      const maxLegalBalls = innings.overs_limit * 6;
      const ballsRemaining = Math.max(0, maxLegalBalls - runningLegalBalls);
      const requiredRunRate =
        ballsRemaining > 0 ? parseFloat(((runsNeeded / ballsRemaining) * 6).toFixed(2)) : 0;

      targetInfo = {
        targetRuns,
        runsNeeded,
        ballsRemaining,
        requiredRunRate,
        inn1TotalRuns: inn1?.total_runs ?? 0,
        inn1TotalWickets: inn1?.total_wickets ?? 0,
        inn1Overs: inn1
          ? formatOvers(
              balls.filter((b) => b.innings_id === inn1.id && b.extra_type === 'none').length
            )
          : '0.0',
      };
    }
  } else {
    // Test match target / lead / trail info
    const allInns = await db.innings.where('match_id').equals(innings.match_id).toArray();
    const inn1 = allInns.find((i) => i.innings_number === 1);
    const inn2 = allInns.find((i) => i.innings_number === 2);
    const inn3 = allInns.find((i) => i.innings_number === 3);

    if (innings.innings_number === 2 && inn1) {
      const diff = runningRuns - inn1.total_runs;
      const trailOrLead =
        diff > 0
          ? `Lead by ${diff} run${diff !== 1 ? 's' : ''}`
          : diff < 0
          ? `Trail by ${Math.abs(diff)} run${Math.abs(diff) !== 1 ? 's' : ''}`
          : 'Scores level';

      targetInfo = {
        isTest: true,
        diff,
        trailOrLead,
        inn1TotalRuns: inn1.total_runs,
      };
    } else if (innings.innings_number === 3 && inn1 && inn2) {
      const teamATotal = inn1.total_runs + runningRuns;
      const diff = teamATotal - inn2.total_runs;
      const trailOrLead =
        diff > 0
          ? `Lead by ${diff} run${diff !== 1 ? 's' : ''}`
          : diff < 0
          ? `Trail by ${Math.abs(diff)} run${Math.abs(diff) !== 1 ? 's' : ''}`
          : 'Scores level';

      targetInfo = {
        isTest: true,
        diff,
        trailOrLead,
        teamATotal,
        teamBTotal: inn2.total_runs,
      };
    } else if (innings.innings_number === 4 && inn1 && inn2 && inn3) {
      const teamATotal = inn1.total_runs + inn3.total_runs;
      const targetRuns = teamATotal - inn2.total_runs + 1;
      const runsNeeded = targetRuns - runningRuns;
      const wicketsInHand = Math.max(0, battingTeamPlayers.length - runningWickets);

      targetInfo = {
        isTest: true,
        isFourthInnings: true,
        targetRuns,
        runsNeeded,
        wicketsInHand,
        teamATotal,
      };
    }
  }

  // Delivery chips representation
  const overDeliveryChips = activeOverBalls.map((b) => {
    let label = `${b.runs}`;
    let isBoundary = b.runs === 4;
    let isSix = b.runs === 6;
    let isExtra = b.extra_type !== 'none';

    if (b.extra_type === 'wide') {
      label = b.runs > 0 || b.extra_runs > 0 ? `Wd+${b.runs + b.extra_runs}` : 'Wd';
    } else if (b.extra_type === 'no_ball') {
      label = b.runs > 0 ? `Nb+${b.runs}` : 'Nb';
    }

    if (b.is_wicket) {
      label = 'W';
    }

    return {
      id: b.id,
      label,
      runs: b.runs,
      extraType: b.extra_type,
      extraRuns: b.extra_runs,
      isWicket: b.is_wicket,
      isBoundary,
      isSix,
      isExtra,
    };
  });

  return {
    innings: {
      ...innings,
      total_runs: runningRuns,
      total_wickets: runningWickets,
    },
    match,
    battingTeam,
    bowlingTeam,
    totalRuns: runningRuns,
    totalWickets: runningWickets,
    legalBallsBowled: runningLegalBalls,
    oversFormatted: formatOvers(runningLegalBalls),
    oversLimit: innings.overs_limit,
    currentRunRate: calculateRunRate(runningRuns, runningLegalBalls),
    isOverComplete: activeOverLegalBalls >= 6,
    legalBallsInCurrentOver: activeOverLegalBalls,
    activeOverNumber: activeOver?.over_number || 1,
    activeOverBowler: currentBowlerStats?.player || null,
    overDeliveryChips,
    currentBatter: currentBatterStats,
    currentBowler: currentBowlerStats,
    battingScorecard: Array.from(battingStats.values()),
    bowlingScorecard: Array.from(bowlingStats.values()).filter((b) => b.hasBowled),
    fallOfWickets,
    extras: {
      wides: widesCount,
      noBalls: noBallsCount,
      totalExtras: widesCount + noBallsCount,
    },
    recentBalls: balls.slice(-12).reverse(),
    targetInfo,
    isAllOut: runningWickets >= battingTeamPlayers.length,
    isInningsClosed: innings.is_closed,
    isMatchCompleted: match?.status === 'completed',
  };
}

/**
 * Reconstructs complete match scorecard including both innings
 */
export async function getMatchScorecard(matchId, db = defaultDb) {
  const match = await db.matches.get(matchId);
  if (!match) throw new MatchNotFoundError(`Match '${matchId}' not found.`);

  const teams = await db.teams.where('match_id').equals(matchId).toArray();
  const hydratedTeams = await Promise.all(
    teams.map(async (t) => {
      const tps = await db.team_players.where('team_id').equals(t.id).toArray();
      const players = await Promise.all(
        tps.map(async (tp) => {
          const p = await db.players.get(tp.player_id);
          return { ...tp, player: p };
        })
      );
      return { ...t, players };
    })
  );

  const allInnings = await db.innings.where('match_id').equals(matchId).toArray();
  allInnings.sort((a, b) => a.innings_number - b.innings_number);

  const inningsStates = await Promise.all(allInnings.map((inn) => getInningsState(inn.id, db)));

  const result = await db.match_results.where('match_id').equals(matchId).first();
  const winner = result?.winning_team_id
    ? hydratedTeams.find((t) => t.id === result.winning_team_id) || null
    : null;

  // Build match result summary string
  let resultSummary = '';
  const isTest = match.cricket_format === 'test' || match.format === 'test';

  if (match.status === 'completed') {
    if (match.end_reason === 'draw') {
      resultSummary = 'Match Drawn';
    } else if (result && winner) {
      if (!isTest) {
        const inn1 = inningsStates.find((i) => i.innings.innings_number === 1);
        const inn2 = inningsStates.find((i) => i.innings.innings_number === 2);
        if (inn2 && winner.id === inn2.battingTeam?.id) {
          const remainingWickets = (inn2.battingScorecard.length || 0) - inn2.totalWickets;
          resultSummary = `${winner.label} won by ${remainingWickets} wicket${remainingWickets !== 1 ? 's' : ''}`;
        } else if (inn1 && inn2) {
          const marginRuns = Math.abs(inn1.totalRuns - inn2.totalRuns);
          resultSummary = `${winner.label} won by ${marginRuns} run${marginRuns !== 1 ? 's' : ''}`;
        } else {
          resultSummary = `${winner.label} won`;
        }
      } else {
        // Test Match Summary
        const inn1 = inningsStates.find((i) => i.innings.innings_number === 1);
        const inn2 = inningsStates.find((i) => i.innings.innings_number === 2);
        const inn3 = inningsStates.find((i) => i.innings.innings_number === 3);
        const inn4 = inningsStates.find((i) => i.innings.innings_number === 4);

        if (inn2 && winner.id === inn2.battingTeam?.id && (!inn4 || inn4.totalRuns === 0)) {
          // Innings defeat check
          const teamATotal = (inn1?.totalRuns || 0) + (inn3?.totalRuns || 0);
          const teamBTotal = inn2?.totalRuns || 0;
          if (teamBTotal >= teamATotal) {
            const margin = teamBTotal - teamATotal;
            resultSummary = `${winner.label} won by an innings and ${margin} run${margin !== 1 ? 's' : ''}`;
          }
        }

        if (!resultSummary && inn4 && winner.id === inn4.battingTeam?.id) {
          const remainingWickets = (inn4.battingScorecard.length || 0) - inn4.totalWickets;
          resultSummary = `${winner.label} won by ${remainingWickets} wicket${remainingWickets !== 1 ? 's' : ''}`;
        } else if (!resultSummary && inn1 && inn2 && inn3) {
          const teamATotal = (inn1?.totalRuns || 0) + (inn3?.totalRuns || 0);
          const teamBTotal = (inn2?.totalRuns || 0) + (inn4?.totalRuns || 0);
          const marginRuns = Math.abs(teamATotal - teamBTotal);
          resultSummary = `${winner.label} won by ${marginRuns} run${marginRuns !== 1 ? 's' : ''}`;
        }
      }
    } else if (result && !result.winning_team_id) {
      resultSummary = 'Match Tied';
    } else {
      resultSummary = 'Match Completed';
    }
  } else if (match.status === 'live') {
    const activeInn = inningsStates[inningsStates.length - 1];
    if (activeInn?.innings.innings_number === 2 && !isTest && activeInn.targetInfo) {
      resultSummary = `${activeInn.battingTeam?.label} need ${activeInn.targetInfo.runsNeeded} runs from ${activeInn.targetInfo.ballsRemaining} balls`;
    } else if (activeInn?.innings.innings_number === 4 && isTest && activeInn.targetInfo) {
      resultSummary = `${activeInn.battingTeam?.label} need ${activeInn.targetInfo.runsNeeded} runs to win (${activeInn.targetInfo.wicketsInHand} wkts in hand)`;
    } else if (activeInn) {
      resultSummary = `${activeInn.battingTeam?.label} ${isTest ? `(Inn ${activeInn.innings.innings_number})` : ''}: ${activeInn.totalRuns}/${activeInn.totalWickets} (${activeInn.oversFormatted} ov)`;
    }
  }

  const updatedMatch = await db.matches.get(matchId);
  const pomPlayer = updatedMatch?.player_of_match_id
    ? await db.players.get(updatedMatch.player_of_match_id)
    : null;
  const mvpDetails = updatedMatch?.status === 'completed'
    ? await calculateMatchMvp(matchId, db)
    : null;

  return {
    match: {
      ...(updatedMatch || match),
      teams: hydratedTeams,
      result: result || null,
    },
    innings: inningsStates,
    winner,
    resultSummary,
    playerOfMatch: pomPlayer || null,
    mvpDetails: mvpDetails || null,
  };
}
