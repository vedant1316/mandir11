import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { tournamentsApi, playersApi } from '../services/api';
import { LoadingSpinner, EmptyState, ErrorState } from '../components/ui';

export default function Tournaments() {
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'in_progress' | 'upcoming' | 'completed'

  // Creation Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [name, setName] = useState('');
  const [sport, setSport] = useState('cricket');
  const [format, setFormat] = useState('knockout');
  const [teamCount, setTeamCount] = useState(4);
  const [teams, setTeams] = useState([
    { name: 'Team 1', player_ids: [] },
    { name: 'Team 2', player_ids: [] },
    { name: 'Team 3', player_ids: [] },
    { name: 'Team 4', player_ids: [] },
  ]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tournamentsApi.list();
      setTournaments(res.data.tournaments);
    } catch {
      setError('Failed to load tournaments.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreateModal = async () => {
    try {
      const res = await playersApi.list(true);
      setAvailablePlayers(res.data.players || []);
      setCreateError(null);
      setName('');
      setSport('cricket');
      setFormat('knockout');
      setTeamCount(4);
      setTeams([
        { name: 'Team 1', player_ids: [] },
        { name: 'Team 2', player_ids: [] },
        { name: 'Team 3', player_ids: [] },
        { name: 'Team 4', player_ids: [] },
      ]);
      setShowCreateModal(true);
    } catch {
      alert('Could not load players.');
    }
  };

  const handleTeamCountChange = (count) => {
    setTeamCount(count);
    const updated = [];
    for (let i = 0; i < count; i++) {
      updated.push(teams[i] || { name: `Team ${i + 1}`, player_ids: [] });
    }
    setTeams(updated);
  };

  const handlePlayerToggle = (teamIdx, playerId) => {
    setTeams((prev) => {
      const copy = prev.map((t, idx) => {
        if (idx !== teamIdx) {
          // Remove player from other teams if already selected
          return { ...t, player_ids: t.player_ids.filter((id) => id !== playerId) };
        }
        const exists = t.player_ids.includes(playerId);
        const player_ids = exists
          ? t.player_ids.filter((id) => id !== playerId)
          : [...t.player_ids, playerId];
        return { ...t, player_ids };
      });
      return copy;
    });
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setCreateError('Please enter a tournament name.');
      return;
    }

    for (let i = 0; i < teams.length; i++) {
      if (teams[i].player_ids.length === 0) {
        setCreateError(`Please assign at least 1 player to ${teams[i].name || `Team ${i + 1}`}.`);
        return;
      }
    }

    setCreating(true);
    setCreateError(null);
    try {
      const res = await tournamentsApi.create({
        name: name.trim(),
        sport,
        format,
        teams: teams.map((t, i) => ({
          name: (t.name || `Team ${i + 1}`).trim(),
          player_ids: t.player_ids,
        })),
      });
      setShowCreateModal(false);
      navigate(`/tournaments/${res.data.id}`);
    } catch (err) {
      setCreateError(err.response?.data?.detail || err.message || 'Failed to create tournament.');
      setCreating(false);
    }
  };

  const filteredTournaments = tournaments.filter((t) => {
    if (statusFilter === 'all') return true;
    return t.status === statusFilter;
  });

  return (
    <div className="page pb-16">
      <div className="container-app max-w-4xl space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <span>🏆</span> Tournaments & Cups
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Organize colony tournaments with automatic knockout brackets & points tables
            </p>
          </div>

          <button
            id="btn-new-tournament"
            onClick={openCreateModal}
            className="btn-primary btn self-start sm:self-auto"
          >
            ➕ Create Tournament
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 border-b border-surface-600/50 pb-2 overflow-x-auto">
          {[
            { id: 'all', label: `All (${tournaments.length})` },
            {
              id: 'in_progress',
              label: `In Progress (${tournaments.filter((t) => t.status === 'in_progress').length})`,
            },
            {
              id: 'upcoming',
              label: `Upcoming (${tournaments.filter((t) => t.status === 'upcoming').length})`,
            },
            {
              id: 'completed',
              label: `Completed (${tournaments.filter((t) => t.status === 'completed').length})`,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                statusFilter === tab.id
                  ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/25'
                  : 'bg-surface-800 text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="py-12">
            <LoadingSpinner label="Loading tournaments..." />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : filteredTournaments.length === 0 ? (
          <EmptyState
            icon="🏆"
            title="No tournaments found"
            description={
              statusFilter === 'all'
                ? 'Create the first colony tournament or cup above!'
                : `No ${statusFilter.replace('_', ' ')} tournaments right now.`
            }
            action={
              statusFilter === 'all' && (
                <button onClick={openCreateModal} className="btn-primary btn btn-sm">
                  ➕ Create Tournament
                </button>
              )
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 animate-slide-up">
            {filteredTournaments.map((t) => (
              <TournamentCard key={t.id} tournament={t} />
            ))}
          </div>
        )}
      </div>

      {/* ── Create Tournament Modal ─────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="card max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden bg-surface-800 border-surface-600 shadow-2xl">
            {/* Modal Header */}
            <div className="p-5 border-b border-surface-600/50 flex items-center justify-between">
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <span>🏆</span> New Tournament
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-white font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCreateSubmit} className="p-6 space-y-6 overflow-y-auto flex-1">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-gray-400">
                  Tournament Name
                </label>
                <input
                  id="input-tournament-name"
                  type="text"
                  className="input w-full"
                  placeholder="e.g. Colony Premier League 2026"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  required
                />
              </div>

              {/* Sport & Format grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-gray-400">Sport</label>
                  <select
                    id="select-tournament-sport"
                    className="input w-full"
                    value={sport}
                    onChange={(e) => setSport(e.target.value)}
                  >
                    <option value="cricket">🏏 Cricket</option>
                    <option value="volleyball">🏐 Volleyball</option>
                    <option value="badminton">🏸 Badminton</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-gray-400">Format</label>
                  <select
                    id="select-tournament-format"
                    className="input w-full"
                    value={format}
                    onChange={(e) => {
                      const newFormat = e.target.value;
                      setFormat(newFormat);
                      if (newFormat === 'knockout' && ![2, 4, 8].includes(teamCount)) {
                        handleTeamCountChange(4);
                      }
                    }}
                  >
                    <option value="knockout">🥊 Knockout Bracket</option>
                    <option value="round_robin">🔄 Round Robin / League</option>
                  </select>
                </div>
              </div>

              {/* Team Count Selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-gray-400">
                  Number of Teams
                </label>
                <div className="flex gap-2">
                  {(format === 'knockout' ? [2, 4, 8] : [2, 3, 4, 5, 6]).map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => handleTeamCountChange(count)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        teamCount === count
                          ? 'bg-brand-500 text-white'
                          : 'bg-surface-700 text-gray-300 hover:text-white'
                      }`}
                    >
                      {count} Teams
                    </button>
                  ))}
                </div>
              </div>

              {/* Team Setup & Player Assignment */}
              <div className="space-y-4 pt-2 border-t border-surface-600/50">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase text-gray-400">
                    Team Lineups ({teams.length} Teams)
                  </h3>
                  <span className="text-[11px] text-gray-500">
                    Assign players to each team
                  </span>
                </div>

                <div className="space-y-4">
                  {teams.map((t, teamIdx) => (
                    <div
                      key={teamIdx}
                      className="p-4 rounded-xl bg-surface-700/40 border border-surface-600/40 space-y-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-brand-500/20 text-brand-300 font-bold flex items-center justify-center text-xs">
                          {teamIdx + 1}
                        </span>
                        <input
                          type="text"
                          className="input flex-1 py-1 text-xs"
                          placeholder={`Team ${teamIdx + 1} Name`}
                          value={t.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setTeams((prev) =>
                              prev.map((item, idx) =>
                                idx === teamIdx ? { ...item, name: val } : item
                              )
                            );
                          }}
                        />
                        <span className="text-xs text-gray-400 font-semibold">
                          {t.player_ids.length} players
                        </span>
                      </div>

                      {/* Player checkboxes */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 max-h-32 overflow-y-auto">
                        {availablePlayers.map((p) => {
                          const isSelected = t.player_ids.includes(p.id);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => handlePlayerToggle(teamIdx, p.id)}
                              className={`p-2 rounded-lg text-left text-xs font-medium flex items-center gap-2 transition-all ${
                                isSelected
                                  ? 'bg-brand-500/25 border border-brand-500/40 text-brand-200'
                                  : 'bg-surface-800 text-gray-400 hover:text-white'
                              }`}
                            >
                              <span>{isSelected ? '✓' : '+'}</span>
                              <span className="truncate">{p.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {createError && <p className="text-xs text-red-400 font-semibold">{createError}</p>}

              {/* Submit footer */}
              <div className="pt-4 border-t border-surface-600/50 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn-secondary btn btn-sm"
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  id="btn-create-tournament-submit"
                  type="submit"
                  className="btn-primary btn btn-sm"
                  disabled={creating}
                >
                  {creating ? 'Generating Fixtures…' : 'Create & Generate Fixtures'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function TournamentCard({ tournament }) {
  const sportEmoji = { cricket: '🏏', volleyball: '🏐', badminton: '🏸' }[tournament.sport] || '🏆';

  return (
    <Link
      to={`/tournaments/${tournament.id}`}
      className="card p-5 space-y-4 hover:border-brand-500/50 transition-all duration-200 hover:-translate-y-0.5 group block"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-xl flex-shrink-0">
            {sportEmoji}
          </div>
          <div>
            <h2 className="font-bold text-white group-hover:text-brand-300 transition-colors line-clamp-1 text-base">
              {tournament.name}
            </h2>
            <p className="text-xs text-gray-400 capitalize">
              {tournament.sport} · {tournament.format.replace('_', ' ')}
            </p>
          </div>
        </div>

        <span
          className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase ${
            tournament.status === 'completed'
              ? 'badge-green'
              : tournament.status === 'in_progress'
              ? 'badge-blue animate-pulse'
              : 'badge-gray'
          }`}
        >
          {tournament.status.replace('_', ' ')}
        </span>
      </div>

      {/* Champion banner if completed */}
      {tournament.winner_team_name && (
        <div className="p-2.5 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-between text-xs">
          <span className="text-amber-300 font-semibold">👑 Champion</span>
          <span className="font-black text-amber-200">{tournament.winner_team_name}</span>
        </div>
      )}

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[11px] text-gray-400">
          <span>
            {tournament.completedFixtures} of {tournament.totalFixtures} matches played
          </span>
          <span className="font-bold text-white">{tournament.progressPercent}%</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-surface-700 overflow-hidden">
          <div
            className="h-full bg-brand-500 transition-all duration-300"
            style={{ width: `${tournament.progressPercent}%` }}
          />
        </div>
      </div>

      <div className="pt-2 border-t border-surface-600/40 flex items-center justify-between text-xs text-gray-400">
        <span>{tournament.teams?.length || 0} Teams</span>
        <span className="text-brand-400 font-bold group-hover:translate-x-0.5 transition-transform">
          View Fixtures & Standings →
        </span>
      </div>
    </Link>
  );
}
