import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { tournamentsApi } from '../services/api';
import { LoadingSpinner, ErrorState, ConfirmDialog } from '../components/ui';

export default function TournamentDetail() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();

  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('fixtures'); // 'fixtures' | 'standings' | 'teams'
  const [startingFixtureId, setStartingFixtureId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Advance tournament first to propagate any recent match completions
      const res = await tournamentsApi.advance(tournamentId);
      setTournament(res.data);
    } catch {
      // Fallback to get
      try {
        const getRes = await tournamentsApi.get(tournamentId);
        setTournament(getRes.data);
      } catch {
        setError('Tournament not found.');
      }
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleStartMatch = async (fixtureId) => {
    setStartingFixtureId(fixtureId);
    try {
      const res = await tournamentsApi.startFixtureMatch(fixtureId);
      const match = res.data.match;
      if (tournament.sport === 'cricket') {
        navigate(`/matches/${match.id}/score`);
      } else {
        navigate(`/matches/${match.id}/result`);
      }
    } catch (err) {
      alert(err.response?.data?.detail || err.message || 'Failed to start match.');
      setStartingFixtureId(null);
    }
  };

  const handleDelete = async () => {
    setDeleteConfirm(false);
    setDeleting(true);
    try {
      await tournamentsApi.delete(tournamentId);
      navigate('/tournaments', { replace: true });
    } catch (err) {
      alert(err.response?.data?.detail || err.message || 'Failed to delete tournament.');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div className="container-app max-w-4xl py-12">
          <LoadingSpinner label="Loading tournament details..." />
        </div>
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="page">
        <div className="container-app max-w-4xl">
          <ErrorState message={error || 'Tournament not found'} onRetry={load} />
        </div>
      </div>
    );
  }

  const sportEmoji = { cricket: '🏏', volleyball: '🏐', badminton: '🏸' }[tournament.sport] || '🏆';

  // Group fixtures by round
  const roundsMap = new Map();
  for (const f of tournament.fixtures || []) {
    const roundNum = f.round_number || 1;
    const arr = roundsMap.get(roundNum) || [];
    arr.push(f);
    roundsMap.set(roundNum, arr);
  }
  const roundEntries = Array.from(roundsMap.entries()).sort((a, b) => a[0] - b[0]);

  return (
    <div className="page pb-16">
      <div className="container-app max-w-4xl space-y-6">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <button onClick={() => navigate('/tournaments')} className="btn-ghost btn btn-sm">
            ← Tournaments
          </button>
          <button
            id="btn-delete-tournament"
            onClick={() => setDeleteConfirm(true)}
            disabled={deleting}
            className="btn-danger btn btn-sm"
          >
            {deleting ? 'Deleting…' : '🗑️ Delete Tournament'}
          </button>
        </div>

        {/* Tournament Header */}
        <div className="card p-6 bg-gradient-to-br from-surface-800 via-surface-800 to-brand-950/40 border-surface-600 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-3xl shadow-xl shadow-brand-500/20">
                {sportEmoji}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-black text-white">{tournament.name}</h1>
                  <span
                    className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase ${
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
                <p className="text-xs text-gray-400 capitalize mt-1">
                  {tournament.sport} · {tournament.format.replace('_', ' ')} ·{' '}
                  {tournament.teams?.length} Teams · {tournament.totalFixtures} Fixtures
                </p>
              </div>
            </div>

            {/* Progress */}
            <div className="w-full sm:w-48 space-y-1.5 self-end sm:self-center">
              <div className="flex justify-between text-[11px] text-gray-400">
                <span>Completed</span>
                <span className="font-bold text-white">
                  {tournament.completedFixtures}/{tournament.totalFixtures} (
                  {tournament.progressPercent}%)
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-surface-700 overflow-hidden">
                <div
                  className="h-full bg-brand-500 transition-all duration-300"
                  style={{ width: `${tournament.progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Champion Banner */}
          {tournament.winner_team_name && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-amber-400/20 to-amber-500/10 border border-amber-400/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">👑</span>
                <div>
                  <p className="text-[11px] font-bold uppercase text-amber-300">
                    Tournament Champion
                  </p>
                  <p className="text-xl font-black text-white">{tournament.winner_team_name}</p>
                </div>
              </div>
              <span className="text-xs px-3 py-1 rounded-full font-black bg-amber-400/20 text-amber-200 border border-amber-400/30">
                WINNER
              </span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-surface-600/50 pb-1 overflow-x-auto">
          {[
            {
              id: 'fixtures',
              label: tournament.format === 'knockout' ? '🥊 Knockout Bracket' : '📅 Fixtures',
            },
            ...(tournament.format !== 'knockout'
              ? [{ id: 'standings', label: '📊 Points Table' }]
              : []),
            { id: 'teams', label: `👥 Teams (${tournament.teams?.length || 0})` },
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

        {/* ── Tab 1: Fixtures / Bracket ──────────────────────────── */}
        {activeTab === 'fixtures' && (
          <div className="space-y-8 animate-slide-up">
            {roundEntries.map(([roundNum, fixtures]) => (
              <div key={roundNum} className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-brand-400" />
                  <h2 className="text-xs font-bold uppercase text-gray-400 tracking-wider">
                    {fixtures[0]?.round_label?.includes('Final')
                      ? fixtures[0].round_label
                      : `Round ${roundNum}`}
                  </h2>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {fixtures.map((f) => (
                    <FixtureCard
                      key={f.id}
                      fixture={f}
                      sport={tournament.sport}
                      onStartMatch={handleStartMatch}
                      starting={startingFixtureId === f.id}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Tab 2: Standings / Points Table ───────────────────── */}
        {activeTab === 'standings' && (
          <div className="card p-6 space-y-4 animate-slide-up">
            <h2 className="section-title text-base flex items-center justify-between">
              <span>Points Table & Standings</span>
              <span className="text-xs text-gray-400 font-normal">2 pts for Win · 1 for Tie</span>
            </h2>

            {tournament.standings?.length === 0 ? (
              <p className="text-xs text-gray-500">No standings data available yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-surface-600 text-gray-500">
                      <th className="pb-3 text-center w-12 font-semibold">#</th>
                      <th className="pb-3 font-semibold">Team</th>
                      <th className="pb-3 text-right font-semibold">P</th>
                      <th className="pb-3 text-right font-semibold">W</th>
                      <th className="pb-3 text-right font-semibold">L</th>
                      <th className="pb-3 text-right font-semibold">T</th>
                      <th className="pb-3 text-right font-semibold">Diff</th>
                      <th className="pb-3 text-right font-semibold text-brand-400">Pts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-700/50">
                    {tournament.standings.map((row) => (
                      <tr
                        key={row.team_id}
                        className={`text-gray-300 hover:bg-surface-700/40 transition-colors ${
                          row.rank === 1 && tournament.status === 'completed'
                            ? 'bg-amber-400/10'
                            : ''
                        }`}
                      >
                        <td className="py-3 text-center font-bold">
                          {row.rank === 1 && tournament.status === 'completed' ? (
                            <span className="text-amber-400 font-black">👑 1</span>
                          ) : (
                            <span className="text-gray-400">#{row.rank}</span>
                          )}
                        </td>
                        <td className="py-3 font-bold text-white flex items-center gap-2">
                          <span>{row.team_name}</span>
                          {row.rank === 1 && tournament.status === 'completed' && (
                            <span className="badge-green text-[9px] px-1.5 py-0.5">CHAMPION</span>
                          )}
                        </td>
                        <td className="py-3 text-right text-gray-400">{row.played}</td>
                        <td className="py-3 text-right font-semibold text-emerald-400">{row.won}</td>
                        <td className="py-3 text-right font-semibold text-red-400">{row.lost}</td>
                        <td className="py-3 text-right text-gray-400">{row.tied}</td>
                        <td
                          className={`py-3 text-right font-semibold ${
                            row.scoreDiff > 0
                              ? 'text-emerald-400'
                              : row.scoreDiff < 0
                              ? 'text-red-400'
                              : 'text-gray-400'
                          }`}
                        >
                          {row.scoreDiff > 0 ? `+${row.scoreDiff}` : row.scoreDiff}
                        </td>
                        <td className="py-3 text-right font-black text-brand-400 text-sm">
                          {row.points}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Tab 3: Teams & Lineups ─────────────────────────────── */}
        {activeTab === 'teams' && (
          <div className="grid gap-4 sm:grid-cols-2 animate-slide-up">
            {tournament.teams?.map((team, idx) => (
              <div key={team.id || idx} className="card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-brand-500/20 text-brand-300 font-bold flex items-center justify-center text-xs">
                      {idx + 1}
                    </div>
                    <h3 className="font-bold text-white text-base">{team.name}</h3>
                  </div>
                  <span className="badge-gray text-[10px]">
                    {team.player_ids?.length || 0} Players
                  </span>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-surface-600/40">
                  {team.player_ids?.map((pid) => (
                    <Link
                      key={pid}
                      to={`/players/${pid}`}
                      className="p-2 rounded-lg bg-surface-700/40 hover:bg-surface-700 flex items-center justify-between text-xs text-gray-300 hover:text-white transition-colors"
                    >
                      <span className="font-medium">Player Profile</span>
                      <span className="text-brand-400">View →</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      {deleteConfirm && (
        <ConfirmDialog
          title="Delete Tournament?"
          message={`Are you sure you want to delete "${tournament.name}"? This will permanently remove the tournament and its fixture schedule from this device. Completed matches will remain in standalone history.`}
          confirmText="Delete Tournament"
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(false)}
          dangerous
        />
      )}
    </div>
  );
}

function FixtureCard({ fixture, sport, onStartMatch, starting }) {
  const isReady = fixture.team_a_name && fixture.team_b_name;
  const isCompleted = fixture.status === 'completed';
  const hasMatch = Boolean(fixture.match_id);

  const teamAWon = isCompleted && fixture.winner_team_name === fixture.team_a_name;
  const teamBWon = isCompleted && fixture.winner_team_name === fixture.team_b_name;

  return (
    <div
      className={`card p-4 space-y-3 transition-all ${
        isCompleted
          ? 'border-surface-600/40 bg-surface-800/60'
          : isReady
          ? 'border-brand-500/30 bg-surface-800'
          : 'border-surface-700 opacity-60 bg-surface-850'
      }`}
    >
      <div className="flex items-center justify-between text-[11px] text-gray-400">
        <span className="font-bold uppercase text-brand-300">{fixture.round_label}</span>
        <span
          className={`px-2 py-0.5 rounded-full font-bold uppercase text-[9px] ${
            isCompleted
              ? 'badge-green'
              : hasMatch
              ? 'badge-blue animate-pulse'
              : isReady
              ? 'badge-yellow'
              : 'badge-gray'
          }`}
        >
          {isCompleted ? 'Finished' : hasMatch ? 'Live' : isReady ? 'Ready' : 'Waiting'}
        </span>
      </div>

      {/* Team matchup */}
      <div className="space-y-2 pt-1">
        {/* Team A */}
        <div
          className={`p-2.5 rounded-xl flex items-center justify-between text-xs transition-colors ${
            teamAWon
              ? 'bg-emerald-500/20 border border-emerald-500/30 font-bold text-white'
              : 'bg-surface-700/50 text-gray-300'
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            {teamAWon && <span className="text-emerald-400">✓</span>}
            <span className="truncate">
              {fixture.team_a_name || fixture.team_a_source || 'TBD'}
            </span>
          </div>
          {fixture.match?.result && (
            <span className="font-black text-white">{fixture.match.result.team_a_score ?? '—'}</span>
          )}
        </div>

        {/* Team B */}
        <div
          className={`p-2.5 rounded-xl flex items-center justify-between text-xs transition-colors ${
            teamBWon
              ? 'bg-emerald-500/20 border border-emerald-500/30 font-bold text-white'
              : 'bg-surface-700/50 text-gray-300'
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            {teamBWon && <span className="text-emerald-400">✓</span>}
            <span className="truncate">
              {fixture.team_b_name || fixture.team_b_source || 'TBD'}
            </span>
          </div>
          {fixture.match?.result && (
            <span className="font-black text-white">{fixture.match.result.team_b_score ?? '—'}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="pt-2 border-t border-surface-600/40">
        {isCompleted && fixture.match_id ? (
          <Link
            to={`/matches/${fixture.match_id}`}
            className="text-xs text-brand-400 hover:text-brand-300 font-bold block text-center py-1"
          >
            View Match Scorecard →
          </Link>
        ) : hasMatch ? (
          <Link
            to={
              sport === 'cricket'
                ? `/matches/${fixture.match_id}/score`
                : `/matches/${fixture.match_id}/result`
            }
            className="btn-primary btn btn-sm w-full"
          >
            🔴 Continue Live Scoring
          </Link>
        ) : isReady ? (
          <button
            onClick={() => onStartMatch(fixture.id)}
            disabled={starting}
            className="btn-primary btn btn-sm w-full"
          >
            {starting ? 'Initializing Match…' : '⚡ Start & Score Match'}
          </button>
        ) : (
          <p className="text-[11px] text-gray-500 text-center py-1">
            ⏳ Waiting for upstream round winner
          </p>
        )}
      </div>
    </div>
  );
}
