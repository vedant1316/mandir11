import { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { matchesApi } from '../services/api';
import { LoadingSpinner, ConfirmDialog } from '../components/ui';

export default function ResultEntry() {
  const { matchId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [match, setMatch] = useState(location.state?.match || null);
  const [loading, setLoading] = useState(!match);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [confirmEnd, setConfirmEnd] = useState(false);

  // Form state
  const [teamAScore, setTeamAScore] = useState('');
  const [teamBScore, setTeamBScore] = useState('');
  const [winnerId, setWinnerId] = useState('');
  const [endReason, setEndReason] = useState('completed');

  useEffect(() => {
    if (!match) {
      (async () => {
        try {
          const res = await matchesApi.get(matchId);
          setMatch(res.data);
        } catch {
          setError('Match not found.');
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [matchId, match]);

  if (loading) return <div className="page"><div className="container-app"><LoadingSpinner /></div></div>;
  if (error || !match) return (
    <div className="page"><div className="container-app">
      <div className="card p-8 text-center">
        <p className="text-red-400">{error || 'Match not found'}</p>
      </div>
    </div></div>
  );

  if (match.status === 'completed' || match.status === 'abandoned') {
    navigate(`/matches/${matchId}`, { replace: true });
    return null;
  }

  const teamA = match.teams?.find((t) => t.label === 'Team A');
  const teamB = match.teams?.find((t) => t.label === 'Team B');

  const handleSubmitResult = async () => {
    if (!winnerId) { setError('Select a winner.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      await matchesApi.enterResult(
        matchId,
        teamAScore !== '' ? parseInt(teamAScore) : null,
        teamBScore !== '' ? parseInt(teamBScore) : null,
        winnerId,
      );
      setConfirmEnd(true);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to submit result.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEndMatch = async () => {
    setConfirmEnd(false);
    setSubmitting(true);
    try {
      await matchesApi.end(matchId, endReason);
      navigate(`/matches/${matchId}`);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to end match.');
    } finally {
      setSubmitting(false);
    }
  };

  const SPORT_EMOJI = { volleyball: '🏐', badminton: '🏸', cricket: '🏏' };

  return (
    <div className="page">
      <div className="container-app max-w-lg">
        <div className="mb-6">
          <button onClick={() => navigate(-1)} className="btn-ghost btn btn-sm mb-4">
            ← Back
          </button>
          <h1 className="page-title flex items-center gap-2">
            {SPORT_EMOJI[match.sport]} Enter Result
          </h1>
          <p className="text-sm text-gray-500 mt-1 capitalize">{match.sport} · {match.status}</p>
        </div>

        {error && (
          <div id="result-error" className="mb-5 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="card p-6 space-y-6">
          {/* Scores */}
          <div className="grid grid-cols-2 gap-4">
            {/* Team A */}
            <div>
              <label className="label text-brand-300">Team A Score</label>
              <p className="text-xs text-gray-600 mb-2">
                {teamA?.players?.map((tp) => tp.player?.name).join(', ')}
              </p>
              <input
                id="input-team-a-score"
                type="number"
                min="0"
                className="input text-center text-xl font-bold"
                placeholder="—"
                value={teamAScore}
                onChange={(e) => setTeamAScore(e.target.value)}
              />
            </div>

            {/* Team B */}
            <div>
              <label className="label text-amber-400">Team B Score</label>
              <p className="text-xs text-gray-600 mb-2">
                {teamB?.players?.map((tp) => tp.player?.name).join(', ')}
              </p>
              <input
                id="input-team-b-score"
                type="number"
                min="0"
                className="input text-center text-xl font-bold"
                placeholder="—"
                value={teamBScore}
                onChange={(e) => setTeamBScore(e.target.value)}
              />
            </div>
          </div>

          {/* Winner */}
          <div>
            <label className="label">Winner</label>
            <div className="grid grid-cols-2 gap-3">
              {[teamA, teamB].filter(Boolean).map((team) => (
                <button
                  key={team.id}
                  id={`winner-${team.id}`}
                  type="button"
                  onClick={() => setWinnerId(team.id)}
                  className={`p-4 rounded-xl border text-center transition-all duration-200 ${
                    winnerId === team.id
                      ? 'bg-brand-500/20 border-brand-500 text-white'
                      : 'bg-surface-700 border-surface-500 text-gray-400 hover:border-brand-500/40'
                  }`}
                >
                  <p className={`font-bold ${team.label === 'Team A' ? 'text-brand-300' : 'text-amber-400'}`}>
                    {team.label}
                  </p>
                  <p className="text-xs mt-1 text-gray-500">
                    {team.players?.length} player{team.players?.length !== 1 ? 's' : ''}
                  </p>
                  {winnerId === team.id && <p className="text-xs text-emerald-400 mt-1">🏆 Winner</p>}
                </button>
              ))}
            </div>
          </div>

          {/* End reason */}
          <div>
            <label className="label">End Reason</label>
            <select
              id="select-end-reason"
              className="input"
              value={endReason}
              onChange={(e) => setEndReason(e.target.value)}
            >
              <option value="completed">Completed normally</option>
              <option value="time">Time limit reached</option>
              <option value="rain">Rain</option>
              <option value="players_unavailable">Players unavailable</option>
              <option value="other">Other</option>
            </select>
          </div>

          <button
            id="btn-submit-result"
            onClick={handleSubmitResult}
            disabled={submitting || !winnerId}
            className="btn-primary btn w-full btn-lg"
          >
            {submitting ? 'Submitting…' : '🏁 Submit & End Match'}
          </button>
        </div>
      </div>

      {confirmEnd && (
        <ConfirmDialog
          title="End Match?"
          message={`This will mark the match as ${endReason}. This cannot be undone.`}
          onConfirm={handleEndMatch}
          onCancel={() => setConfirmEnd(false)}
        />
      )}
    </div>
  );
}
