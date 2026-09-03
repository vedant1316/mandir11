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

/**
 * Dynamically computes interesting colony-wide statistics from completed match records:
 * - 🏆 Most Matches Won
 * - 📈 Best Win Percentage (with min matches threshold)
 * - 🔥 Longest Winning Streak
 * - 🎯 Most Matches Played
 * - 🏏 Most Runs
 * - 🎳 Most Wickets
 * - 🤝 Best Team Combination (highest win rate lineup)
 * - 💪 Most Successful Player Pair (duo with most wins together)
 * - 😈 Unluckiest Player (most losses)
 * - 🏟️ Sport-wise stats for Cricket, Volleyball, and Badminton
 */
export async function getColonyInterestingStats(db = defaultDb) {
  const completedMatches = await db.matches.where('status').equals('completed').toArray();
  const allPlayers = await db.players.toArray();
  const playerMap = new Map(allPlayers.map((p) => [p.id, p]));

  // Early return empty states if no completed matches
  if (completedMatches.length === 0) {
    return {
      summary: {
        totalCompletedMatches: 0,
        sportBreakdown: { cricket: 0, volleyball: 0, badminton: 0 },
        totalPlayers: allPlayers.length,
      },
      mostWins: { leader: null, rankings: [], insight: 'No completed matches yet.' },
      bestWinPercentage: { leader: null, minMatchesThreshold: 3, rankings: [], insight: 'Play at least 3 matches to unlock win rate rankings.' },
      longestStreak: { leader: null, rankings: [], insight: 'No streaks recorded yet.' },
      mostMatches: { leader: null, rankings: [], insight: 'No matches played yet.' },
      mostRuns: { leader: null, rankings: [], insight: 'No cricket runs recorded yet.' },
      mostWickets: { leader: null, rankings: [], insight: 'No cricket wickets recorded yet.' },
      bestTeamCombination: { leader: null, rankings: [], insight: 'No team combinations recorded yet.' },
      bestPlayerPair: { leader: null, rankings: [], insight: 'No player pairs recorded yet.' },
      unluckiestPlayer: { leader: null, rankings: [], insight: 'No match losses recorded yet.' },
      sports: {
        cricket: { matches: 0, topWinner: null, topBatter: null, topBowler: null, highestIndividualScore: null, totalRuns: 0, totalWickets: 0 },
        volleyball: { matches: 0, topWinner: null, bestWinRate: null, mostMatches: null },
        badminton: { matches: 0, topWinner: null, bestWinRate: null, mostMatches: null },
      },
    };
  }

  // Pre-load supporting records
  const results = await db.match_results.toArray();
  const resultMap = new Map(results.map((r) => [r.match_id, r]));

  const teams = await db.teams.toArray();
  const teamPlayers = await db.team_players.toArray();

  // Map teamId -> array of playerIds
  const teamPlayersByTeam = new Map();
  for (const tp of teamPlayers) {
    const arr = teamPlayersByTeam.get(tp.team_id) || [];
    arr.push(tp.player_id);
    teamPlayersByTeam.set(tp.team_id, arr);
  }

  // Map matchId -> array of { team, playerIds }
  const matchTeamsMap = new Map();
  for (const t of teams) {
    const pIds = teamPlayersByTeam.get(t.id) || [];
    const arr = matchTeamsMap.get(t.match_id) || [];
    arr.push({ team: t, playerIds: pIds });
    matchTeamsMap.set(t.match_id, arr);
  }

  // Sort completed matches chronologically (oldest to newest)
  completedMatches.sort((a, b) => new Date(a.date || a.created_at) - new Date(b.date || b.created_at));
  const completedMatchIds = new Set(completedMatches.map((m) => m.id));

  // Sport breakdown
  const sportBreakdown = { cricket: 0, volleyball: 0, badminton: 0 };
  for (const m of completedMatches) {
    if (sportBreakdown[m.sport] !== undefined) {
      sportBreakdown[m.sport]++;
    }
  }

  // Per-player stats tracking
  const playerStats = new Map();
  for (const p of allPlayers) {
    playerStats.set(p.id, {
      player: p,
      matches: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      matchOutcomes: [],
      sports: {
        cricket: { matches: 0, wins: 0, losses: 0, ties: 0 },
        volleyball: { matches: 0, wins: 0, losses: 0, ties: 0 },
        badminton: { matches: 0, wins: 0, losses: 0, ties: 0 },
      },
    });
  }

  // Pair tracking: key = "p1Id___p2Id" (sorted)
  const pairStats = new Map();
  // Team combination tracking: key = "id1___id2___id3" (sorted)
  const lineupStats = new Map();

  for (const m of completedMatches) {
    const res = resultMap.get(m.id);
    const winningTeamId = res?.winning_team_id || null;
    const mTeams = matchTeamsMap.get(m.id) || [];

    for (const { team, playerIds } of mTeams) {
      const isWinner = winningTeamId ? team.id === winningTeamId : false;
      const isTie = !winningTeamId;
      const outcome = isWinner ? 'won' : isTie ? 'tied' : 'lost';

      // Update individual player stats
      for (const pId of playerIds) {
        let pEntry = playerStats.get(pId);
        if (!pEntry) {
          const pl = playerMap.get(pId) || { id: pId, name: 'Unknown' };
          pEntry = {
            player: pl,
            matches: 0,
            wins: 0,
            losses: 0,
            ties: 0,
            matchOutcomes: [],
            sports: {
              cricket: { matches: 0, wins: 0, losses: 0, ties: 0 },
              volleyball: { matches: 0, wins: 0, losses: 0, ties: 0 },
              badminton: { matches: 0, wins: 0, losses: 0, ties: 0 },
            },
          };
          playerStats.set(pId, pEntry);
        }

        pEntry.matches++;
        pEntry.matchOutcomes.push(outcome);
        if (isWinner) pEntry.wins++;
        else if (isTie) pEntry.ties++;
        else pEntry.losses++;

        if (pEntry.sports[m.sport]) {
          pEntry.sports[m.sport].matches++;
          if (isWinner) pEntry.sports[m.sport].wins++;
          else if (isTie) pEntry.sports[m.sport].ties++;
          else pEntry.sports[m.sport].losses++;
        }
      }

      // Track player pairs (teams with >= 2 players)
      if (playerIds.length >= 2) {
        const sortedIds = [...playerIds].sort();
        for (let i = 0; i < sortedIds.length; i++) {
          for (let j = i + 1; j < sortedIds.length; j++) {
            const p1Id = sortedIds[i];
            const p2Id = sortedIds[j];
            const pairKey = `${p1Id}___${p2Id}`;
            let pair = pairStats.get(pairKey);
            if (!pair) {
              pair = {
                player1: playerMap.get(p1Id) || { id: p1Id, name: 'Unknown' },
                player2: playerMap.get(p2Id) || { id: p2Id, name: 'Unknown' },
                matchesTogether: 0,
                winsTogether: 0,
                lossesTogether: 0,
                tiesTogether: 0,
                winRate: 0,
              };
              pairStats.set(pairKey, pair);
            }
            pair.matchesTogether++;
            if (isWinner) pair.winsTogether++;
            else if (isTie) pair.tiesTogether++;
            else pair.lossesTogether++;
            pair.winRate = Math.round((pair.winsTogether / pair.matchesTogether) * 1000) / 10;
          }
        }

        // Track full team lineup combinations (size >= 2)
        const lineupKey = sortedIds.join('___');
        let lineup = lineupStats.get(lineupKey);
        if (!lineup) {
          lineup = {
            playerIds: sortedIds,
            players: sortedIds.map((id) => playerMap.get(id) || { id, name: 'Unknown' }),
            playerNames: sortedIds.map((id) => playerMap.get(id)?.name || 'Unknown'),
            matches: 0,
            wins: 0,
            losses: 0,
            ties: 0,
            winRate: 0,
          };
          lineupStats.set(lineupKey, lineup);
        }
        lineup.matches++;
        if (isWinner) lineup.wins++;
        else if (isTie) lineup.ties++;
        else lineup.losses++;
        lineup.winRate = Math.round((lineup.wins / lineup.matches) * 1000) / 10;
      }
    }
  }

  // Pre-load cricket balls & overs for runs, wickets, and highest individual scores
  const playerRuns = new Map();
  const playerWickets = new Map();
  let highestIndividualScore = null;
  let totalCricketRuns = 0;
  let totalCricketWickets = 0;

  const inningsList = await db.innings.toArray();
  const completedInnings = inningsList.filter((inn) => completedMatchIds.has(inn.match_id));
  const completedInningsIds = new Set(completedInnings.map((inn) => inn.id));

  const oversList = await db.overs.toArray();
  const completedOvers = oversList.filter((o) => completedInningsIds.has(o.innings_id));
  const overBowlerMap = new Map(completedOvers.map((o) => [o.id, o.bowler_id]));

  const ballsList = await db.balls.toArray();
  const completedBalls = ballsList.filter((b) => completedInningsIds.has(b.innings_id));

  const batterInningsMap = new Map();

  for (const b of completedBalls) {
    const bRuns = b.runs || 0;
    if (b.batter_id) {
      const current = playerRuns.get(b.batter_id) || 0;
      playerRuns.set(b.batter_id, current + bRuns);
      totalCricketRuns += bRuns;

      const innKey = `${b.innings_id}_${b.batter_id}`;
      const innRuns = (batterInningsMap.get(innKey) || 0) + bRuns;
      batterInningsMap.set(innKey, innRuns);

      if (!highestIndividualScore || innRuns > highestIndividualScore.runs) {
        highestIndividualScore = {
          player: playerMap.get(b.batter_id) || { id: b.batter_id, name: 'Unknown' },
          runs: innRuns,
          inningsId: b.innings_id,
        };
      }
    }

    if (b.is_wicket && b.dismissal_type !== 'run_out' && b.over_id) {
      const bowlerId = overBowlerMap.get(b.over_id);
      if (bowlerId) {
        const current = playerWickets.get(bowlerId) || 0;
        playerWickets.set(bowlerId, current + 1);
        totalCricketWickets++;
      }
    }
  }

  // Finalize active players stats
  const activePlayersStats = [];
  for (const [, st] of playerStats.entries()) {
    if (st.matches === 0) continue;
    st.winPercentage = Math.round((st.wins / st.matches) * 1000) / 10;
    st.streaks = calculateStreaks(st.matchOutcomes);
    st.runs = playerRuns.get(st.player.id) || 0;
    st.wickets = playerWickets.get(st.player.id) || 0;
    activePlayersStats.push(st);
  }

  // 1. Most Matches Won
  const mostWinsSorted = [...activePlayersStats].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.winPercentage !== a.winPercentage) return b.winPercentage - a.winPercentage;
    return (a.player.name || '').localeCompare(b.player.name || '');
  });
  const mostWinsLeader = mostWinsSorted[0] || null;
  const mostWinsInsight = mostWinsLeader && mostWinsLeader.wins > 0
    ? `${mostWinsLeader.player.name} leads the colony with ${mostWinsLeader.wins} match victories 🏆`
    : 'No match wins recorded yet.';

  // 2. Best Win Percentage (reasonable minimum threshold: 3 matches, or max available if < 3)
  const minMatchesThreshold = completedMatches.length >= 3 ? 3 : 1;
  const eligibleWinPct = activePlayersStats.filter((p) => p.matches >= minMatchesThreshold);
  const bestWinPctSorted = [...eligibleWinPct].sort((a, b) => {
    if (b.winPercentage !== a.winPercentage) return b.winPercentage - a.winPercentage;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.matches - a.matches;
  });
  const bestWinPctLeader = bestWinPctSorted[0] || null;
  const bestWinPctInsight = bestWinPctLeader
    ? `${bestWinPctLeader.player.name} boasts an elite ${bestWinPctLeader.winPercentage}% win rate (${bestWinPctLeader.wins}W / ${bestWinPctLeader.matches}M).`
    : 'Not enough matches to determine best win percentage.';

  // 3. Longest Winning Streak
  const streakSorted = [...activePlayersStats].sort((a, b) => {
    const aBest = a.streaks.bestWinStreak;
    const bBest = b.streaks.bestWinStreak;
    if (bBest !== aBest) return bBest - aBest;
    return b.wins - a.wins;
  });
  const streakLeader = streakSorted[0] && streakSorted[0].streaks.bestWinStreak > 0 ? streakSorted[0] : null;
  const streakInsight = streakLeader
    ? `${streakLeader.player.name} holds the colony record with a ${streakLeader.streaks.bestWinStreak}-match win streak 🔥`
    : 'No active or historical winning streaks recorded yet.';

  // 4. Most Matches Played
  const mostMatchesSorted = [...activePlayersStats].sort((a, b) => {
    if (b.matches !== a.matches) return b.matches - a.matches;
    return b.wins - a.wins;
  });
  const mostMatchesLeader = mostMatchesSorted[0] || null;
  const mostMatchesInsight = mostMatchesLeader
    ? `${mostMatchesLeader.player.name} is the colony workhorse with ${mostMatchesLeader.matches} appearances 🎯`
    : 'No matches played yet.';

  // 5. Most Runs (Cricket)
  const mostRunsSorted = [...activePlayersStats]
    .filter((p) => p.runs > 0)
    .sort((a, b) => b.runs - a.runs);
  const mostRunsLeader = mostRunsSorted[0] || null;
  const mostRunsInsight = mostRunsLeader
    ? `${mostRunsLeader.player.name} is the colony's leading run machine with ${mostRunsLeader.runs} runs 🏏`
    : 'No cricket runs scored yet.';

  // 6. Most Wickets (Cricket)
  const mostWicketsSorted = [...activePlayersStats]
    .filter((p) => p.wickets > 0)
    .sort((a, b) => b.wickets - a.wickets);
  const mostWicketsLeader = mostWicketsSorted[0] || null;
  const mostWicketsInsight = mostWicketsLeader
    ? `${mostWicketsLeader.player.name} has claimed ${mostWicketsLeader.wickets} wickets 🎳`
    : 'No cricket wickets taken yet.';

  // 7. Best Team Combination
  const allLineups = Array.from(lineupStats.values());
  const hasMultiMatch = allLineups.some((l) => l.matches >= 2);
  const eligibleLineups = hasMultiMatch ? allLineups.filter((l) => l.matches >= 2) : allLineups;
  eligibleLineups.sort((a, b) => {
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.matches - a.matches;
  });
  const bestLineupLeader = eligibleLineups[0] || null;
  const bestLineupInsight = bestLineupLeader
    ? `${bestLineupLeader.playerNames.join(' + ')} have the highest synergy: ${bestLineupLeader.winRate}% win rate over ${bestLineupLeader.matches} matches 🤝`
    : 'No team combinations recorded yet.';

  // 8. Most Successful Player Pair
  const allPairs = Array.from(pairStats.values());
  allPairs.sort((a, b) => {
    if (b.winsTogether !== a.winsTogether) return b.winsTogether - a.winsTogether;
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    return b.matchesTogether - a.matchesTogether;
  });
  const bestPairLeader = allPairs[0] && allPairs[0].winsTogether > 0 ? allPairs[0] : null;
  const bestPairInsight = bestPairLeader
    ? `${bestPairLeader.player1.name} and ${bestPairLeader.player2.name} are the deadliest duo 🔥 – ${bestPairLeader.winsTogether} wins together.`
    : 'No player pairs have won together yet.';

  // 9. Unluckiest Player
  const unluckiestSorted = [...activePlayersStats]
    .filter((p) => p.losses > 0)
    .sort((a, b) => {
      if (b.losses !== a.losses) return b.losses - a.losses;
      return (b.losses / b.matches) - (a.losses / a.matches);
    });
  const unluckiestLeader = unluckiestSorted[0] || null;
  const unluckiestInsight = unluckiestLeader
    ? `${unluckiestLeader.player.name} has suffered ${unluckiestLeader.losses} losses. Tough luck! Better days ahead 💪`
    : 'No player has lost a match yet.';

  // 10. Sport-Wise Highlights
  // Cricket
  const cricketWinners = [...activePlayersStats]
    .filter((p) => p.sports.cricket.wins > 0)
    .sort((a, b) => b.sports.cricket.wins - a.sports.cricket.wins);
  const cricketTopWinner = cricketWinners[0] || null;

  // Volleyball
  const vbPlayers = activePlayersStats.filter((p) => p.sports.volleyball.matches > 0);
  const vbWinners = [...vbPlayers]
    .filter((p) => p.sports.volleyball.wins > 0)
    .sort((a, b) => b.sports.volleyball.wins - a.sports.volleyball.wins);
  const vbTopWinner = vbWinners[0] || null;

  const vbWinRateSorted = [...vbPlayers].sort((a, b) => {
    const aRate = a.sports.volleyball.matches > 0 ? a.sports.volleyball.wins / a.sports.volleyball.matches : 0;
    const bRate = b.sports.volleyball.matches > 0 ? b.sports.volleyball.wins / b.sports.volleyball.matches : 0;
    if (bRate !== aRate) return bRate - aRate;
    return b.sports.volleyball.wins - a.sports.volleyball.wins;
  });
  const vbBestWinRate = vbWinRateSorted[0]
    ? {
        player: vbWinRateSorted[0].player,
        winRate: Math.round((vbWinRateSorted[0].sports.volleyball.wins / vbWinRateSorted[0].sports.volleyball.matches) * 1000) / 10,
        matches: vbWinRateSorted[0].sports.volleyball.matches,
      }
    : null;

  const vbMostMatchesSorted = [...vbPlayers].sort((a, b) => b.sports.volleyball.matches - a.sports.volleyball.matches);
  const vbMostMatches = vbMostMatchesSorted[0]
    ? {
        player: vbMostMatchesSorted[0].player,
        matches: vbMostMatchesSorted[0].sports.volleyball.matches,
      }
    : null;

  // Badminton
  const bmPlayers = activePlayersStats.filter((p) => p.sports.badminton.matches > 0);
  const bmWinners = [...bmPlayers]
    .filter((p) => p.sports.badminton.wins > 0)
    .sort((a, b) => b.sports.badminton.wins - a.sports.badminton.wins);
  const bmTopWinner = bmWinners[0] || null;

  const bmWinRateSorted = [...bmPlayers].sort((a, b) => {
    const aRate = a.sports.badminton.matches > 0 ? a.sports.badminton.wins / a.sports.badminton.matches : 0;
    const bRate = b.sports.badminton.matches > 0 ? b.sports.badminton.wins / b.sports.badminton.matches : 0;
    if (bRate !== aRate) return bRate - aRate;
    return b.sports.badminton.wins - a.sports.badminton.wins;
  });
  const bmBestWinRate = bmWinRateSorted[0]
    ? {
        player: bmWinRateSorted[0].player,
        winRate: Math.round((bmWinRateSorted[0].sports.badminton.wins / bmWinRateSorted[0].sports.badminton.matches) * 1000) / 10,
        matches: bmWinRateSorted[0].sports.badminton.matches,
      }
    : null;

  const bmMostMatchesSorted = [...bmPlayers].sort((a, b) => b.sports.badminton.matches - a.sports.badminton.matches);
  const bmMostMatches = bmMostMatchesSorted[0]
    ? {
        player: bmMostMatchesSorted[0].player,
        matches: bmMostMatchesSorted[0].sports.badminton.matches,
      }
    : null;

  return {
    summary: {
      totalCompletedMatches: completedMatches.length,
      sportBreakdown,
      totalPlayers: allPlayers.length,
    },
    mostWins: {
      leader: mostWinsLeader,
      rankings: mostWinsSorted.slice(0, 5),
      insight: mostWinsInsight,
    },
    bestWinPercentage: {
      leader: bestWinPctLeader,
      minMatchesThreshold,
      rankings: bestWinPctSorted.slice(0, 5),
      insight: bestWinPctInsight,
    },
    longestStreak: {
      leader: streakLeader,
      rankings: streakSorted.filter((p) => p.streaks.bestWinStreak > 0).slice(0, 5),
      insight: streakInsight,
    },
    mostMatches: {
      leader: mostMatchesLeader,
      rankings: mostMatchesSorted.slice(0, 5),
      insight: mostMatchesInsight,
    },
    mostRuns: {
      leader: mostRunsLeader,
      rankings: mostRunsSorted.slice(0, 5),
      insight: mostRunsInsight,
    },
    mostWickets: {
      leader: mostWicketsLeader,
      rankings: mostWicketsSorted.slice(0, 5),
      insight: mostWicketsInsight,
    },
    bestTeamCombination: {
      leader: bestLineupLeader,
      rankings: eligibleLineups.slice(0, 5),
      insight: bestLineupInsight,
    },
    bestPlayerPair: {
      leader: bestPairLeader,
      rankings: allPairs.slice(0, 5),
      insight: bestPairInsight,
    },
    unluckiestPlayer: {
      leader: unluckiestLeader,
      rankings: unluckiestSorted.slice(0, 5),
      insight: unluckiestInsight,
    },
    sports: {
      cricket: {
        matches: sportBreakdown.cricket,
        topWinner: cricketTopWinner ? { player: cricketTopWinner.player, wins: cricketTopWinner.sports.cricket.wins } : null,
        topBatter: mostRunsLeader ? { player: mostRunsLeader.player, runs: mostRunsLeader.runs } : null,
        topBowler: mostWicketsLeader ? { player: mostWicketsLeader.player, wickets: mostWicketsLeader.wickets } : null,
        highestIndividualScore,
        totalRuns: totalCricketRuns,
        totalWickets: totalCricketWickets,
      },
      volleyball: {
        matches: sportBreakdown.volleyball,
        topWinner: vbTopWinner ? { player: vbTopWinner.player, wins: vbTopWinner.sports.volleyball.wins } : null,
        bestWinRate: vbBestWinRate,
        mostMatches: vbMostMatches,
      },
      badminton: {
        matches: sportBreakdown.badminton,
        topWinner: bmTopWinner ? { player: bmTopWinner.player, wins: bmTopWinner.sports.badminton.wins } : null,
        bestWinRate: bmBestWinRate,
        mostMatches: bmMostMatches,
      },
    },
  };
}
