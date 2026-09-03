import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { matchesApi } from '../services/api';
import MatchCard from '../components/MatchCard';
import { LoadingSpinner, EmptyState, ErrorState } from '../components/ui';

const SPORTS = ['cricket', 'volleyball', 'badminton'];
const STATUSES = ['upcoming', 'live', 'completed', 'abandoned'];

export default function MatchHistory() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [sportFilter, setSportFilter] = useState(searchParams.get('sport') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [matches, setMatches] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const LIMIT = 20;

  // Keep filters in sync if URL query params change (e.g. back/forward or navigation from dashboard)
  useEffect(() => {
    const urlSport = searchParams.get('sport') || '';
    const urlStatus = searchParams.get('status') || '';
    setSportFilter(urlSport);
    setStatusFilter(urlStatus);
    setPage(0);
  }, [searchParams]);

  const updateFilters = (newSport, newStatus) => {
    setSportFilter(newSport);
    setStatusFilter(newStatus);
    setPage(0);
    const nextParams = {};
    if (newSport) nextParams.sport = newSport;
    if (newStatus) nextParams.status = newStatus;
    setSearchParams(nextParams, { replace: true });
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { skip: page * LIMIT, limit: LIMIT };
      if (sportFilter) params.sport = sportFilter;
      if (statusFilter) params.status = statusFilter;
      const res = await matchesApi.list(params);
      setMatches(res.data.matches);
      setTotal(res.data.total);
    } catch {
      setError('Failed to load match history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [sportFilter, statusFilter, page]);

  return (
    <div className="page">
      <div className="container-app">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="page-title">Match History</h1>
            {!loading && <p className="text-sm text-gray-500 mt-1">{total} matches total</p>}
          </div>
        </div>

        {/* Filters */}
        <div className="card p-4 mb-6 flex flex-wrap gap-3 items-center">
          <label className="label mb-0 flex-shrink-0">Filter:</label>
          <select
            id="filter-sport"
            className="input max-w-[160px]"
            value={sportFilter}
            onChange={(e) => updateFilters(e.target.value, statusFilter)}
          >
            <option value="">All sports</option>
            {SPORTS.map((s) => (
              <option key={s} value={s} className="capitalize">{s}</option>
            ))}
          </select>

          <select
            id="filter-status"
            className="input max-w-[160px]"
            value={statusFilter}
            onChange={(e) => updateFilters(sportFilter, e.target.value)}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s} className="capitalize">{s}</option>
            ))}
          </select>

          {(sportFilter || statusFilter) && (
            <button
              id="btn-clear-filters"
              onClick={() => updateFilters('', '')}
              className="btn-ghost btn btn-sm"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <LoadingSpinner label="Loading matches..." />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : matches.length === 0 ? (
          <EmptyState
            icon="🏆"
            title="No matches found"
            description={sportFilter || statusFilter ? 'Try adjusting your filters.' : 'No matches have been created yet.'}
            action={
              <Link to="/matches/new" className="btn-primary btn btn-sm">⚡ Quick Match</Link>
            }
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {matches.map((m) => <MatchCard key={m.id} match={m} />)}
            </div>

            {/* Pagination */}
            {total > LIMIT && (
              <div className="flex items-center justify-center gap-4 mt-8">
                <button
                  id="btn-prev-page"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="btn-secondary btn btn-sm"
                >
                  ← Prev
                </button>
                <span className="text-sm text-gray-500">
                  Page {page + 1} of {Math.ceil(total / LIMIT)}
                </span>
                <button
                  id="btn-next-page"
                  disabled={(page + 1) * LIMIT >= total}
                  onClick={() => setPage((p) => p + 1)}
                  className="btn-secondary btn btn-sm"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
