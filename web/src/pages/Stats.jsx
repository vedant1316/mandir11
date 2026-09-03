import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { statsApi } from '../services/api';
import { LoadingSpinner, EmptyState, ErrorState } from '../components/ui';

export default function Stats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSportTab, setActiveSportTab] = useState('all');

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await statsApi.getColonyInterestingStats();
      setStats(res.data);
    } catch (err) {
      setError(err?.message || 'Failed to calculate colony statistics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (loading) {
    return (
      <div className="page pb-16">
        <div className="container-app max-w-5xl">
          <LoadingSpinner label="Calculating colony records & dynamic stats..." />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page pb-16">
        <div className="container-app max-w-5xl">
          <ErrorState message={error} onRetry={loadStats} />
        </div>
      </div>
    );
  }

  const hasMatches = (stats?.summary?.totalCompletedMatches || 0) > 0;

  if (!hasMatches) {
    return (
      <div className="page pb-16">
        <div className="container-app max-w-4xl space-y-8">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <span>📊</span> Colony Stats & Records
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              Dynamic records, chemistry analysis, and leaderboards calculated from completed matches.
            </p>
          </div>

          <div className="card p-8 border-surface-600 bg-surface-800/80 text-center">
            <EmptyState
              icon="🏟️"
              title="No match history found"
              description="Play and complete matches in Cricket, Volleyball, or Badminton to unlock dynamic records, duo chemistry, streaks, and leaderboards!"
              action={
                <Link to="/matches/new" id="btn-stats-start-match" className="btn-primary btn">
                  ⚡ Start a Quick Match
                </Link>
              }
            />
          </div>
        </div>
      </div>
    );
  }

  const {
    summary,
    mostWins,
    bestWinPercentage,
    longestStreak,
    mostMatches,
    mostRuns,
    mostWickets,
    bestTeamCombination,
    bestPlayerPair,
    unluckiestPlayer,
    sports,
  } = stats;

  return (
    <div className="page pb-20">
      <div className="container-app max-w-5xl space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <span>📊</span> Colony Stats & Records
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              Dynamic colony insights, player synergies, and records calculated directly from match history.
            </p>
          </div>

          {/* Colony Match Summary Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="px-3 py-1.5 rounded-xl bg-surface-700/80 border border-surface-600 text-xs font-semibold text-gray-200">
              🎮 <span className="text-white font-bold">{summary?.totalCompletedMatches ?? 0}</span> Matches
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-brand-500/10 border border-brand-500/30 text-xs font-semibold text-brand-300">
              🏏 <span className="font-bold">{summary?.sportBreakdown?.cricket ?? 0}</span> Cricket
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs font-semibold text-amber-300">
              🏐 <span className="font-bold">{summary?.sportBreakdown?.volleyball ?? 0}</span> Volleyball
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs font-semibold text-emerald-300">
              🏸 <span className="font-bold">{summary?.sportBreakdown?.badminton ?? 0}</span> Badminton
            </div>
          </div>
        </div>

        {/* Dynamic Highlight Banners */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {bestPlayerPair.leader && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-surface-800 to-surface-800 border border-amber-500/30 flex items-center gap-3">
              <span className="text-2xl flex-shrink-0">🔥</span>
              <div className="min-w-0">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">Deadliest Duo</span>
                <p className="text-sm font-semibold text-white truncate">
                  {bestPlayerPair.insight}
                </p>
              </div>
            </div>
          )}

          {bestTeamCombination.leader && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-brand-500/15 via-surface-800 to-surface-800 border border-brand-500/30 flex items-center gap-3">
              <span className="text-2xl flex-shrink-0">🤝</span>
              <div className="min-w-0">
                <span className="text-xs font-bold text-brand-400 uppercase tracking-wider block">Synergy Record</span>
                <p className="text-sm font-semibold text-white truncate">
                  {bestTeamCombination.insight}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Key Colony Hall of Fame Cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* 1. 🏆 Most Matches Won */}
          <div id="stat-most-wins" className="card p-5 border-surface-600 bg-surface-800/90 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🏆</span> Most Matches Won
                </span>
                {mostWins.leader && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {mostWins.leader.wins} Wins
                  </span>
                )}
              </div>

              {mostWins.leader ? (
                <div>
                  <Link
                    to={`/players/${mostWins.leader.player.id}`}
                    className="text-lg font-black text-white hover:text-brand-300 transition-colors block"
                  >
                    {mostWins.leader.player.name}
                  </Link>
                  <p className="text-xs text-gray-400 mt-1">
                    {mostWins.insight}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-gray-500">No match wins recorded yet.</p>
              )}
            </div>

            {/* Mini Rankings Table */}
            {mostWins.rankings.length > 1 && (
              <div className="pt-3 border-t border-surface-700/80 space-y-1.5">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Top Winners</span>
                {mostWins.rankings.slice(0, 3).map((r, idx) => (
                  <div key={r.player.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-300 flex items-center gap-1.5 truncate">
                      <span className="text-gray-500 font-mono w-3.5">{idx + 1}.</span>
                      <Link to={`/players/${r.player.id}`} className="hover:text-white truncate">
                        {r.player.name}
                      </Link>
                    </span>
                    <span className="text-gray-400 font-semibold">{r.wins}W</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. 📈 Best Win Percentage */}
          <div id="stat-best-win-pct" className="card p-5 border-surface-600 bg-surface-800/90 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span>📈</span> Best Win Percentage
                </span>
                {bestWinPercentage.leader && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {bestWinPercentage.leader.winPercentage}%
                  </span>
                )}
              </div>

              {bestWinPercentage.leader ? (
                <div>
                  <Link
                    to={`/players/${bestWinPercentage.leader.player.id}`}
                    className="text-lg font-black text-white hover:text-emerald-300 transition-colors block"
                  >
                    {bestWinPercentage.leader.player.name}
                  </Link>
                  <p className="text-xs text-gray-400 mt-1">
                    {bestWinPercentage.insight}
                  </p>
                  <span className="inline-block mt-2 text-[10px] text-gray-500 bg-surface-700/60 px-2 py-0.5 rounded-md">
                    Min. {bestWinPercentage.minMatchesThreshold} matches
                  </span>
                </div>
              ) : (
                <p className="text-xs text-gray-500">Not enough match history for threshold.</p>
              )}
            </div>

            {bestWinPercentage.rankings.length > 1 && (
              <div className="pt-3 border-t border-surface-700/80 space-y-1.5">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Top Win Rates</span>
                {bestWinPercentage.rankings.slice(0, 3).map((r, idx) => (
                  <div key={r.player.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-300 flex items-center gap-1.5 truncate">
                      <span className="text-gray-500 font-mono w-3.5">{idx + 1}.</span>
                      <Link to={`/players/${r.player.id}`} className="hover:text-white truncate">
                        {r.player.name}
                      </Link>
                    </span>
                    <span className="text-emerald-400 font-semibold">{r.winPercentage}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. 🔥 Longest Winning Streak */}
          <div id="stat-longest-streak" className="card p-5 border-surface-600 bg-surface-800/90 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🔥</span> Longest Streak
                </span>
                {longestStreak.leader && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30">
                    {longestStreak.leader.streaks.bestWinStreak}W Streak
                  </span>
                )}
              </div>

              {longestStreak.leader ? (
                <div>
                  <Link
                    to={`/players/${longestStreak.leader.player.id}`}
                    className="text-lg font-black text-white hover:text-orange-300 transition-colors block"
                  >
                    {longestStreak.leader.player.name}
                  </Link>
                  <p className="text-xs text-gray-400 mt-1">
                    {longestStreak.insight}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-gray-500">No winning streaks recorded yet.</p>
              )}
            </div>

            {longestStreak.rankings.length > 1 && (
              <div className="pt-3 border-t border-surface-700/80 space-y-1.5">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Top Streaks</span>
                {longestStreak.rankings.slice(0, 3).map((r, idx) => (
                  <div key={r.player.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-300 flex items-center gap-1.5 truncate">
                      <span className="text-gray-500 font-mono w-3.5">{idx + 1}.</span>
                      <Link to={`/players/${r.player.id}`} className="hover:text-white truncate">
                        {r.player.name}
                      </Link>
                    </span>
                    <span className="text-orange-400 font-semibold">{r.streaks.bestWinStreak}W</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 4. 🎯 Most Matches Played */}
          <div id="stat-most-matches" className="card p-5 border-surface-600 bg-surface-800/90 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🎯</span> Most Matches Played
                </span>
                {mostMatches.leader && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                    {mostMatches.leader.matches} Matches
                  </span>
                )}
              </div>

              {mostMatches.leader ? (
                <div>
                  <Link
                    to={`/players/${mostMatches.leader.player.id}`}
                    className="text-lg font-black text-white hover:text-sky-300 transition-colors block"
                  >
                    {mostMatches.leader.player.name}
                  </Link>
                  <p className="text-xs text-gray-400 mt-1">
                    {mostMatches.insight}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-gray-500">No matches recorded yet.</p>
              )}
            </div>

            {mostMatches.rankings.length > 1 && (
              <div className="pt-3 border-t border-surface-700/80 space-y-1.5">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Most Appearances</span>
                {mostMatches.rankings.slice(0, 3).map((r, idx) => (
                  <div key={r.player.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-300 flex items-center gap-1.5 truncate">
                      <span className="text-gray-500 font-mono w-3.5">{idx + 1}.</span>
                      <Link to={`/players/${r.player.id}`} className="hover:text-white truncate">
                        {r.player.name}
                      </Link>
                    </span>
                    <span className="text-sky-400 font-semibold">{r.matches} M</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 5. 🏏 Most Runs */}
          <div id="stat-most-runs" className="card p-5 border-surface-600 bg-surface-800/90 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🏏</span> Colony Run Machine
                </span>
                {mostRuns.leader && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-400/20 text-amber-200 border border-amber-400/30">
                    {mostRuns.leader.runs} Runs
                  </span>
                )}
              </div>

              {mostRuns.leader ? (
                <div>
                  <Link
                    to={`/players/${mostRuns.leader.player.id}`}
                    className="text-lg font-black text-white hover:text-amber-300 transition-colors block"
                  >
                    {mostRuns.leader.player.name}
                  </Link>
                  <p className="text-xs text-gray-400 mt-1">
                    {mostRuns.insight}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-gray-500">No cricket runs recorded yet.</p>
              )}
            </div>

            {mostRuns.rankings.length > 1 && (
              <div className="pt-3 border-t border-surface-700/80 space-y-1.5">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Top Scorers</span>
                {mostRuns.rankings.slice(0, 3).map((r, idx) => (
                  <div key={r.player.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-300 flex items-center gap-1.5 truncate">
                      <span className="text-gray-500 font-mono w-3.5">{idx + 1}.</span>
                      <Link to={`/players/${r.player.id}`} className="hover:text-white truncate">
                        {r.player.name}
                      </Link>
                    </span>
                    <span className="text-amber-300 font-semibold">{r.runs} r</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 6. 🎳 Most Wickets */}
          <div id="stat-most-wickets" className="card p-5 border-surface-600 bg-surface-800/90 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🎳</span> Top Wicket Taker
                </span>
                {mostWickets.leader && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    {mostWickets.leader.wickets} Wkts
                  </span>
                )}
              </div>

              {mostWickets.leader ? (
                <div>
                  <Link
                    to={`/players/${mostWickets.leader.player.id}`}
                    className="text-lg font-black text-white hover:text-purple-300 transition-colors block"
                  >
                    {mostWickets.leader.player.name}
                  </Link>
                  <p className="text-xs text-gray-400 mt-1">
                    {mostWickets.insight}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-gray-500">No cricket wickets recorded yet.</p>
              )}
            </div>

            {mostWickets.rankings.length > 1 && (
              <div className="pt-3 border-t border-surface-700/80 space-y-1.5">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Top Bowlers</span>
                {mostWickets.rankings.slice(0, 3).map((r, idx) => (
                  <div key={r.player.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-300 flex items-center gap-1.5 truncate">
                      <span className="text-gray-500 font-mono w-3.5">{idx + 1}.</span>
                      <Link to={`/players/${r.player.id}`} className="hover:text-white truncate">
                        {r.player.name}
                      </Link>
                    </span>
                    <span className="text-purple-300 font-semibold">{r.wickets} w</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Player Pairs & Lineup Chemistry ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* 💪 Most Successful Player Pair */}
          <div id="stat-player-pair" className="card p-6 border-surface-600 bg-surface-800/90 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>💪</span> Most Successful Player Pair
              </span>
              {bestPlayerPair.leader && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {bestPlayerPair.leader.winsTogether} Wins Together
                </span>
              )}
            </div>

            {bestPlayerPair.leader ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    <span className="w-10 h-10 rounded-full bg-amber-500/30 border-2 border-surface-800 flex items-center justify-center font-bold text-amber-200">
                      {bestPlayerPair.leader.player1.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="w-10 h-10 rounded-full bg-brand-500/30 border-2 border-surface-800 flex items-center justify-center font-bold text-brand-200">
                      {bestPlayerPair.leader.player2.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-base font-bold text-white">
                      <Link to={`/players/${bestPlayerPair.leader.player1.id}`} className="hover:text-amber-300">
                        {bestPlayerPair.leader.player1.name}
                      </Link>
                      {' & '}
                      <Link to={`/players/${bestPlayerPair.leader.player2.id}`} className="hover:text-brand-300">
                        {bestPlayerPair.leader.player2.name}
                      </Link>
                    </p>
                    <p className="text-xs text-gray-400">
                      {bestPlayerPair.leader.winRate}% win rate across {bestPlayerPair.leader.matchesTogether} matches
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-surface-700/50 border border-surface-600/50 text-xs text-gray-300">
                  {bestPlayerPair.insight}
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-500">Play team matches together to unlock pair chemistry!</p>
            )}
          </div>

          {/* 🤝 Best Team Combination */}
          <div id="stat-team-combination" className="card p-6 border-surface-600 bg-surface-800/90 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-brand-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>🤝</span> Best Team Combination
              </span>
              {bestTeamCombination.leader && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-500/20 text-brand-300 border border-brand-500/30">
                  {bestTeamCombination.leader.winRate}% Win Rate
                </span>
              )}
            </div>

            {bestTeamCombination.leader ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {bestTeamCombination.leader.players.map((p) => (
                    <Link
                      key={p.id}
                      to={`/players/${p.id}`}
                      className="px-2.5 py-1 rounded-lg bg-surface-700 text-xs font-semibold text-gray-200 border border-surface-600 hover:border-brand-400 hover:text-white transition-all"
                    >
                      {p.name}
                    </Link>
                  ))}
                </div>

                <p className="text-xs text-gray-400">
                  Record: <span className="text-emerald-400 font-bold">{bestTeamCombination.leader.wins}W</span>
                  {' - '}
                  <span className="text-red-400 font-bold">{bestTeamCombination.leader.losses}L</span>
                  {' ('}
                  {bestTeamCombination.leader.matches} matches played together)
                </p>

                <div className="p-3 rounded-xl bg-surface-700/50 border border-surface-600/50 text-xs text-gray-300">
                  {bestTeamCombination.insight}
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-500">Play matches with multi-player teams to unlock combination synergy!</p>
            )}
          </div>
        </div>

        {/* 😈 Unluckiest Player Card */}
        {unluckiestPlayer.leader && (
          <div id="stat-unluckiest" className="card p-5 border-rose-500/30 bg-gradient-to-r from-rose-950/20 via-surface-800 to-surface-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">😈</span>
              <div>
                <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">Unluckiest Player</span>
                <p className="text-sm font-semibold text-white">
                  <Link to={`/players/${unluckiestPlayer.leader.player.id}`} className="hover:text-rose-300 underline">
                    {unluckiestPlayer.leader.player.name}
                  </Link>
                  {' · '}
                  <span className="text-rose-300">{unluckiestPlayer.leader.losses} Losses</span>
                  <span className="text-gray-400 text-xs block sm:inline sm:ml-2">({unluckiestPlayer.insight})</span>
                </p>
              </div>
            </div>
            <span className="hidden sm:inline-block px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
              Never Give Up 💪
            </span>
          </div>
        )}

        {/* ── 🏟️ Sport-Wise Interesting Breakdown ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="section-title flex items-center gap-2">
              <span>🏟️</span> Sport-Wise Records
            </h2>

            {/* Sport tab filter */}
            <div className="flex gap-1.5 bg-surface-800 p-1 rounded-xl border border-surface-600">
              {[
                { id: 'all', label: 'All' },
                { id: 'cricket', label: '🏏 Cricket' },
                { id: 'volleyball', label: '🏐 Volleyball' },
                { id: 'badminton', label: '🏸 Badminton' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  id={`tab-sport-${tab.id}`}
                  onClick={() => setActiveSportTab(tab.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    activeSportTab === tab.id
                      ? 'bg-brand-500 text-white shadow-md'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 🏏 Cricket Card */}
            {(activeSportTab === 'all' || activeSportTab === 'cricket') && (
              <div className="card p-5 border-surface-600 bg-surface-800/90 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-surface-700">
                  <span className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span>🏏</span> Cricket Highlights
                  </span>
                  <span className="text-xs text-brand-300 font-semibold">
                    {sports.cricket.matches} Matches
                  </span>
                </div>

                {sports.cricket.matches > 0 ? (
                  <div className="space-y-2.5 text-xs">
                    {sports.cricket.topWinner && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Most Wins:</span>
                        <span className="font-semibold text-white">
                          {sports.cricket.topWinner.player.name} ({sports.cricket.topWinner.wins}W)
                        </span>
                      </div>
                    )}
                    {sports.cricket.topBatter && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Top Batter:</span>
                        <span className="font-semibold text-amber-300">
                          {sports.cricket.topBatter.player.name} ({sports.cricket.topBatter.runs} runs)
                        </span>
                      </div>
                    )}
                    {sports.cricket.topBowler && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Top Bowler:</span>
                        <span className="font-semibold text-purple-300">
                          {sports.cricket.topBowler.player.name} ({sports.cricket.topBowler.wickets} wkts)
                        </span>
                      </div>
                    )}
                    {sports.cricket.highestIndividualScore && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">High Score:</span>
                        <span className="font-semibold text-white">
                          {sports.cricket.highestIndividualScore.player.name} ({sports.cricket.highestIndividualScore.runs}*)
                        </span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-surface-700/60 flex justify-between text-[11px] text-gray-500">
                      <span>Total Colony Runs: {sports.cricket.totalRuns}</span>
                      <span>Total Wkts: {sports.cricket.totalWickets}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 py-4 text-center">No cricket matches completed yet.</p>
                )}
              </div>
            )}

            {/* 🏐 Volleyball Card */}
            {(activeSportTab === 'all' || activeSportTab === 'volleyball') && (
              <div className="card p-5 border-surface-600 bg-surface-800/90 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-surface-700">
                  <span className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span>🏐</span> Volleyball Highlights
                  </span>
                  <span className="text-xs text-amber-300 font-semibold">
                    {sports.volleyball.matches} Matches
                  </span>
                </div>

                {sports.volleyball.matches > 0 ? (
                  <div className="space-y-2.5 text-xs">
                    {sports.volleyball.topWinner && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Most Wins:</span>
                        <span className="font-semibold text-white">
                          {sports.volleyball.topWinner.player.name} ({sports.volleyball.topWinner.wins}W)
                        </span>
                      </div>
                    )}
                    {sports.volleyball.bestWinRate && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Highest Win Rate:</span>
                        <span className="font-semibold text-emerald-300">
                          {sports.volleyball.bestWinRate.player.name} ({sports.volleyball.bestWinRate.winRate}%)
                        </span>
                      </div>
                    )}
                    {sports.volleyball.mostMatches && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Most Matches:</span>
                        <span className="font-semibold text-sky-300">
                          {sports.volleyball.mostMatches.player.name} ({sports.volleyball.mostMatches.matches}M)
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 py-4 text-center">No volleyball matches completed yet.</p>
                )}
              </div>
            )}

            {/* 🏸 Badminton Card */}
            {(activeSportTab === 'all' || activeSportTab === 'badminton') && (
              <div className="card p-5 border-surface-600 bg-surface-800/90 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-surface-700">
                  <span className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span>🏸</span> Badminton Highlights
                  </span>
                  <span className="text-xs text-emerald-300 font-semibold">
                    {sports.badminton.matches} Matches
                  </span>
                </div>

                {sports.badminton.matches > 0 ? (
                  <div className="space-y-2.5 text-xs">
                    {sports.badminton.topWinner && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Most Wins:</span>
                        <span className="font-semibold text-white">
                          {sports.badminton.topWinner.player.name} ({sports.badminton.topWinner.wins}W)
                        </span>
                      </div>
                    )}
                    {sports.badminton.bestWinRate && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Highest Win Rate:</span>
                        <span className="font-semibold text-emerald-300">
                          {sports.badminton.bestWinRate.player.name} ({sports.badminton.bestWinRate.winRate}%)
                        </span>
                      </div>
                    )}
                    {sports.badminton.mostMatches && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Most Matches:</span>
                        <span className="font-semibold text-sky-300">
                          {sports.badminton.mostMatches.player.name} ({sports.badminton.mostMatches.matches}M)
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 py-4 text-center">No badminton matches completed yet.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
