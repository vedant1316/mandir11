import { db as defaultDb } from '../db/db';
import defaultRules from '../config/rankingRules.json';
import { PlayerNotFoundError } from './errors';

/**
 * Calculates a player's cricket batting and bowling statistics across completed matches
 */
export async function calculatePlayerCricketStats(playerId, completedMatches, db = defaultDb) {
  const completedMatchIds = new Set(
    completedMatches.filter((m) => m.sport === 'cricket').map((m) => m.id)
  );

  if (completedMatchIds.size === 0) {
    return {
      matches: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      winPercentage: 0,
      batting: {
        inningsBatted: 0,
        runs: 0,
        ballsFaced: 0,
        fours: 0,
        sixes: 0,
        highestScore: 0,
        dismissals: 0,
        battingAverage: 0,
        strikeRate: 0,
      },
      bowling: {
        oversFormatted: '0.0',
        oversCount: 0,
        legalBalls: 0,
        maidens: 0,
        runsConceded: 0,
        wickets: 0,
        economy: 0,
        bowlingAverage: 0,
      },
    };
  }

  // 1. Batting statistics
  const playerBalls = await db.balls.where('batter_id').equals(playerId).toArray();
  const validBattingBalls = playerBalls.filter((b) => b.innings_id);

  // Group balls by innings to compute highest score and innings count
  const ballsByInnings = new Map();
  for (const b of validBattingBalls) {
    const arr = ballsByInnings.get(b.innings_id) || [];
    arr.push(b);
    ballsByInnings.set(b.innings_id, arr);
  }

  // Also check innings where player was dismissed even if 0 runs
  const dismissalBalls = await db.balls
    .where('dismissed_player_id')
    .equals(playerId)
    .toArray();
  const allDismissals = [
    ...dismissalBalls,
    ...validBattingBalls.filter((b) => b.is_wicket && !b.dismissed_player_id),
  ];

  let runs = 0;
  let ballsFaced = 0;
  let fours = 0;
  let sixes = 0;
  let highestScore = 0;
  let inningsBatted = 0;

  // Process innings in completed matches
  for (const [innId, balls] of ballsByInnings.entries()) {
    const innRecord = await db.innings.get(innId);
    if (!innRecord || !completedMatchIds.has(innRecord.match_id)) continue;

    inningsBatted++;
    let inningsRuns = 0;

    for (const b of balls) {
      const bRuns = b.runs || 0;
      inningsRuns += bRuns;
      runs += bRuns;
      if (b.extra_type !== 'wide') {
        ballsFaced++;
      }
      if (bRuns === 4) fours++;
      if (bRuns === 6) sixes++;
    }

    if (inningsRuns > highestScore) {
      highestScore = inningsRuns;
    }
  }

  // Count valid dismissals in completed matches
  let validDismissalsCount = 0;
  for (const d of allDismissals) {
    const innRecord = await db.innings.get(d.innings_id);
    if (innRecord && completedMatchIds.has(innRecord.match_id)) {
      validDismissalsCount++;
    }
  }

  const battingAverage =
    validDismissalsCount > 0
      ? Math.round((runs / validDismissalsCount) * 100) / 100
      : runs;

  const strikeRate =
    ballsFaced > 0 ? Math.round((runs / ballsFaced) * 10000) / 100 : 0;

  // 2. Bowling statistics
  const playerOvers = await db.overs.where('bowler_id').equals(playerId).toArray();
  let totalLegalBalls = 0;
  let totalRunsConceded = 0;
  let totalWickets = 0;
  let maidens = 0;

  for (const over of playerOvers) {
    const innRecord = await db.innings.get(over.innings_id);
    if (!innRecord || !completedMatchIds.has(innRecord.match_id)) continue;

    const overBalls = await db.balls.where('over_id').equals(over.id).toArray();
    let overLegalBalls = 0;
    let overRunsConceded = 0;

    for (const b of overBalls) {
      const isExtra = b.extra_type === 'wide' || b.extra_type === 'no_ball';
      const penalty = isExtra ? 1 : 0;
      const extraRuns = b.extra_runs || 0;
      const ballRuns = (b.runs || 0) + penalty + extraRuns;

      overRunsConceded += ballRuns;
      totalRunsConceded += ballRuns;

      if (!isExtra) {
        overLegalBalls++;
        totalLegalBalls++;
      }

      if (b.is_wicket && b.dismissal_type !== 'run_out') {
        totalWickets++;
      }
    }

    if (overLegalBalls >= 6 && overRunsConceded === 0) {
      maidens++;
    }
  }

  const oversFormatted = `${Math.floor(totalLegalBalls / 6)}.${totalLegalBalls % 6}`;
  const oversFloat = totalLegalBalls / 6;

  const economy =
    oversFloat > 0
      ? Math.round((totalRunsConceded / oversFloat) * 100) / 100
      : 0;

  const bowlingAverage =
    totalWickets > 0
      ? Math.round((totalRunsConceded / totalWickets) * 100) / 100
      : 0;

  return {
    batting: {
      inningsBatted,
      runs,
      ballsFaced,
      fours,
      sixes,
      highestScore,
      dismissals: validDismissalsCount,
      battingAverage,
      strikeRate,
    },
    bowling: {
      oversFormatted,
      oversCount: oversFloat,
      legalBalls: totalLegalBalls,
      maidens,
      runsConceded: totalRunsConceded,
      wickets: totalWickets,
      economy,
      bowlingAverage,
    },
  };
}

/**
 * Calculates a player's chronological active and best win streak
 */
export function calculateStreaks(matchOutcomes = []) {
  if (matchOutcomes.length === 0) {
    return {
      currentStreakCount: 0,
      currentStreakType: 'none',
      currentStreakDisplay: '0',
      bestWinStreak: 0,
    };
  }

  // matchOutcomes sorted oldest to newest
  let bestWinStreak = 0;
  let runningWins = 0;

  for (const outcome of matchOutcomes) {
    if (outcome === 'won') {
      runningWins++;
      if (runningWins > bestWinStreak) {
        bestWinStreak = runningWins;
      }
    } else if (outcome === 'lost') {
      runningWins = 0;
    }
  }

  // Current active streak (from latest match backwards)
  let currentStreakCount = 0;
  let currentStreakType = 'none';

  for (let i = matchOutcomes.length - 1; i >= 0; i--) {
    const out = matchOutcomes[i];
    if (out === 'tied') continue; // ties do not break streaks

    if (currentStreakType === 'none') {
      currentStreakType = out === 'won' ? 'W' : 'L';
      currentStreakCount = 1;
    } else if ((currentStreakType === 'W' && out === 'won') || (currentStreakType === 'L' && out === 'lost')) {
      currentStreakCount++;
    } else {
      break;
    }
  }

  const currentStreakDisplay =
    currentStreakCount > 0 ? `${currentStreakCount}${currentStreakType}` : '0';

  return {
    currentStreakCount,
    currentStreakType,
    currentStreakDisplay,
    bestWinStreak,
  };
}

/**
 * Calculates complete player statistics on the fly from completed match history
 */
export async function getPlayerStats(playerId, sport = null, db = defaultDb, rules = defaultRules) {
  const player = await db.players.get(playerId);
  if (!player) {
    throw new PlayerNotFoundError(`Player '${playerId}' not found.`);
  }

  // Fetch all team participations for this player
  const playerTeamEntries = await db.team_players.where('player_id').equals(playerId).toArray();
  const playerTeamIds = new Set(playerTeamEntries.map((tp) => tp.team_id));

  // Fetch all teams for these participations
  const playerTeams = await Promise.all(
    Array.from(playerTeamIds).map((tid) => db.teams.get(tid))
  );
  const teamMatchMap = new Map(); // matchId -> teamRecord
  playerTeams.filter(Boolean).forEach((t) => teamMatchMap.set(t.match_id, t));

  // Fetch all completed matches
  const completedMatches = await db.matches.where('status').equals('completed').toArray();
  const results = await db.match_results.toArray();
  const resultMap = new Map(results.map((r) => [r.match_id, r]));

  // Filter completed matches where player participated
  const playerMatches = [];
  for (const m of completedMatches) {
    if (teamMatchMap.has(m.id)) {
      const team = teamMatchMap.get(m.id);
      const res = resultMap.get(m.id);
      const isPom = m.player_of_match_id === playerId;

      let outcome = 'tied';
      if (res?.winning_team_id) {
        outcome = res.winning_team_id === team.id ? 'won' : 'lost';
      }

      playerMatches.push({
        match: m,
        team,
        result: res,
        outcome,
        isPom,
        date: m.date || m.created_at,
        sport: m.sport,
      });
    }
  }

  // Sort chronological (oldest to newest) for streak calculation
  playerMatches.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Aggregate sport-wise records
  const sportStats = {
    cricket: { matches: 0, wins: 0, losses: 0, ties: 0, winPercentage: 0 },
    volleyball: { matches: 0, wins: 0, losses: 0, ties: 0, winPercentage: 0 },
    badminton: { matches: 0, wins: 0, losses: 0, ties: 0, winPercentage: 0 },
  };

  let totalMatches = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let totalTies = 0;
  let pomCount = 0;

  const matchOutcomes = [];

  for (const pm of playerMatches) {
    totalMatches++;
    if (pm.isPom) pomCount++;

    matchOutcomes.push(pm.outcome);

    if (pm.outcome === 'won') totalWins++;
    else if (pm.outcome === 'lost') totalLosses++;
    else totalTies++;

    if (sportStats[pm.sport]) {
      sportStats[pm.sport].matches++;
      if (pm.outcome === 'won') sportStats[pm.sport].wins++;
      else if (pm.outcome === 'lost') sportStats[pm.sport].losses++;
      else sportStats[pm.sport].ties++;
    }
  }

  // Compute win percentages
  Object.keys(sportStats).forEach((sp) => {
    const st = sportStats[sp];
    st.winPercentage = st.matches > 0 ? Math.round((st.wins / st.matches) * 1000) / 10 : 0;
  });

  const overallWinPercentage =
    totalMatches > 0 ? Math.round((totalWins / totalMatches) * 1000) / 10 : 0;

  // Streaks
  const streaks = calculateStreaks(matchOutcomes);

  // Cricket detailed stats
  const cricketDetails = await calculatePlayerCricketStats(
    playerId,
    playerMatches.map((pm) => pm.match),
    db
  );
  sportStats.cricket = {
    ...sportStats.cricket,
    ...cricketDetails,
  };

  // Ranking Points using configurable weights
  const weights = rules.overall_ranking || defaultRules.overall_ranking;
  const winWeight = weights.win_weight !== undefined ? weights.win_weight : 10;
  const lossWeight = weights.loss_weight !== undefined ? weights.loss_weight : 2;
  const tieWeight = weights.tie_weight !== undefined ? weights.tie_weight : 5;
  const runWeight = weights.run_weight !== undefined ? weights.run_weight : 1;
  const wicketWeight = weights.wicket_weight !== undefined ? weights.wicket_weight : 5;

  const totalRuns = cricketDetails.batting.runs || 0;
  const totalWickets = cricketDetails.bowling.wickets || 0;

  const overallRankingPoints =
    totalWins * winWeight +
    totalLosses * lossWeight +
    totalTies * tieWeight +
    totalRuns * runWeight +
    totalWickets * wicketWeight;

  // Sport-specific ranking points
  sportStats.cricket.rankingPoints =
    sportStats.cricket.wins * winWeight +
    sportStats.cricket.losses * lossWeight +
    sportStats.cricket.ties * tieWeight +
    (sportStats.cricket.batting?.runs || 0) * runWeight +
    (sportStats.cricket.bowling?.wickets || 0) * wicketWeight;

  sportStats.volleyball.rankingPoints =
    sportStats.volleyball.wins * winWeight +
    sportStats.volleyball.losses * lossWeight +
    sportStats.volleyball.ties * tieWeight;

  sportStats.badminton.rankingPoints =
    sportStats.badminton.wins * winWeight +
    sportStats.badminton.losses * lossWeight +
    sportStats.badminton.ties * tieWeight;

  const fullStats = {
    playerId,
    player,
    totalMatches,
    totalWins,
    totalLosses,
    totalTies,
    totalRuns,
    totalWickets,
    winPercentage: overallWinPercentage,
    playerOfMatchCount: pomCount,
    rankingPoints: overallRankingPoints,
    streaks,
    sports: sportStats,
    recentMatches: playerMatches
      .slice(-10)
      .reverse()
      .map((pm) => ({
        matchId: pm.match.id,
        sport: pm.sport,
        date: pm.date,
        outcome: pm.outcome,
        isPom: pm.isPom,
        teamLabel: pm.team.label,
      })),
  };

  if (sport && sport !== 'overall' && sportStats[sport]) {
    return {
      playerId,
      player,
      sport,
      ...sportStats[sport],
      streaks,
      rankingPoints: sportStats[sport].rankingPoints,
    };
  }

  return fullStats;
}

/**
 * Derives real-time ranked leaderboards for any sport or overall
 */
export async function getRankings(sport = 'overall', db = defaultDb, rules = defaultRules) {
  const allPlayers = await db.players.toArray();
  const playerStatsList = await Promise.all(
    allPlayers.map((p) => getPlayerStats(p.id, null, db, rules))
  );

  let sorted = [];

  if (sport === 'cricket') {
    sorted = playerStatsList
      .filter((s) => s.sports.cricket.matches > 0 || s.player.is_active)
      .sort((a, b) => {
        const ca = a.sports.cricket;
        const cb = b.sports.cricket;
        if (cb.rankingPoints !== ca.rankingPoints) return cb.rankingPoints - ca.rankingPoints;
        if (cb.wins !== ca.wins) return cb.wins - ca.wins;
        if ((cb.bowling?.wickets || 0) !== (ca.bowling?.wickets || 0)) {
          return (cb.bowling?.wickets || 0) - (ca.bowling?.wickets || 0);
        }
        if ((cb.batting?.runs || 0) !== (ca.batting?.runs || 0)) {
          return (cb.batting?.runs || 0) - (ca.batting?.runs || 0);
        }
        return cb.matches - ca.matches;
      });
  } else if (sport === 'volleyball') {
    sorted = playerStatsList
      .filter((s) => s.sports.volleyball.matches > 0 || s.player.is_active)
      .sort((a, b) => {
        const va = a.sports.volleyball;
        const vb = b.sports.volleyball;
        if (vb.rankingPoints !== va.rankingPoints) return vb.rankingPoints - va.rankingPoints;
        if (vb.wins !== va.wins) return vb.wins - va.wins;
        return vb.matches - va.matches;
      });
  } else if (sport === 'badminton') {
    sorted = playerStatsList
      .filter((s) => s.sports.badminton.matches > 0 || s.player.is_active)
      .sort((a, b) => {
        const ba = a.sports.badminton;
        const bb = b.sports.badminton;
        if (bb.rankingPoints !== ba.rankingPoints) return bb.rankingPoints - ba.rankingPoints;
        if (bb.wins !== ba.wins) return bb.wins - ba.wins;
        return bb.matches - ba.matches;
      });
  } else {
    // Overall
    sorted = playerStatsList
      .filter((s) => s.totalMatches > 0 || s.player.is_active)
      .sort((a, b) => {
        if (b.rankingPoints !== a.rankingPoints) return b.rankingPoints - a.rankingPoints;
        if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
        if (b.totalWickets !== a.totalWickets) return b.totalWickets - a.totalWickets;
        if (b.totalRuns !== a.totalRuns) return b.totalRuns - a.totalRuns;
        return b.totalMatches - a.totalMatches;
      });
  }

  // Assign rank numbers
  const rankings = sorted.map((s, idx) => {
    const isOverall = sport === 'overall';
    const sStat = s.sports[sport];
    return {
      rank: idx + 1,
      playerId: s.playerId,
      player: s.player,
      matches: isOverall ? s.totalMatches : sStat?.matches || 0,
      wins: isOverall ? s.totalWins : sStat?.wins || 0,
      losses: isOverall ? s.totalLosses : sStat?.losses || 0,
      ties: isOverall ? s.totalTies : sStat?.ties || 0,
      runs: isOverall ? s.totalRuns : sStat?.batting?.runs || 0,
      wickets: isOverall ? s.totalWickets : sStat?.bowling?.wickets || 0,
      winPercentage: isOverall ? s.winPercentage : sStat?.winPercentage || 0,
      rankingPoints: isOverall ? s.rankingPoints : sStat?.rankingPoints || 0,
      streaks: s.streaks,
      sportStats: !isOverall ? sStat : s.sports,
    };
  });

  return {
    sport,
    rules,
    rankings,
    totalPlayers: rankings.length,
  };
}

/**
 * Returns colony-wide streak records
 */
export async function getStreaks(sport = null, db = defaultDb, rules = defaultRules) {
  const allPlayers = await db.players.toArray();
  const playerStatsList = await Promise.all(
    allPlayers.map((p) => getPlayerStats(p.id, sport, db, rules))
  );

  const activeWinStreaks = playerStatsList
    .filter((s) => s.streaks.currentStreakType === 'W' && s.streaks.currentStreakCount > 0)
    .sort((a, b) => b.streaks.currentStreakCount - a.streaks.currentStreakCount)
    .map((s) => ({
      player: s.player,
      streak: s.streaks.currentStreakDisplay,
      count: s.streaks.currentStreakCount,
    }));

  const bestWinStreaks = playerStatsList
    .filter((s) => s.streaks.bestWinStreak > 0)
    .sort((a, b) => b.streaks.bestWinStreak - a.streaks.bestWinStreak)
    .map((s) => ({
      player: s.player,
      bestStreak: s.streaks.bestWinStreak,
    }));

  return {
    activeWinStreaks,
    bestWinStreaks,
  };
}

/**
 * Returns quick highlights for the Dashboard
 */
export async function getLeaderboardSummary(db = defaultDb, rules = defaultRules) {
  const overall = await getRankings('overall', db, rules);
  const cricket = await getRankings('cricket', db, rules);
  const streakData = await getStreaks(null, db, rules);

  return {
    topPlayer: overall.rankings[0] || null,
    topCricketPlayer: cricket.rankings[0] || null,
    longestActiveStreak: streakData.activeWinStreaks[0] || null,
    topRankings: overall.rankings.slice(0, 5),
  };
}
