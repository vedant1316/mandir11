import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { matchesApi, playersApi } from '../services/api';
import { LoadingSpinner, ErrorState, ConfirmDialog } from '../components/ui';

const SPORT_EMOJI = { cricket: '🏏', volleyball: '🏐', badminton: '🏸' };
const STATUS_CLASS = {
  upcoming: 'status-upcoming',
  live: 'status-live',
  completed: 'status-completed',
  abandoned: 'status-abandoned',
};
const END_REASON_LABEL = {
  completed: 'Completed normally',
  time: 'Time limit',
  rain: 'Rain',
  players_unavailable: 'Players unavailable',
  other: 'Other',
};

export default function MatchDetail() {
  const { matchId } = useParams();
  const navigate = useNavigate();

  const [match, setMatch] = useState(null);
  const [allPlayers, setAllPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pomPlayer, setPomPlayer] = useState('');
  const [pomSubmitting, setPomSubmitting] = useState(false);
  const [pomError, setPomError] = useState(null);
  const [abandonConfirm, setAbandonConfirm] = useState(false);
  const [abandoning, setAbandoning] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [matchRes, playersRes] = await Promise.all([
        matchesApi.get(matchId),
        playersApi.list(false),
      ]);
      setMatch(matchRes.data);
      setAllPlayers(playersRes.data.players);
    } catch {
      setError('Match not found.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [matchId]);

  if (loading) return <div className="page"><div className="container-app"><LoadingSpinner /></div></div>;
  if (error || !match) return (
    <div className="page">
      <div className="container-app">
        <ErrorState message={error || 'Match not found'} onRetry={load} />
      </div>
    </div>
  );

  const teamA = match.teams?.find((t) => t.label === 'Team A');
  const teamB = match.teams?.find((t) => t.label === 'Team B');
  const winner = match.result
    ? match.teams?.find((t) => t.id === match.result.winning_team_id)
    : null;

  const allMatchPlayers = [
    ...(teamA?.players || []).map((tp) => ({ ...tp, team: 'A' })),
    ...(teamB?.players || []).map((tp) => ({ ...tp, team: 'B' })),
  ];

  const pomPlayerObj = match.player_of_match_id
    ? allPlayers.find((p) => p.id === match.player_of_match_id)
    : null;

  const handleSetPom = async () => {
    if (!pomPlayer) return;
    setPomSubmitting(true);
    setPomError(null);
    try {
      await matchesApi.setPlayerOfMatch(matchId, pomPlayer);
      await load();
    } catch (err) {
      setPomError(err.response?.data?.detail || err.message || 'Failed to set Player of Match.');
    } finally {
      setPomSubmitting(false);
    }
  };

  const handleAbandon = async () => {
    setAbandonConfirm(false);
    setAbandoning(true);
    try {
      await matchesApi.end(matchId, 'other');
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to abandon match.');
    } finally {
      setAbandoning(false);
    }
  };

  return (
    <div className="page">
      <div className="container-app max-w-2xl">
        {/* Back */}
        <button onClick={() => navigate(-1)} className="btn-ghost btn btn-sm mb-6">
          ← Back
        </button>

        {/* Header */}
        <div className="card p-6 mb-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{SPORT_EMOJI[match.sport]}</span>
              <div>
                <h1 className="text-xl font-black text-white capitalize">{match.sport}</h1>
                <p className="text-sm text-gray-500">
                  {new Date(match.date).toLocaleDateString('en-IN', {
                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                  })}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span id="match-status-badge" className={STATUS_CLASS[match.status]}>
                {match.status === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                {match.status}
              </span>
              {match.end_reason && (
                <span className="text-xs text-gray-500">
                  {END_REASON_LABEL[match.end_reason] || match.end_reason}
                </span>
              )}
            </div>
          </div>

          {/* Winner banner */}
          {winner && (
            <div id="winner-banner" className="mb-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3">
              <span className="text-2xl">🏆</span>
              <div>
                <p className="text-emerald-300 font-bold">{winner.label} won!</p>
                {match.result?.team_a_score !== null && match.result?.team_b_score !== null && (
                  <p className="text-sm text-gray-400">
                    {match.result.team_a_score} – {match.result.team_b_score}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Player of Match */}
          {pomPlayerObj && (
            <div id="player-of-match" className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-sm">
              <span>⭐</span>
              <span className="text-amber-300 font-semibold">Player of the Match:</span>
              <span className="text-white">{pomPlayerObj.name}</span>
            </div>
          )}
        </div>

        {/* Teams */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <TeamDetailCard
            id="team-a-detail"
            team={teamA}
            result={match.result}
            isWinner={winner?.label === 'Team A'}
            scoreKey="team_a_score"
          />
          <TeamDetailCard
            id="team-b-detail"
            team={teamB}
            result={match.result}
            isWinner={winner?.label === 'Team B'}
            scoreKey="team_b_score"
          />
        </div>

        {/* Match actions */}
        <div className="space-y-4">
          {/* Enter result / continue */}
          {match.status === 'live' && (
            <Link
              to={`/matches/${matchId}/result`}
              id="btn-enter-result"
              className="btn-primary btn w-full block text-center"
            >
              Enter Result
            </Link>
          )}

          {/* Abandon */}
          {(match.status === 'live' || match.status === 'upcoming') && (
            <button
              id="btn-abandon"
              onClick={() => setAbandonConfirm(true)}
              disabled={abandoning}
              className="btn-danger btn w-full"
            >
              {abandoning ? 'Abandoning…' : 'Abandon Match'}
            </button>
          )}

          {/* Player of Match selection */}
          {match.status === 'completed' && !match.player_of_match_id && (
            <div className="card p-5">
              <h3 className="section-title mb-4">⭐ Select Player of the Match</h3>
              <select
                id="select-pom"
                className="input mb-3"
                value={pomPlayer}
                onChange={(e) => setPomPlayer(e.target.value)}
              >
                <option value="">— Select player —</option>
                {allMatchPlayers.map((tp) => {
                  const p = allPlayers.find((pl) => pl.id === tp.player_id);
                  return p ? (
                    <option key={tp.player_id} value={tp.player_id}>
                      {p.name} (Team {tp.team})
                    </option>
                  ) : null;
                })}
              </select>
              {pomError && <p className="text-red-400 text-xs mb-2">{pomError}</p>}
              <button
                id="btn-set-pom"
                onClick={handleSetPom}
                disabled={!pomPlayer || pomSubmitting}
                className="btn-primary btn w-full"
              >
                {pomSubmitting ? 'Setting…' : 'Set Player of Match'}
              </button>
            </div>
          )}
        </div>
      </div>

      {abandonConfirm && (
        <ConfirmDialog
          title="Abandon Match?"
          message="This will mark the match as abandoned. This cannot be undone."
          onConfirm={handleAbandon}
          onCancel={() => setAbandonConfirm(false)}
          dangerous
        />
      )}
    </div>
  );
}

function TeamDetailCard({ id, team, result, isWinner, scoreKey }) {
  if (!team) return (
    <div id={id} className="card p-4">
      <p className="text-xs text-gray-600 italic">No team assigned</p>
    </div>
  );

  const score = result?.[scoreKey];
  const labelColor = team.label === 'Team A' ? 'text-brand-300' : 'text-amber-400';

  return (
    <div
      id={id}
      className={`card p-4 ${isWinner ? 'border-emerald-500/40 shadow-emerald-500/10' : ''}`}
    >
      <div className="flex items-center justify-between mb-3">
        <p className={`font-bold text-sm ${labelColor}`}>{team.label}</p>
        {isWinner && <span className="text-emerald-400 text-sm">🏆</span>}
      </div>

      {score !== null && score !== undefined && (
        <p className={`text-3xl font-black mb-3 ${isWinner ? 'text-emerald-300' : 'text-white'}`}>
          {score}
        </p>
      )}

      <div className="space-y-1">
        {team.players?.map((tp) => (
          <div key={tp.player_id} className="flex items-center gap-2 text-sm">
            <div className="w-5 h-5 rounded-full bg-surface-600 flex items-center justify-center text-xs text-gray-400 flex-shrink-0">
              {(tp.player?.name || '?').charAt(0).toUpperCase()}
            </div>
            <span className="text-gray-300 truncate">{tp.player?.name || tp.player_id}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
