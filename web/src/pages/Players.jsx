import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { playersApi } from '../services/api';
import { LoadingSpinner, EmptyState, ErrorState, ConfirmDialog } from '../components/ui';

export default function Players() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState(null);
  const [confirm, setConfirm] = useState(null); // { player, targetActive }

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await playersApi.list(false);
      setPlayers(res.data.players);
    } catch {
      setError('Failed to load players.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      await playersApi.create(newName.trim());
      setNewName('');
      await load();
    } catch (err) {
      setAddError(err.response?.data?.detail || err.message || 'Failed to add player.');
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async () => {
    if (!confirm) return;
    const { player, targetActive } = confirm;
    setConfirm(null);
    try {
      await playersApi.toggle(player.id, targetActive);
      await load();
    } catch {
      // silent — reload will show current state
    }
  };

  const activeCount = players.filter((p) => p.is_active).length;

  return (
    <div className="page">
      <div className="container-app">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="page-title">Players</h1>
            {!loading && (
              <p className="text-sm text-gray-500 mt-1">
                {activeCount} active · {players.length - activeCount} inactive
              </p>
            )}
          </div>
        </div>

        {/* Add player form */}
        <form onSubmit={handleAdd} id="form-add-player" className="card p-5 mb-8">
          <h2 className="section-title mb-4">Add Player</h2>
          <div className="flex gap-3">
            <input
              id="input-player-name"
              type="text"
              className="input flex-1"
              placeholder="Player name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={adding}
              maxLength={100}
            />
            <button
              id="btn-add-player"
              type="submit"
              className="btn-primary btn"
              disabled={adding || !newName.trim()}
            >
              {adding ? 'Adding…' : 'Add Player'}
            </button>
          </div>
          {addError && (
            <p className="mt-2 text-sm text-red-400">{addError}</p>
          )}
        </form>

        {/* Player list */}
        {loading ? (
          <LoadingSpinner label="Loading players..." />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : players.length === 0 ? (
          <EmptyState
            icon="👥"
            title="No players yet"
            description="Add the first player above."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {players.map((player) => (
              <div
                key={player.id}
                id={`player-row-${player.id}`}
                className={`card p-4 flex items-center gap-3 ${
                  !player.is_active ? 'opacity-60' : ''
                }`}
              >
                {/* Avatar */}
                <Link
                  to={`/players/${player.id}`}
                  className="w-10 h-10 rounded-full bg-brand-500/20 hover:bg-brand-500/30 flex items-center justify-center text-brand-300 font-bold text-lg flex-shrink-0 transition-colors"
                >
                  {player.name.charAt(0).toUpperCase()}
                </Link>

                {/* Name + status */}
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/players/${player.id}`}
                    className="font-semibold text-white truncate hover:text-brand-300 transition-colors block"
                  >
                    {player.name}
                  </Link>
                  <div className="mt-0.5">
                    {player.is_active ? (
                      <span className="badge-green">Active</span>
                    ) : (
                      <span className="badge-red">Inactive</span>
                    )}
                  </div>
                </div>

                {/* Toggle */}
                <button
                  id={`btn-toggle-${player.id}`}
                  type="button"
                  onClick={() => setConfirm({ player, targetActive: !player.is_active })}
                  className={`btn btn-sm ${
                    player.is_active ? 'btn-secondary' : 'btn-primary'
                  }`}
                >
                  {player.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation dialog */}
      {confirm && (
        <ConfirmDialog
          title={confirm.targetActive ? 'Activate Player' : 'Deactivate Player'}
          message={
            confirm.targetActive
              ? `Make ${confirm.player.name} available for new matches?`
              : `Deactivate ${confirm.player.name}? They won't be selectable for new matches.`
          }
          onConfirm={handleToggle}
          onCancel={() => setConfirm(null)}
          dangerous={!confirm.targetActive}
        />
      )}
    </div>
  );
}
