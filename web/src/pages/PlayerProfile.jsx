import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { statsApi, playersApi, ledgerApi } from '../services/api';
import { LoadingSpinner, ErrorState } from '../components/ui';

export default function PlayerProfile() {
  const { playerId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [ledgerHistory, setLedgerHistory] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'cricket' | 'volleyball' | 'badminton' | 'ledger'

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, ledgerRes] = await Promise.all([
        statsApi.getPlayerStats(playerId),
        ledgerApi.getPlayerHistory(playerId),
      ]);
      setStats(statsRes.data);
      setLedgerHistory(ledgerRes.data);
    } catch {
      setError('Player not found.');
    } finally {
      setLoading(false);
    }
  }, [playerId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggleActive = async () => {
    if (!stats?.player) return;
    try {
      await playersApi.toggle(playerId, !stats.player.is_active);
      await load();
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div className="container-app">
          <LoadingSpinner label="Loading player profile..." />
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="page">
        <div className="container-app">
          <ErrorState message={error || 'Player not found'} onRetry={load} />
        </div>
      </div>
    );
  }

  const { player, totalMatches, totalWins, totalLosses, winPercentage, playerOfMatchCount, rankingPoints, streaks, sports } = stats;

  return (
    <div className="page pb-16">
      <div className="container-app max-w-3xl space-y-6">
        {/* Back */}
        <button onClick={() => navigate(-1)} className="btn-ghost btn btn-sm">
          ← Back
        </button>

        {/* Player Header Card */}
        <div className="card p-6 bg-gradient-to-br from-surface-800 via-surface-800 to-brand-950/40 border-surface-600">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-300 font-black text-2xl shadow-xl shadow-brand-500/20">
                {player.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-black text-white">{player.name}</h1>
                  <span className={player.is_active ? 'badge-green' : 'badge-red'}>
                    {player.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  Member since {new Date(player.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                </p>
              </div>
            </div>

            <button
              onClick={handleToggleActive}
              className={`btn btn-sm ${player.is_active ? 'btn-secondary' : 'btn-primary'}`}
            >
              {player.is_active ? 'Set Inactive' : 'Set Active'}
            </button>
          </div>

          {/* Quick metrics row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-surface-600/50 text-center">
            <div className="p-3 rounded-xl bg-surface-700/40">
              <p className="text-[11px] font-semibold text-gray-400">Ranking Points</p>
              <p className="text-2xl font-black text-brand-400">{rankingPoints}</p>
            </div>
            <div className="p-3 rounded-xl bg-surface-700/40">
              <p className="text-[11px] font-semibold text-gray-400">Win Rate</p>
              <p className="text-2xl font-black text-emerald-400">{winPercentage}%</p>
              <p className="text-[10px] text-gray-500">{totalWins}W – {totalLosses}L ({totalMatches})</p>
            </div>
            <div className="p-3 rounded-xl bg-surface-700/40">
              <p className="text-[11px] font-semibold text-gray-400">Current Streak</p>
              <p className="text-2xl font-black text-white">
                {streaks.currentStreakType === 'W' ? `🔥 ${streaks.currentStreakDisplay}` : streaks.currentStreakType === 'L' ? `❄️ ${streaks.currentStreakDisplay}` : '0'}
              </p>
              <p className="text-[10px] text-gray-500">Best: {streaks.bestWinStreak}W</p>
            </div>
            <div className="p-3 rounded-xl bg-surface-700/40">
              <p className="text-[11px] font-semibold text-gray-400">POM Awards</p>
              <p className="text-2xl font-black text-amber-400">⭐ {playerOfMatchCount}</p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 border-b border-surface-600/50">
          {[
            { id: 'overview', label: '📊 Overview' },
            { id: 'cricket', label: '🏏 Cricket' },
            { id: 'volleyball', label: '🏐 Volleyball' },
            { id: 'badminton', label: '🏸 Badminton' },
            { id: 'ledger', label: '💰 Ledger Statement' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20'
                  : 'bg-surface-800 text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Tab 1: Overview ───────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-slide-up">
            {/* Sport breakdown cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Cricket summary */}
              <div className="card p-4 space-y-3 bg-surface-800">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm flex items-center gap-1.5">
                    <span>🏏</span> Cricket
                  </span>
                  <span className="text-xs text-brand-300 font-semibold">{sports.cricket.winPercentage}% Win</span>
                </div>
                <div className="text-xs text-gray-400 space-y-1">
                  <p>Matches: <strong className="text-white">{sports.cricket.matches}</strong> ({sports.cricket.wins}W – {sports.cricket.losses}L)</p>
                  <p>Runs Scored: <strong className="text-white">{sports.cricket.batting.runs}</strong> (HS {sports.cricket.batting.highestScore})</p>
                  <p>Wickets Taken: <strong className="text-white">{sports.cricket.bowling.wickets}</strong> (Econ {sports.cricket.bowling.economy})</p>
                </div>
              </div>

              {/* Volleyball summary */}
              <div className="card p-4 space-y-3 bg-surface-800">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm flex items-center gap-1.5">
                    <span>🏐</span> Volleyball
                  </span>
                  <span className="text-xs text-emerald-300 font-semibold">{sports.volleyball.winPercentage}% Win</span>
                </div>
                <div className="text-xs text-gray-400 space-y-1">
                  <p>Matches: <strong className="text-white">{sports.volleyball.matches}</strong></p>
                  <p>Wins: <strong className="text-emerald-400">{sports.volleyball.wins}</strong></p>
                  <p>Losses: <strong className="text-red-400">{sports.volleyball.losses}</strong></p>
                </div>
              </div>

              {/* Badminton summary */}
              <div className="card p-4 space-y-3 bg-surface-800">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm flex items-center gap-1.5">
                    <span>🏸</span> Badminton
                  </span>
                  <span className="text-xs text-amber-300 font-semibold">{sports.badminton.winPercentage}% Win</span>
                </div>
                <div className="text-xs text-gray-400 space-y-1">
                  <p>Matches: <strong className="text-white">{sports.badminton.matches}</strong></p>
                  <p>Wins: <strong className="text-emerald-400">{sports.badminton.wins}</strong></p>
                  <p>Losses: <strong className="text-red-400">{sports.badminton.losses}</strong></p>
                </div>
              </div>
            </div>

            {/* Recent matches list */}
            <div className="card p-5 space-y-4">
              <h3 className="section-title text-base">Recent Matches</h3>
              {stats.recentMatches.length === 0 ? (
                <p className="text-xs text-gray-500">No completed matches yet.</p>
              ) : (
                <div className="space-y-2">
                  {stats.recentMatches.map((m) => (
                    <div
                      key={m.matchId}
                      className="p-3 rounded-xl bg-surface-700/50 flex items-center justify-between text-xs hover:bg-surface-700 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">
                          {{ cricket: '🏏', volleyball: '🏐', badminton: '🏸' }[m.sport]}
                        </span>
                        <div>
                          <p className="font-semibold text-white capitalize">{m.sport}</p>
                          <p className="text-[10px] text-gray-400">
                            {new Date(m.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {m.teamLabel}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {m.isPom && <span className="text-amber-400 font-bold">⭐ POM</span>}
                        <span
                          className={`px-2.5 py-1 rounded-full font-bold uppercase text-[10px] ${
                            m.outcome === 'won'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : m.outcome === 'lost'
                              ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                              : 'bg-surface-600 text-gray-300'
                          }`}
                        >
                          {m.outcome}
                        </span>
                        <Link to={`/matches/${m.matchId}`} className="text-brand-400 font-bold">
                          View →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab 2: Cricket Detailed Stats ─────────────────────── */}
        {activeTab === 'cricket' && (
          <div className="space-y-6 animate-slide-up">
            {/* Batting Card */}
            <div className="card p-5 space-y-4">
              <h3 className="section-title text-base flex items-center gap-2">
                <span>🏏</span> Batting Record
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3 rounded-xl bg-surface-700/50">
                  <p className="text-[10px] text-gray-400">Total Runs</p>
                  <p className="text-xl font-black text-white">{sports.cricket.batting.runs}</p>
                </div>
                <div className="p-3 rounded-xl bg-surface-700/50">
                  <p className="text-[10px] text-gray-400">Highest Score</p>
                  <p className="text-xl font-black text-brand-300">{sports.cricket.batting.highestScore}</p>
                </div>
                <div className="p-3 rounded-xl bg-surface-700/50">
                  <p className="text-[10px] text-gray-400">Batting Average</p>
                  <p className="text-xl font-black text-emerald-400">{sports.cricket.batting.battingAverage}</p>
                </div>
                <div className="p-3 rounded-xl bg-surface-700/50">
                  <p className="text-[10px] text-gray-400">Strike Rate</p>
                  <p className="text-xl font-black text-amber-400">{sports.cricket.batting.strikeRate}</p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center text-xs text-gray-400 pt-2 border-t border-surface-600/50">
                <div>Innings: <strong className="text-white">{sports.cricket.batting.inningsBatted}</strong></div>
                <div>Balls: <strong className="text-white">{sports.cricket.batting.ballsFaced}</strong></div>
                <div>4s: <strong className="text-white">{sports.cricket.batting.fours}</strong></div>
                <div>6s: <strong className="text-white">{sports.cricket.batting.sixes}</strong></div>
              </div>
            </div>

            {/* Bowling Card */}
            <div className="card p-5 space-y-4">
              <h3 className="section-title text-base flex items-center gap-2">
                <span>🎯</span> Bowling Record
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3 rounded-xl bg-surface-700/50">
                  <p className="text-[10px] text-gray-400">Wickets</p>
                  <p className="text-xl font-black text-brand-400">{sports.cricket.bowling.wickets}</p>
                </div>
                <div className="p-3 rounded-xl bg-surface-700/50">
                  <p className="text-[10px] text-gray-400">Economy Rate</p>
                  <p className="text-xl font-black text-emerald-400">{sports.cricket.bowling.economy}</p>
                </div>
                <div className="p-3 rounded-xl bg-surface-700/50">
                  <p className="text-[10px] text-gray-400">Bowling Average</p>
                  <p className="text-xl font-black text-amber-400">{sports.cricket.bowling.bowlingAverage}</p>
                </div>
                <div className="p-3 rounded-xl bg-surface-700/50">
                  <p className="text-[10px] text-gray-400">Overs Bowled</p>
                  <p className="text-xl font-black text-white">{sports.cricket.bowling.oversFormatted}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs text-gray-400 pt-2 border-t border-surface-600/50">
                <div>Maidens: <strong className="text-white">{sports.cricket.bowling.maidens}</strong></div>
                <div>Runs Conceded: <strong className="text-white">{sports.cricket.bowling.runsConceded}</strong></div>
                <div>Legal Balls: <strong className="text-white">{sports.cricket.bowling.legalBalls}</strong></div>
              </div>
            </div>
          </div>
        )}

        {/* ── Tab 3: Volleyball Stats ───────────────────────────── */}
        {activeTab === 'volleyball' && (
          <div className="card p-6 space-y-4 animate-slide-up">
            <h3 className="section-title text-base flex items-center gap-2">
              <span>🏐</span> Volleyball Career Record
            </h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-4 rounded-xl bg-surface-700/50">
                <p className="text-xs text-gray-400 mb-1">Matches</p>
                <p className="text-2xl font-black text-white">{sports.volleyball.matches}</p>
              </div>
              <div className="p-4 rounded-xl bg-surface-700/50">
                <p className="text-xs text-gray-400 mb-1">Wins</p>
                <p className="text-2xl font-black text-emerald-400">{sports.volleyball.wins}</p>
              </div>
              <div className="p-4 rounded-xl bg-surface-700/50">
                <p className="text-xs text-gray-400 mb-1">Win Rate</p>
                <p className="text-2xl font-black text-brand-400">{sports.volleyball.winPercentage}%</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Tab 4: Badminton Stats ────────────────────────────── */}
        {activeTab === 'badminton' && (
          <div className="card p-6 space-y-4 animate-slide-up">
            <h3 className="section-title text-base flex items-center gap-2">
              <span>🏸</span> Badminton Career Record
            </h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-4 rounded-xl bg-surface-700/50">
                <p className="text-xs text-gray-400 mb-1">Matches</p>
                <p className="text-2xl font-black text-white">{sports.badminton.matches}</p>
              </div>
              <div className="p-4 rounded-xl bg-surface-700/50">
                <p className="text-xs text-gray-400 mb-1">Wins</p>
                <p className="text-2xl font-black text-emerald-400">{sports.badminton.wins}</p>
              </div>
              <div className="p-4 rounded-xl bg-surface-700/50">
                <p className="text-xs text-gray-400 mb-1">Win Rate</p>
                <p className="text-2xl font-black text-brand-400">{sports.badminton.winPercentage}%</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Tab 5: Ledger Statement ───────────────────────────── */}
        {activeTab === 'ledger' && (
          <div className="space-y-6 animate-slide-up">
            {ledgerHistory && (
              <div className="card p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="section-title text-base flex items-center gap-2">
                    <span>💰</span> Personal Money Ledger
                  </h3>
                  <span className={`text-sm px-3 py-1 rounded-full font-black ${
                    ledgerHistory.totalBalance >= 0
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-red-500/20 text-red-300 border border-red-500/30'
                  }`}>
                    {ledgerHistory.totalBalance >= 0 ? `+₹${ledgerHistory.totalBalance} Net` : `-₹${Math.abs(ledgerHistory.totalBalance)} Net`}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-3 rounded-xl bg-surface-700/50">
                    <p className="text-[11px] text-gray-400">Total Won</p>
                    <p className="text-xl font-black text-emerald-400">₹{ledgerHistory.totalWon}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-surface-700/50">
                    <p className="text-[11px] text-gray-400">Total Lost</p>
                    <p className="text-xl font-black text-red-400">₹{ledgerHistory.totalLost}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-surface-700/50">
                    <p className="text-[11px] text-gray-400">Staked Matches</p>
                    <p className="text-xl font-black text-white">{ledgerHistory.matchesPlayedWithStakes}</p>
                  </div>
                </div>

                {/* Match statements */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase text-gray-400">Match Ledger History</h4>
                  {ledgerHistory.history.length === 0 ? (
                    <p className="text-xs text-gray-500">No staked match transactions recorded.</p>
                  ) : (
                    <div className="space-y-2">
                      {ledgerHistory.history.map((h) => (
                        <div
                          key={h.matchId}
                          className="p-3 rounded-xl bg-surface-700/60 flex items-center justify-between text-xs"
                        >
                          <div>
                            <p className="font-semibold text-white capitalize">{h.sport}</p>
                            <p className="text-[10px] text-gray-400">
                              {new Date(h.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · Stake ₹{h.stakeAmount}
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
                            <Link to={`/matches/${h.matchId}`} className="text-brand-400 font-bold">
                              View →
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
