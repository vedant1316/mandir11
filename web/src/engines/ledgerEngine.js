import { db as defaultDb } from '../db/db';
import {
  MatchNotFoundError,
  MatchStateError,
  UnbalancedStakesError,
  InvalidStakeAmountError,
  InvalidStakeParticipantError,
} from './errors';

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'id_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

/**
 * Validates stake amounts and ensures they are strictly positive numbers
 */
export function validateStakeAmount(amount) {
  const num = Number(amount);
  if (isNaN(num) || num <= 0 || !isFinite(num)) {
    throw new InvalidStakeAmountError(
      `Stake amount must be a positive number greater than zero (received '${amount}').`
    );
  }
  return Math.round(num * 100) / 100;
}

/**
 * Auto-matches Team A and Team B contributions into balanced pairwise LedgerEntry objects
 * using a deterministic FIFO allocation.
 */
export function autoMatchStakes(teamAStakes = [], teamBStakes = []) {
  const normalizedA = teamAStakes
    .map((s) => ({
      playerId: s.playerId || s.player_id,
      amount: validateStakeAmount(s.amount),
    }))
    .filter((s) => s.amount > 0);

  const normalizedB = teamBStakes
    .map((s) => ({
      playerId: s.playerId || s.player_id,
      amount: validateStakeAmount(s.amount),
    }))
    .filter((s) => s.amount > 0);

  const totalA = Math.round(normalizedA.reduce((sum, s) => sum + s.amount, 0) * 100) / 100;
  const totalB = Math.round(normalizedB.reduce((sum, s) => sum + s.amount, 0) * 100) / 100;

  if (totalA !== totalB) {
    throw new UnbalancedStakesError(
      `Total stakes on Team A (₹${totalA}) must equal total stakes on Team B (₹${totalB}). Difference: ₹${Math.abs(
        totalA - totalB
      )}.`
    );
  }

  if (totalA === 0) {
    return [];
  }

  const matchedEntries = [];
  const poolA = normalizedA.map((s) => ({ ...s, remaining: s.amount }));
  const poolB = normalizedB.map((s) => ({ ...s, remaining: s.amount }));

  let idxA = 0;
  let idxB = 0;

  while (idxA < poolA.length && idxB < poolB.length) {
    const curA = poolA[idxA];
    const curB = poolB[idxB];

    if (curA.remaining <= 0) {
      idxA++;
      continue;
    }
    if (curB.remaining <= 0) {
      idxB++;
      continue;
    }

    const matchAmount = Math.round(Math.min(curA.remaining, curB.remaining) * 100) / 100;

    if (matchAmount > 0) {
      matchedEntries.push({
        player_a_id: curA.playerId,
        player_b_id: curB.playerId,
        amount: matchAmount,
      });

      curA.remaining = Math.round((curA.remaining - matchAmount) * 100) / 100;
      curB.remaining = Math.round((curB.remaining - matchAmount) * 100) / 100;
    }

    if (curA.remaining <= 0) idxA++;
    if (curB.remaining <= 0) idxB++;
  }

  return matchedEntries;
}

/**
 * Sets and persists pairwise ledger entries for a match
 */
export async function setMatchLedger(matchId, rawEntries = [], db = defaultDb) {
  const match = await db.matches.get(matchId);
  if (!match) {
    throw new MatchNotFoundError(`Match '${matchId}' not found.`);
  }

  if (match.status === 'completed' || match.status === 'abandoned') {
    throw new MatchStateError(`Cannot set stakes on a ${match.status} match.`);
  }

  // Fetch match teams
  const teams = await db.teams.where('match_id').equals(matchId).toArray();
  const teamA = teams.find((t) => t.label === 'Team A');
  const teamB = teams.find((t) => t.label === 'Team B');

  if (!teamA || !teamB) {
    throw new MatchStateError('Both Team A and Team B must exist before setting match stakes.');
  }

  const teamAPlayers = await db.team_players.where('team_id').equals(teamA.id).toArray();
  const teamBPlayers = await db.team_players.where('team_id').equals(teamB.id).toArray();

  const teamAPlayerIds = new Set(teamAPlayers.map((tp) => tp.player_id));
  const teamBPlayerIds = new Set(teamBPlayers.map((tp) => tp.player_id));

  // If empty, clear existing entries
  if (!rawEntries || rawEntries.length === 0) {
    const existing = await db.ledger_entries.where('match_id').equals(matchId).toArray();
    await Promise.all(existing.map((e) => db.ledger_entries.delete(e.id)));
    return {
      matchId,
      entries: [],
      totalPool: 0,
      totalTeamA: 0,
      totalTeamB: 0,
    };
  }

  // Validate individual entries
  let totalTeamA = 0;
  let totalTeamB = 0;
  const validatedEntries = [];

  for (const entry of rawEntries) {
    const amount = validateStakeAmount(entry.amount);
    const playerAId = entry.player_a_id || entry.playerAId;
    const playerBId = entry.player_b_id || entry.playerBId;

    if (!playerAId || !teamAPlayerIds.has(playerAId)) {
      throw new InvalidStakeParticipantError(
        `Player '${playerAId}' is not assigned to Team A.`
      );
    }

    if (!playerBId || !teamBPlayerIds.has(playerBId)) {
      throw new InvalidStakeParticipantError(
        `Player '${playerBId}' is not assigned to Team B.`
      );
    }

    if (playerAId === playerBId) {
      throw new InvalidStakeParticipantError('A player cannot stake against themselves.');
    }

    totalTeamA = Math.round((totalTeamA + amount) * 100) / 100;
    totalTeamB = Math.round((totalTeamB + amount) * 100) / 100;

    validatedEntries.push({
      id: entry.id || generateId(),
      match_id: matchId,
      player_a_id: playerAId,
      player_b_id: playerBId,
      amount,
      created_at: entry.created_at || new Date().toISOString(),
    });
  }

  // Clear existing entries and write validated ones
  const existing = await db.ledger_entries.where('match_id').equals(matchId).toArray();
  await Promise.all(existing.map((e) => db.ledger_entries.delete(e.id)));

  for (const entry of validatedEntries) {
    await db.ledger_entries.add(entry);
  }

  return getMatchLedger(matchId, db);
}

/**
 * Retrieves all ledger entries for a match with hydrated player objects
 */
export async function getMatchLedger(matchId, db = defaultDb) {
  const match = await db.matches.get(matchId);
  if (!match) {
    throw new MatchNotFoundError(`Match '${matchId}' not found.`);
  }

  const entries = await db.ledger_entries.where('match_id').equals(matchId).toArray();
  const playerIds = new Set();
  entries.forEach((e) => {
    playerIds.add(e.player_a_id);
    playerIds.add(e.player_b_id);
  });

  const playerRecords = await Promise.all(Array.from(playerIds).map((id) => db.players.get(id)));
  const playerMap = new Map();
  playerRecords.filter(Boolean).forEach((p) => playerMap.set(p.id, p));

  let totalTeamA = 0;
  let totalTeamB = 0;

  const hydratedEntries = entries.map((e) => {
    totalTeamA = Math.round((totalTeamA + e.amount) * 100) / 100;
    totalTeamB = Math.round((totalTeamB + e.amount) * 100) / 100;
    return {
      ...e,
      player_a: playerMap.get(e.player_a_id) || { id: e.player_a_id, name: 'Unknown' },
      player_b: playerMap.get(e.player_b_id) || { id: e.player_b_id, name: 'Unknown' },
    };
  });

  return {
    matchId,
    entries: hydratedEntries,
    totalPool: Math.round((totalTeamA + totalTeamB) * 100) / 100,
    totalTeamA,
    totalTeamB,
    hasStakes: hydratedEntries.length > 0,
  };
}

/**
 * Calculates match settlement dynamically from winning team + stakes
 */
export async function calculateMatchSettlement(matchId, db = defaultDb) {
  const match = await db.matches.get(matchId);
  if (!match) {
    throw new MatchNotFoundError(`Match '${matchId}' not found.`);
  }

  const matchLedger = await getMatchLedger(matchId, db);
  const { entries, totalPool, hasStakes } = matchLedger;

  if (!hasStakes) {
    return {
      matchId,
      hasStakes: false,
      status: match.status,
      isSettled: false,
      payments: [],
      playerBalances: [],
      totalPool: 0,
      entries: [],
    };
  }

  // If match is not finished yet
  if (match.status === 'upcoming' || match.status === 'live') {
    return {
      matchId,
      hasStakes: true,
      status: match.status,
      isSettled: false,
      payments: [],
      playerBalances: [],
      totalPool,
      entries,
      summary: `Pending settlement (${match.status})`,
    };
  }

  // If match was abandoned
  if (match.status === 'abandoned') {
    return {
      matchId,
      hasStakes: true,
      status: 'abandoned',
      isSettled: true,
      isAbandoned: true,
      payments: [],
      playerBalances: [],
      totalPool,
      entries,
      summary: 'Match abandoned — all stakes refunded, no payments due.',
    };
  }

  // If match is completed
  const teams = await db.teams.where('match_id').equals(matchId).toArray();
  const teamA = teams.find((t) => t.label === 'Team A');
  const teamB = teams.find((t) => t.label === 'Team B');
  const result = await db.match_results.where('match_id').equals(matchId).first();

  const winnerId = result?.winning_team_id;
  const isTie = !winnerId;

  if (isTie) {
    return {
      matchId,
      hasStakes: true,
      status: 'completed',
      isSettled: true,
      isTie: true,
      winningTeam: null,
      payments: [],
      playerBalances: [],
      totalPool,
      entries,
      summary: 'Match tied — all stakes refunded, no payments due.',
    };
  }

  const winningTeam = winnerId === teamA?.id ? teamA : teamB;
  const losingTeam = winnerId === teamA?.id ? teamB : teamA;
  const isTeamAWinner = winnerId === teamA?.id;

  // Derive directional payments
  // If Team A won: player_b pays player_a
  // If Team B won: player_a pays player_b
  const pairwiseDebtMap = new Map(); // key: "fromId->toId", val: amount
  const playerNetMap = new Map(); // key: playerId, val: { player, teamLabel, stakeAmount, netAmount, status }

  for (const entry of entries) {
    const winnerPlayer = isTeamAWinner ? entry.player_a : entry.player_b;
    const loserPlayer = isTeamAWinner ? entry.player_b : entry.player_a;
    const amount = entry.amount;

    // Track pairwise debt
    const pairKey = `${loserPlayer.id}->${winnerPlayer.id}`;
    const curDebt = pairwiseDebtMap.get(pairKey) || {
      fromPlayer: loserPlayer,
      toPlayer: winnerPlayer,
      amount: 0,
    };
    curDebt.amount = Math.round((curDebt.amount + amount) * 100) / 100;
    pairwiseDebtMap.set(pairKey, curDebt);

    // Track winner net
    const curWinnerNet = playerNetMap.get(winnerPlayer.id) || {
      player: winnerPlayer,
      teamLabel: winningTeam.label,
      stakeAmount: 0,
      netAmount: 0,
      status: 'won',
    };
    curWinnerNet.stakeAmount = Math.round((curWinnerNet.stakeAmount + amount) * 100) / 100;
    curWinnerNet.netAmount = Math.round((curWinnerNet.netAmount + amount) * 100) / 100;
    playerNetMap.set(winnerPlayer.id, curWinnerNet);

    // Track loser net
    const curLoserNet = playerNetMap.get(loserPlayer.id) || {
      player: loserPlayer,
      teamLabel: losingTeam.label,
      stakeAmount: 0,
      netAmount: 0,
      status: 'lost',
    };
    curLoserNet.stakeAmount = Math.round((curLoserNet.stakeAmount + amount) * 100) / 100;
    curLoserNet.netAmount = Math.round((curLoserNet.netAmount - amount) * 100) / 100;
    playerNetMap.set(loserPlayer.id, curLoserNet);
  }

  const payments = Array.from(pairwiseDebtMap.values());
  const playerBalances = Array.from(playerNetMap.values());

  return {
    matchId,
    hasStakes: true,
    status: 'completed',
    isSettled: true,
    isTie: false,
    winningTeam: { id: winningTeam.id, label: winningTeam.label },
    losingTeam: { id: losingTeam.id, label: losingTeam.label },
    payments,
    playerBalances,
    totalPool,
    entries,
    summary: `${winningTeam.label} won! Total ₹${totalPool / 2} collected and settled.`,
  };
}

/**
 * Aggregates player's lifetime ledger history and net balances
 */
export async function getPlayerLedgerHistory(playerId, db = defaultDb) {
  const player = await db.players.get(playerId);
  if (!player) {
    throw new MatchNotFoundError(`Player '${playerId}' not found.`);
  }

  const entriesA = await db.ledger_entries.where('player_a_id').equals(playerId).toArray();
  const entriesB = await db.ledger_entries.where('player_b_id').equals(playerId).toArray();
  const allEntries = [...entriesA, ...entriesB];

  const matchIds = Array.from(new Set(allEntries.map((e) => e.match_id)));
  let totalWon = 0;
  let totalLost = 0;
  const history = [];

  for (const mid of matchIds) {
    const settlement = await calculateMatchSettlement(mid, db);
    if (!settlement.hasStakes) continue;

    const matchRecord = await db.matches.get(mid);
    const playerBal = settlement.playerBalances?.find((b) => b.player.id === playerId);

    if (settlement.isSettled && !settlement.isAbandoned && !settlement.isTie && playerBal) {
      if (playerBal.netAmount > 0) {
        totalWon = Math.round((totalWon + playerBal.netAmount) * 100) / 100;
      } else if (playerBal.netAmount < 0) {
        totalLost = Math.round((totalLost + Math.abs(playerBal.netAmount)) * 100) / 100;
      }
    }

    history.push({
      matchId: mid,
      sport: matchRecord?.sport || 'sport',
      date: matchRecord?.date || matchRecord?.created_at,
      status: matchRecord?.status,
      isSettled: settlement.isSettled,
      isAbandoned: settlement.isAbandoned || false,
      isTie: settlement.isTie || false,
      stakeAmount: playerBal?.stakeAmount || 0,
      netAmount: playerBal?.netAmount || 0,
      outcome: playerBal?.status || (settlement.isTie ? 'tied' : 'pending'),
    });
  }

  // Sort history by date desc
  history.sort((a, b) => new Date(b.date) - new Date(a.date));

  const totalBalance = Math.round((totalWon - totalLost) * 100) / 100;

  return {
    playerId,
    player,
    totalBalance,
    totalWon,
    totalLost,
    matchesPlayedWithStakes: matchIds.length,
    history,
  };
}

/**
 * Computes colony-wide net balances and simplified debt settlement graph
 */
export async function getColonyLedgerSummary(db = defaultDb) {
  const completedMatches = await db.matches.where('status').equals('completed').toArray();
  const allPlayers = await db.players.toArray();
  const playerMap = new Map(allPlayers.map((p) => [p.id, p]));

  const playerNetBalances = new Map(); // playerId -> { player, totalWon, totalLost, netBalance, matchesCount }
  allPlayers.forEach((p) => {
    playerNetBalances.set(p.id, {
      player: p,
      totalWon: 0,
      totalLost: 0,
      netBalance: 0,
      matchesCount: 0,
    });
  });

  // Net pairwise debt matrix: "fromId->toId" -> total net amount
  const pairwiseNetDebt = new Map();

  for (const m of completedMatches) {
    const settlement = await calculateMatchSettlement(m.id, db);
    if (!settlement.hasStakes || !settlement.isSettled || settlement.isAbandoned || settlement.isTie) {
      continue;
    }

    // Accumulate player net balances
    settlement.playerBalances.forEach((pb) => {
      const stats = playerNetBalances.get(pb.player.id) || {
        player: pb.player,
        totalWon: 0,
        totalLost: 0,
        netBalance: 0,
        matchesCount: 0,
      };
      stats.matchesCount += 1;
      if (pb.netAmount > 0) {
        stats.totalWon = Math.round((stats.totalWon + pb.netAmount) * 100) / 100;
      } else if (pb.netAmount < 0) {
        stats.totalLost = Math.round((stats.totalLost + Math.abs(pb.netAmount)) * 100) / 100;
      }
      stats.netBalance = Math.round((stats.totalWon - stats.totalLost) * 100) / 100;
      playerNetBalances.set(pb.player.id, stats);
    });

    // Accumulate pairwise payments
    settlement.payments.forEach((pay) => {
      const forwardKey = `${pay.fromPlayer.id}->${pay.toPlayer.id}`;
      const reverseKey = `${pay.toPlayer.id}->${pay.fromPlayer.id}`;

      if (pairwiseNetDebt.has(reverseKey)) {
        const revAmount = pairwiseNetDebt.get(reverseKey);
        if (revAmount >= pay.amount) {
          pairwiseNetDebt.set(reverseKey, Math.round((revAmount - pay.amount) * 100) / 100);
        } else {
          pairwiseNetDebt.delete(reverseKey);
          pairwiseNetDebt.set(forwardKey, Math.round((pay.amount - revAmount) * 100) / 100);
        }
      } else {
        const cur = pairwiseNetDebt.get(forwardKey) || 0;
        pairwiseNetDebt.set(forwardKey, Math.round((cur + pay.amount) * 100) / 100);
      }
    });
  }

  // Format pairwise debts
  const colonyDebts = [];
  pairwiseNetDebt.forEach((amount, key) => {
    if (amount > 0) {
      const [fromId, toId] = key.split('->');
      colonyDebts.push({
        fromPlayer: playerMap.get(fromId) || { id: fromId, name: 'Unknown' },
        toPlayer: playerMap.get(toId) || { id: toId, name: 'Unknown' },
        amount,
      });
    }
  });

  const leaderboard = Array.from(playerNetBalances.values())
    .filter((p) => p.matchesCount > 0 || p.netBalance !== 0)
    .sort((a, b) => b.netBalance - a.netBalance);

  return {
    colonyDebts,
    leaderboard,
    totalVolume: Math.round(
      leaderboard.reduce((sum, p) => sum + p.totalWon, 0) * 100
    ) / 100,
  };
}
