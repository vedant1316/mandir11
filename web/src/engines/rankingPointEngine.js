import defaultRankingRules from '../config/rankingRules.json';

export const DEFAULT_POSITION_POINTS = {
  1: 3,
  2: 2,
  3: 1,
};

/**
 * Returns the points for a given position based on centralized rules
 * Default: 1st=3, 2nd=2, 3rd=1, 4th+=0
 */
export function getPositionPoints(position, rules = defaultRankingRules) {
  const numPos = Number(position);
  if (isNaN(numPos) || numPos < 1) return 0;

  const pointsConfig = rules?.position_match?.points || DEFAULT_POSITION_POINTS;
  const defaultPts = rules?.position_match?.default_points ?? 0;

  return pointsConfig[String(numPos)] ?? pointsConfig[numPos] ?? defaultPts;
}

/**
 * Decorates ranking assignments with point values
 */
export function assignRankingPoints(rankings, rules = defaultRankingRules) {
  if (!Array.isArray(rankings)) return [];

  return rankings.map((r) => ({
    ...r,
    position: Number(r.position),
    points: getPositionPoints(r.position, rules),
  }));
}

/**
 * Calculates position match statistics for a single player
 */
export function calculatePlayerPositionStats(playerId, completedPositionMatches = [], matchResultsMap = new Map()) {
  let matches = 0;
  let firstPlaceCount = 0;
  let secondPlaceCount = 0;
  let thirdPlaceCount = 0;
  let otherPositionsCount = 0;
  let totalPoints = 0;
  let bestPosition = null;
  const positions = [];

  for (const m of completedPositionMatches) {
    const res = matchResultsMap.get(m.id);
    if (!res?.rankings || !Array.isArray(res.rankings)) continue;

    const playerRanking = res.rankings.find((r) => r.player_id === playerId);
    if (!playerRanking) continue;

    const pos = Number(playerRanking.position);
    matches++;
    positions.push(pos);

    const pts = playerRanking.points !== undefined && playerRanking.points !== null
      ? Number(playerRanking.points)
      : getPositionPoints(pos);

    totalPoints += pts;

    if (pos === 1) firstPlaceCount++;
    else if (pos === 2) secondPlaceCount++;
    else if (pos === 3) thirdPlaceCount++;
    else otherPositionsCount++;

    if (bestPosition === null || pos < bestPosition) {
      bestPosition = pos;
    }
  }

  const podiumCount = firstPlaceCount + secondPlaceCount + thirdPlaceCount;
  const sumPositions = positions.reduce((acc, curr) => acc + curr, 0);
  const averagePosition = matches > 0 ? Math.round((sumPositions / matches) * 10) / 10 : 0;

  return {
    playerId,
    matches,
    firstPlaceCount,
    wins: firstPlaceCount, // 1st place is a match win
    secondPlaceCount,
    thirdPlaceCount,
    podiumCount,
    otherPositionsCount,
    totalPoints,
    bestPosition,
    averagePosition,
    positions,
  };
}

/**
 * Calculates aggregated leaderboards and rankings across all position matches
 */
export function calculateAllPlayersPositionLeaderboard(players = [], completedPositionMatches = [], matchResultsMap = new Map()) {
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const playerStatsList = [];

  for (const p of players) {
    const stats = calculatePlayerPositionStats(p.id, completedPositionMatches, matchResultsMap);
    playerStatsList.push({
      player: p,
      ...stats,
    });
  }

  // Also include any players in matches who might not be in the initial active list
  for (const m of completedPositionMatches) {
    const res = matchResultsMap.get(m.id);
    if (!res?.rankings) continue;
    for (const r of res.rankings) {
      if (!playerMap.has(r.player_id)) {
        const dummyPlayer = { id: r.player_id, name: 'Player' };
        playerMap.set(r.player_id, dummyPlayer);
        const stats = calculatePlayerPositionStats(r.player_id, completedPositionMatches, matchResultsMap);
        playerStatsList.push({
          player: dummyPlayer,
          ...stats,
        });
      }
    }
  }

  // Sort by total points desc, then wins/1st desc, then 2nd desc, then 3rd desc
  const sortedByPoints = [...playerStatsList].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.firstPlaceCount !== a.firstPlaceCount) return b.firstPlaceCount - a.firstPlaceCount;
    if (b.secondPlaceCount !== a.secondPlaceCount) return b.secondPlaceCount - a.secondPlaceCount;
    if (b.thirdPlaceCount !== a.thirdPlaceCount) return b.thirdPlaceCount - a.thirdPlaceCount;
    return (a.player.name || '').localeCompare(b.player.name || '');
  });

  return {
    playerStatsList,
    standings: sortedByPoints,
  };
}
