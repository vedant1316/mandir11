import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { statsApi } from '../services/api';
import { LoadingSpinner, ErrorState } from '../components/ui';

const SPORT_TABS = [
  { id: 'overall', label: '🏆 Overall' },
  { id: 'cricket', label: '🏏 Cricket' },
  { id: 'volleyball', label: '🏐 Volleyball' },
  { id: 'badminton', label: '🏸 Badminton' },
];

export default function Leaderboard() {
  const [sport, setSport] = useState('overall');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadRankings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await statsApi.getRankings(sport);
      setData(res.data);
    } catch {
      setError('Failed to load rankings.');
    } finally {
      setLoading(false);
    }
  }, [sport]);

  useEffect(() => {
    loadRankings();
  }, [loadRankings]);

  const sortedRankings = (data?.rankings ? [...data.rankings] : [])
    .sort((a, b) => {
      if (b.rankingPoints !== a.rankingPoints) return b.rankingPoints - a.rankingPoints;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if ((b.wickets || 0) !== (a.wickets || 0)) return (b.wickets || 0) - (a.wickets || 0);
      if ((b.runs || 0) !== (a.runs || 0)) return (b.runs || 0) - (a.runs || 0);
      return (b.matches || 0) - (a.matches || 0);
    })
    .map((row, idx) => ({
      ...row,
      rank: idx + 1,
    }));

  return (
    <div className="page pb-16">
      <div className="container-app max-w-4xl space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <span>🏆</span> Colony Leaderboard & Rankings
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Dynamic standings derived on the fly from verified match history
            </p>
          </div>

          {/* Config rules explanation badge */}
          <div className="card p-2.5 px-3 bg-surface-800 border-surface-600 text-[11px] text-gray-400 self-start sm:self-auto">
            <span className="text-white font-bold">Scoring: </span>
            Win: <span className="text-emerald-400 font-bold">+10</span> ·
            Loss: <span className="text-gray-300 font-bold">+2</span> ·
            Tie: <span className="text-amber-400 font-bold">+5</span> ·
            Run: <span className="text-brand-300 font-bold">+1</span> ·
            Wicket: <span className="text-purple-300 font-bold">+5 pts</span>
          </div>
        </div>

        {/* Sport Filter Tabs */}
        <div className="flex gap-2 border-b border-surface-600/50 pb-2 overflow-x-auto">
          {SPORT_TABS.map((tab) => (
            <button
              key={tab.id}
              id={`tab-rankings-${tab.id}`}
              onClick={() => setSport(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                sport === tab.id
                  ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/25'
                  : 'bg-surface-800 text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-12">
            <LoadingSpinner label="Calculating colony standings..." />
          </div>
        ) : error || !data ? (
          <ErrorState message={error || 'Failed to load rankings.'} onRetry={loadRankings} />
        ) : sortedRankings.length === 0 ? (
          <div className="card p-12 text-center text-gray-400">
            <span className="text-4xl block mb-2">🏅</span>
            <p className="font-semibold text-white">No ranked match data yet</p>
            <p className="text-xs text-gray-500 mt-1">Complete matches to start climbing the leaderboard!</p>
          </div>
        ) : (
          <div className="space-y-8 animate-slide-up">
            {/* ── Top 3 Podium (if >= 2 players) ────────────────── */}
            {sortedRankings.length >= 2 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                {/* 1st Place (Gold) */}
                {sortedRankings[0] && (
                  <PodiumCard
                    badge="👑 #1"
                    color="border-amber-400/40 bg-gradient-to-b from-amber-400/15 to-surface-800 ring-1 ring-amber-400/30"
                    item={sortedRankings[0]}
                    featured
                  />
                )}

                {/* 2nd Place (Silver) */}
                {sortedRankings[1] && (
                  <PodiumCard
                    badge="🥈 #2"
                    color="border-gray-400/30 bg-gradient-to-b from-gray-400/10 to-surface-800"
                    item={sortedRankings[1]}
                  />
                )}

                {/* 3rd Place (Bronze) */}
                {sortedRankings[2] && (
                  <PodiumCard
                    badge="🥉 #3"
                    color="border-amber-700/30 bg-gradient-to-b from-amber-700/10 to-surface-800"
                    item={sortedRankings[2]}
                  />
                )}
              </div>
            )}

            {/* ── Full Rankings Table ───────────────────────────── */}
            <div className="card p-6 space-y-4">
              <h2 className="section-title text-base flex items-center justify-between">
                <span>Standings Table</span>
                <span className="text-xs font-normal text-gray-500">
                  {sortedRankings.length} player{sortedRankings.length !== 1 ? 's' : ''}
                </span>
              </h2>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-surface-600 text-gray-500">
                      <th className="pb-3 font-semibold text-center w-12">Rank</th>
                      <th className="pb-3 font-semibold">Player</th>
                      <th className="pb-3 font-semibold text-right">Points</th>
                      <th className="pb-3 font-semibold text-right">Matches</th>
                      <th className="pb-3 font-semibold text-right">Wins</th>
                      <th className="pb-3 font-semibold text-right">Losses</th>
                      <th className="pb-3 font-semibold text-right">Runs</th>
                      <th className="pb-3 font-semibold text-right">Wickets</th>
                      <th className="pb-3 font-semibold text-right">Win %</th>
                      <th className="pb-3 font-semibold text-right">Streak</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-700/50">
                    {sortedRankings.map((row) => (
                      <tr
                        key={row.playerId}
                        className="text-gray-300 hover:bg-surface-700/40 transition-colors"
                      >
                        <td className="py-3.5 text-center font-bold">
                          {row.rank === 1 ? (
                            <span className="text-amber-400 font-black">🥇 1</span>
                          ) : row.rank === 2 ? (
                            <span className="text-gray-300 font-black">🥈 2</span>
                          ) : row.rank === 3 ? (
                            <span className="text-amber-600 font-black">🥉 3</span>
                          ) : (
                            <span className="text-gray-500">#{row.rank}</span>
                          )}
                        </td>
                        <td className="py-3.5 font-semibold text-white">
                          <Link
                            to={`/players/${row.playerId}`}
                            className="hover:text-brand-300 flex items-center gap-2 transition-colors"
                          >
                            <div className="w-6 h-6 rounded-full bg-brand-500/20 text-brand-300 font-bold flex items-center justify-center text-[10px]">
                              {row.player.name.charAt(0).toUpperCase()}
                            </div>
                            {row.player.name}
                          </Link>
                        </td>
                        <td className="py-3.5 text-right font-black text-brand-400 text-sm">
                          {row.rankingPoints}
                        </td>
                        <td className="py-3.5 text-right text-gray-400 font-medium">{row.matches}</td>
                        <td className="py-3.5 text-right text-emerald-400 font-bold">{row.wins}</td>
                        <td className="py-3.5 text-right text-red-400 font-semibold">{row.losses}</td>
                        <td className="py-3.5 text-right font-bold text-amber-300">
                          {sport === 'volleyball' || sport === 'badminton' ? '—' : row.runs || 0}
                        </td>
                        <td className="py-3.5 text-right font-bold text-purple-300">
                          {sport === 'volleyball' || sport === 'badminton' ? '—' : row.wickets || 0}
                        </td>
                        <td className="py-3.5 text-right font-semibold text-white">
                          {row.winPercentage}%
                        </td>
                        <td className="py-3.5 text-right text-gray-400 font-semibold">
                          {row.streaks?.currentStreakType === 'W' ? (
                            <span className="text-emerald-400 font-bold">🔥 {row.streaks.currentStreakDisplay}</span>
                          ) : row.streaks?.currentStreakType === 'L' ? (
                            <span className="text-red-400 font-bold">❄️ {row.streaks.currentStreakDisplay}</span>
                          ) : (
                            '0'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PodiumCard({ badge, color, item, featured }) {
  return (
    <div
      className={`card p-5 text-center flex flex-col justify-between transition-transform duration-200 hover:-translate-y-1 ${color} ${
        featured ? 'sm:-translate-y-2' : ''
      }`}
    >
      <div>
        <span className="text-xs px-2.5 py-1 rounded-full font-black bg-surface-700/80 text-white mb-3 inline-block">
          {badge}
        </span>
        <div className="w-12 h-12 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-300 font-black text-lg mx-auto mb-2">
          {item.player.name.charAt(0).toUpperCase()}
        </div>
        <Link
          to={`/players/${item.playerId}`}
          className="font-black text-white text-base hover:text-brand-300 transition-colors block"
        >
          {item.player.name}
        </Link>
        <p className="text-[11px] text-gray-400 mt-1">
          <span className="text-emerald-400 font-bold">{item.wins}W</span> · {item.losses}L · {item.winPercentage}% Win
        </p>
        <div className="flex justify-center gap-3 text-[11px] text-gray-400 mt-1">
          <span>🏏 <span className="text-amber-300 font-semibold">{item.runs || 0}</span> Runs</span>
          <span>🎯 <span className="text-purple-300 font-semibold">{item.wickets || 0}</span> Wkts</span>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-surface-600/40 flex items-center justify-between text-xs">
        <span className="text-gray-400 font-semibold">Rank Score</span>
        <span className="font-black text-brand-400 text-lg">{item.rankingPoints} pts</span>
      </div>
    </div>
  );
}

