import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ledgerApi, playersApi } from '../services/api';
import { LoadingSpinner, ErrorState } from '../components/ui';

export default function Ledger() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [allPlayers, setAllPlayers] = useState([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [playerHistory, setPlayerHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadColonySummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, playersRes] = await Promise.all([
        ledgerApi.getColonySummary(),
        playersApi.list(false),
      ]);
      setSummary(sumRes.data);
      const players = playersRes.data.players;
      setAllPlayers(players);
      if (players.length > 0 && !selectedPlayerId) {
        setSelectedPlayerId(players[0].id);
      }
    } catch {
      setError('Failed to load colony ledger.');
    } finally {
      setLoading(false);
    }
  }, [selectedPlayerId]);

  useEffect(() => {
    loadColonySummary();
  }, [loadColonySummary]);

  const loadPlayerHistory = useCallback(async (pid) => {
    if (!pid) return;
    setHistoryLoading(true);
    try {
      const res = await ledgerApi.getPlayerHistory(pid);
      setPlayerHistory(res.data);
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedPlayerId) {
      loadPlayerHistory(selectedPlayerId);
    }
  }, [selectedPlayerId, loadPlayerHistory]);

  if (loading) {
    return (
      <div className="page">
        <div className="container-app">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="page">
        <div className="container-app">
          <ErrorState message={error || 'Failed to load ledger.'} onRetry={loadColonySummary} />
        </div>
      </div>
    );
  }

  return (
    <div className="page pb-16">
      <div className="container-app max-w-3xl space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <span>💰</span> Colony Money Ledger
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Dynamic peer-to-peer settlement derived from completed match results
            </p>
          </div>
          <div className="card p-3 px-4 bg-gradient-to-br from-surface-800 to-surface-900 border-surface-600 self-start sm:self-auto">
            <p className="text-[11px] font-semibold text-gray-400">Total Settled Volume</p>
            <p className="text-xl font-black text-white">₹{summary.totalVolume}</p>
          </div>
        </div>

        {/* ── 1. Who Owes Whom (Net Settlement Graph) ───────────── */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="section-title text-base flex items-center gap-2">
              <span>🤝</span> Outstanding Colony Settlements
            </h2>
            <span className="badge-blue text-xs">{summary.colonyDebts.length} active</span>
          </div>

          {summary.colonyDebts.length === 0 ? (
            <div className="p-6 rounded-xl bg-surface-700/50 text-center">
              <span className="text-3xl mb-2 block">✨</span>
              <p className="text-sm font-semibold text-gray-300">All accounts are settled!</p>
              <p className="text-xs text-gray-500 mt-1">No outstanding peer-to-peer debts in the colony.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {summary.colonyDebts.map((d, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-gradient-to-r from-red-500/10 via-surface-800 to-emerald-500/10 border border-surface-600 flex items-center justify-between"
                >
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-red-400">{d.fromPlayer?.name}</p>
                    <p className="text-[11px] text-gray-400">owes</p>
                    <p className="text-xs font-bold text-emerald-400">{d.toPlayer?.name}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-black text-white">₹{d.amount}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 2. Net Balances Leaderboard ──────────────────────── */}
        <div className="card p-6 space-y-4">
          <h2 className="section-title text-base flex items-center gap-2">
            <span>🏆</span> Net Balance Leaderboard
          </h2>

          {summary.leaderboard.length === 0 ? (
            <p className="text-xs text-gray-500">No staked matches completed yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-surface-600 text-gray-500">
                    <th className="pb-3 font-semibold">Player</th>
                    <th className="pb-3 font-semibold text-right">Matches</th>
                    <th className="pb-3 font-semibold text-right">Won</th>
                    <th className="pb-3 font-semibold text-right">Lost</th>
                    <th className="pb-3 font-semibold text-right">Net Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-700/50">
                  {summary.leaderboard.map((p) => (
                    <tr key={p.player.id} className="text-gray-300 hover:bg-surface-700/30 transition-colors">
                      <td className="py-3 font-semibold text-white flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-surface-600 flex items-center justify-center text-xs text-gray-300 font-bold">
                          {p.player.name.charAt(0).toUpperCase()}
                        </div>
                        {p.player.name}
                      </td>
                      <td className="py-3 text-right text-gray-400">{p.matchesCount}</td>
                      <td className="py-3 text-right text-emerald-400 font-semibold">₹{p.totalWon}</td>
                      <td className="py-3 text-right text-red-400 font-semibold">₹{p.totalLost}</td>
                      <td className="py-3 text-right">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                            p.netBalance > 0
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : p.netBalance < 0
                              ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                              : 'bg-surface-700 text-gray-400'
                          }`}
                        >
                          {p.netBalance > 0 ? `+₹${p.netBalance}` : p.netBalance < 0 ? `-₹${Math.abs(p.netBalance)}` : '₹0'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── 3. Individual Statement Inspector ─────────────────── */}
        <div className="card p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="section-title text-base flex items-center gap-2">
              <span>📜</span> Individual Player Statement
            </h2>
            <select
              id="select-player-statement"
              className="input text-xs sm:w-48"
              value={selectedPlayerId}
              onChange={(e) => setSelectedPlayerId(e.target.value)}
            >
              {allPlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {historyLoading ? (
            <div className="py-8"><LoadingSpinner /></div>
          ) : playerHistory ? (
            <div className="space-y-4">
              {/* Player Summary Pill */}
              <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-surface-700/40 text-center text-xs">
                <div>
                  <p className="text-gray-400 mb-0.5">Total Won</p>
                  <p className="text-emerald-400 font-bold text-base">₹{playerHistory.totalWon}</p>
                </div>
                <div>
                  <p className="text-gray-400 mb-0.5">Total Lost</p>
                  <p className="text-red-400 font-bold text-base">₹{playerHistory.totalLost}</p>
                </div>
                <div>
                  <p className="text-gray-400 mb-0.5">Net Balance</p>
                  <p className={`font-black text-base ${
                    playerHistory.totalBalance >= 0 ? 'text-emerald-300' : 'text-red-400'
                  }`}>
                    {playerHistory.totalBalance >= 0 ? `+₹${playerHistory.totalBalance}` : `-₹${Math.abs(playerHistory.totalBalance)}`}
                  </p>
                </div>
              </div>

              {/* Match History Table */}
              {playerHistory.history.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-4">No staked match history for this player.</p>
              ) : (
                <div className="space-y-2">
                  {playerHistory.history.map((h) => (
                    <div
                      key={h.matchId}
                      className="p-3 rounded-xl bg-surface-700 flex items-center justify-between text-xs hover:bg-surface-600 transition-colors"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="capitalize font-semibold text-white">{h.sport}</span>
                          <span className="text-[10px] text-gray-400">
                            {new Date(h.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400">
                          Stake: ₹{h.stakeAmount} · Status: {h.status}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <span
                          className={`font-black text-sm ${
                            h.netAmount > 0
                              ? 'text-emerald-400'
                              : h.netAmount < 0
                              ? 'text-red-400'
                              : 'text-gray-400'
                          }`}
                        >
                          {h.netAmount > 0 ? `+₹${h.netAmount}` : h.netAmount < 0 ? `-₹${Math.abs(h.netAmount)}` : '₹0'}
                        </span>
                        <Link to={`/matches/${h.matchId}`} className="text-brand-400 hover:text-brand-300 font-bold">
                          View →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
