import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { matchesApi, playersApi, cricketApi } from '../services/api';
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
  const [cricketScorecard, setCricketScorecard] = useState(null);
  const [allPlayers, setAllPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pomPlayer, setPomPlayer] = useState('');
  const [pomSubmitting, setPomSubmitting] = useState(false);
  const [pomError, setPomError] = useState(null);
  const [abandonConfirm, setAbandonConfirm] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const [scorecardTab, setScorecardTab] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [matchRes, playersRes] = await Promise.all([
        matchesApi.get(matchId),
        playersApi.list(false),
      ]);
      const m = matchRes.data;
      setMatch(m);
      setAllPlayers(playersRes.data.players);

      if (m.sport === 'cricket') {
        const scRes = await cricketApi.getMatchScorecard(matchId);
        setCricketScorecard(scRes.data);
      }
    } catch {
      setError('Match not found.');
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    load();
  }, [load]);

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

  const selectedInnScorecard = cricketScorecard?.innings.find(
    (i) => i.innings.innings_number === scorecardTab
  );

  return (
    <div className="page pb-16">
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
                <p className="text-emerald-300 font-bold">
                  {match.sport === 'cricket' && cricketScorecard?.resultSummary
                    ? cricketScorecard.resultSummary
                    : `${winner.label} won!`}
                </p>
                {match.result?.team_a_score !== null && match.result?.team_b_score !== null && (
                  <p className="text-sm text-gray-400">
                    {match.sport === 'cricket'
                      ? `Team A: ${match.result.team_a_score} · Team B: ${match.result.team_b_score}`
                      : `${match.result.team_a_score} – ${match.result.team_b_score}`}
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

        {/* Teams Overview */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <TeamDetailCard
            id="team-a-detail"
            team={teamA}
            result={match.result}
            isWinner={winner?.label === 'Team A'}
            scoreKey="team_a_score"
            sport={match.sport}
            cricketInnings={cricketScorecard?.innings.find((i) => i.battingTeam?.label === 'Team A')}
          />
          <TeamDetailCard
            id="team-b-detail"
            team={teamB}
            result={match.result}
            isWinner={winner?.label === 'Team B'}
            scoreKey="team_b_score"
            sport={match.sport}
            cricketInnings={cricketScorecard?.innings.find((i) => i.battingTeam?.label === 'Team B')}
          />
        </div>

        {/* ── Cricket Scorecard Details ──────────────────────────── */}
        {match.sport === 'cricket' && cricketScorecard && cricketScorecard.innings.length > 0 && (
          <div className="card p-5 mb-6 space-y-4">
            <h3 className="section-title text-base flex items-center gap-2">
              <span>📊</span> Full Cricket Scorecard
            </h3>

            {/* Innings Tabs */}
            {cricketScorecard.innings.length > 1 && (
              <div className="flex gap-2 pb-2 border-b border-surface-600/40">
                {cricketScorecard.innings.map((inn) => (
                  <button
                    key={inn.innings.id}
                    onClick={() => setScorecardTab(inn.innings.innings_number)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      scorecardTab === inn.innings.innings_number
                        ? 'bg-brand-500 text-white'
                        : 'bg-surface-700 text-gray-400 hover:text-white'
                    }`}
                  >
                    Inn {inn.innings.innings_number}: {inn.battingTeam?.label} ({inn.totalRuns}/{inn.totalWickets})
                  </button>
                ))}
              </div>
            )}

            {selectedInnScorecard && (
              <div className="space-y-5">
                {/* Batting Table */}
                <div>
                  <h4 className="text-xs uppercase font-bold text-brand-300 mb-2">
                    Batting · {selectedInnScorecard.battingTeam?.label}
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-surface-600 text-gray-500">
                          <th className="pb-2 font-medium">Batter</th>
                          <th className="pb-2 font-medium">Dismissal</th>
                          <th className="pb-2 font-medium text-right">R</th>
                          <th className="pb-2 font-medium text-right">B</th>
                          <th className="pb-2 font-medium text-right">4s</th>
                          <th className="pb-2 font-medium text-right">6s</th>
                          <th className="pb-2 font-medium text-right">SR</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-700/40">
                        {selectedInnScorecard.battingScorecard.map((b) => (
                          <tr key={b.id} className="text-gray-300">
                            <td className="py-2 font-semibold text-white">
                              {b.player?.name}
                              {b.status === 'batting' && !selectedInnScorecard.isInningsClosed && (
                                <span className="text-brand-400 ml-1">*</span>
                              )}
                            </td>
                            <td className="py-2 text-[11px] text-gray-400">
                              {b.isOut
                                ? `${b.dismissalType} ${b.dismissedBy ? `b ${b.dismissedBy}` : ''}`
                                : b.status === 'batting'
                                ? 'not out'
                                : 'yet to bat'}
                            </td>
                            <td className="py-2 text-right font-bold text-white">{b.runs}</td>
                            <td className="py-2 text-right text-gray-400">{b.balls}</td>
                            <td className="py-2 text-right text-gray-400">{b.fours}</td>
                            <td className="py-2 text-right text-gray-400">{b.sixes}</td>
                            <td className="py-2 text-right text-gray-400">{b.strikeRate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-2 pt-2 border-t border-surface-600/50 flex justify-between text-xs text-gray-400">
                    <span>
                      Extras: <strong>{selectedInnScorecard.extras.totalExtras}</strong> (wd {selectedInnScorecard.extras.wides}, nb {selectedInnScorecard.extras.noBalls})
                    </span>
                    <span>
                      Total: <strong className="text-white text-sm">{selectedInnScorecard.totalRuns}/{selectedInnScorecard.totalWickets}</strong> ({selectedInnScorecard.oversFormatted} ov)
                    </span>
                  </div>
                </div>

                {/* Bowling Table */}
                <div>
                  <h4 className="text-xs uppercase font-bold text-amber-400 mb-2">
                    Bowling · {selectedInnScorecard.bowlingTeam?.label}
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-surface-600 text-gray-500">
                          <th className="pb-2 font-medium">Bowler</th>
                          <th className="pb-2 font-medium text-right">O</th>
                          <th className="pb-2 font-medium text-right">M</th>
                          <th className="pb-2 font-medium text-right">R</th>
                          <th className="pb-2 font-medium text-right">W</th>
                          <th className="pb-2 font-medium text-right">Econ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-700/40">
                        {selectedInnScorecard.bowlingScorecard.map((bw) => (
                          <tr key={bw.id} className="text-gray-300">
                            <td className="py-2 font-semibold text-white">{bw.player?.name}</td>
                            <td className="py-2 text-right text-gray-300">{bw.oversFormatted}</td>
                            <td className="py-2 text-right text-gray-400">{bw.maidens}</td>
                            <td className="py-2 text-right font-bold text-white">{bw.runs}</td>
                            <td className="py-2 text-right font-black text-brand-400">{bw.wickets}</td>
                            <td className="py-2 text-right text-gray-400">{bw.economy}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Fall of Wickets */}
                {selectedInnScorecard.fallOfWickets?.length > 0 && (
                  <div>
                    <h4 className="text-xs uppercase font-bold text-gray-400 mb-1">Fall of Wickets</h4>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      {selectedInnScorecard.fallOfWickets
                        .map((f) => `${f.score}-${f.wicketNumber} (${f.batterName}, ${f.overs} ov)`)
                        .join(', ')}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Match actions */}
        <div className="space-y-4">
          {/* Enter result / score */}
          {match.status === 'live' && (
            <Link
              to={match.sport === 'cricket' ? `/matches/${matchId}/score` : `/matches/${matchId}/result`}
              id="btn-enter-result"
              className="btn-primary btn w-full block text-center btn-lg"
            >
              {match.sport === 'cricket' ? '🏏 Open Live Scorer' : 'Enter Result'}
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

          {/* Player of Match selection for completed match */}
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

function TeamDetailCard({ id, team, result, isWinner, scoreKey, sport, cricketInnings }) {
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

      {sport === 'cricket' && cricketInnings ? (
        <p className={`text-2xl font-black mb-3 ${isWinner ? 'text-emerald-300' : 'text-white'}`}>
          {cricketInnings.totalRuns}/{cricketInnings.totalWickets}{' '}
          <span className="text-xs font-normal text-gray-400">({cricketInnings.oversFormatted} ov)</span>
        </p>
      ) : score !== null && score !== undefined ? (
        <p className={`text-3xl font-black mb-3 ${isWinner ? 'text-emerald-300' : 'text-white'}`}>
          {score}
        </p>
      ) : null}

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
