import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { matchesApi, playersApi } from '../services/api';
import MatchCard from '../components/MatchCard';
import { LoadingSpinner, EmptyState, ErrorState } from '../components/ui';

export default function Dashboard() {
  const [liveMatches, setLiveMatches] = useState([]);
  const [recentMatches, setRecentMatches] = useState([]);
  const [upcomingMatches, setUpcomingMatches] = useState([]);
  const [playerCount, setPlayerCount] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [liveRes, completedRes, upcomingRes, playersRes, totalMatchesRes] = await Promise.all([
        matchesApi.list({ status: 'live', limit: 5 }),
        matchesApi.list({ status: 'completed', limit: 5 }),
        matchesApi.list({ status: 'upcoming', limit: 5 }),
        playersApi.list(true),
        matchesApi.count(),
      ]);
      setLiveMatches(liveRes.data.matches);
      setRecentMatches(completedRes.data.matches);
      setUpcomingMatches(upcomingRes.data.matches);
      setPlayerCount(playersRes.data.total);
      setTotalMatches(
        typeof totalMatchesRes?.data === 'number'
          ? totalMatchesRes.data
          : totalMatchesRes?.data?.total ?? 0
      );
    } catch {
      setError('Could not load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="page">
      {/* Hero */}
      <div className="bg-gradient-to-br from-surface-800 via-surface-800 to-brand-950 border-b border-surface-600/50">
        <div className="container-app pb-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center text-white font-black text-lg shadow-xl shadow-brand-500/40">
                  M
                </div>
                <h1 className="text-3xl font-black text-white tracking-tight">
                  Mandir <span className="text-brand-400">11</span>
                </h1>
              </div>
              <p className="text-gray-400 text-sm max-w-md">
                Colony sports platform — permanent records, no more mental bookkeeping.
              </p>
            </div>

            <div className="flex gap-3">
              <Link to="/matches/new" id="dashboard-quick-match" className="btn-primary btn btn-lg">
                ⚡ Quick Match
              </Link>
              <Link to="/matches" id="dashboard-view-history" className="btn-secondary btn btn-lg">
                Match History
              </Link>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8">
            <StatCard
              id="stat-active-players"
              label="Active Players"
              value={loading ? '—' : playerCount}
              icon="👥"
              to="/players"
            />
            <StatCard
              id="stat-live"
              label="Live Now"
              value={loading ? '—' : liveMatches.length}
              icon="🔴"
              highlight={liveMatches.length > 0}
            />
            <StatCard
              id="stat-upcoming"
              label="Upcoming"
              value={loading ? '—' : upcomingMatches.length}
              icon="📅"
            />
            <StatCard
              id="stat-matches"
              label="Total Matches"
              value={loading ? '—' : totalMatches}
              icon="🏏"
              to="/matches"
            />
          </div>
        </div>
      </div>

      <div className="container-app">
        {loading ? (
          <LoadingSpinner label="Loading dashboard..." />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <div className="space-y-10">
            {/* Live */}
            {liveMatches.length > 0 && (
              <section id="section-live">
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <h2 className="section-title">Live Matches</h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {liveMatches.map((m) => <MatchCard key={m.id} match={m} />)}
                </div>
              </section>
            )}

            {/* Upcoming */}
            <section id="section-upcoming">
              <h2 className="section-title mb-4">Upcoming Matches</h2>
              {upcomingMatches.length === 0 ? (
                <EmptyState
                  icon="📅"
                  title="No upcoming matches"
                  description="Start a Quick Match to get going!"
                  action={
                    <Link to="/matches/new" className="btn-primary btn btn-sm">
                      ⚡ Quick Match
                    </Link>
                  }
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {upcomingMatches.map((m) => <MatchCard key={m.id} match={m} />)}
                </div>
              )}
            </section>

            {/* Recent */}
            <section id="section-recent">
              <div className="flex items-center justify-between mb-4">
                <h2 className="section-title">Recent Results</h2>
                <Link to="/matches" className="text-sm text-brand-400 hover:text-brand-300 transition-colors">
                  View all →
                </Link>
              </div>
              {recentMatches.length === 0 ? (
                <EmptyState icon="🏆" title="No completed matches yet" description="Complete your first match to see results here." />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {recentMatches.map((m) => <MatchCard key={m.id} match={m} />)}
                </div>
              )}
            </section>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-16 py-8 border-t border-surface-700/50 text-center">
          <p className="text-xs text-gray-500 font-medium tracking-wide">
            This app was created by Vedant for Mandir 11
          </p>
        </footer>
      </div>
    </div>
  );
}

export function StatCard({ id, label, value, icon, highlight, to, onClick }) {
  const content = (
    <>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base select-none" aria-hidden="true">{icon}</span>
        <span className="text-xs text-gray-500 font-medium group-hover:text-gray-400 transition-colors">
          {label}
        </span>
      </div>
      <p className={`text-2xl font-black ${highlight ? 'text-emerald-400' : 'text-white'}`}>
        {value}
      </p>
    </>
  );

  const baseClasses = `card p-4 transition-all duration-200 text-left ${
    highlight ? 'border-emerald-500/30 shadow-emerald-500/10' : ''
  }`;

  const interactiveClasses =
    'cursor-pointer group hover:border-brand-500/40 hover:bg-surface-700/40 hover:shadow-lg hover:shadow-brand-500/5 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-900 select-none';

  if (to) {
    return (
      <Link
        to={to}
        id={id}
        aria-label={`${label}: ${value}`}
        className={`${baseClasses} block ${interactiveClasses}`}
      >
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        id={id}
        onClick={onClick}
        aria-label={`${label}: ${value}`}
        className={`${baseClasses} w-full ${interactiveClasses}`}
      >
        {content}
      </button>
    );
  }

  return (
    <div id={id} className={baseClasses}>
      {content}
    </div>
  );
}
