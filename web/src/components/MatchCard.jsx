import { Link } from 'react-router-dom';

const SPORT_EMOJI = { cricket: '🏏', volleyball: '🏐', badminton: '🏸', position: '🏅' };
const STATUS_CLASS = {
  upcoming: 'status-upcoming',
  live: 'status-live',
  completed: 'status-completed',
  abandoned: 'status-abandoned',
};

function getTeam(match, label) {
  return match.teams?.find((t) => t.label === label);
}

function getWinner(match) {
  if (!match.result) return null;
  return match.teams?.find((t) => t.id === match.result.winning_team_id);
}

function teamPlayerNames(team) {
  if (!team?.players?.length) return 'No players';
  return team.players
    .map((tp) => tp.player?.name || tp.player_id)
    .join(', ');
}

export default function MatchCard({ match }) {
  const teamA = getTeam(match, 'Team A');
  const teamB = getTeam(match, 'Team B');
  const winner = getWinner(match);

  const isPositionMatch = match.sport === 'position';
  const positionRankings = (match.result?.hydratedRankings || match.result?.rankings || []).sort(
    (a, b) => (a.position || 0) - (b.position || 0)
  );
  const positionWinner = positionRankings.find((r) => r.position === 1);
  const positionWinnerName = positionWinner?.player?.name;

  const destination =
    match.sport === 'cricket' && match.status === 'live'
      ? `/matches/${match.id}/score`
      : `/matches/${match.id}`;

  return (
    <Link
      to={destination}
      id={`match-card-${match.id}`}
      className="card-hover block p-5 animate-slide-up"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{SPORT_EMOJI[match.sport] || '🎮'}</span>
          <div>
            <p className="font-semibold text-white capitalize">
              {isPositionMatch ? 'Position Match' : match.sport}
            </p>
            <p className="text-xs text-gray-500">
              {new Date(match.date).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric'
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {match.sport === 'cricket' && match.status === 'live' && (
            <span className="badge-blue text-[10px]">Score 🏏</span>
          )}
          <span className={STATUS_CLASS[match.status] || 'badge-gray'}>
            {match.status === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
            {match.status}
          </span>
        </div>
      </div>

      {/* Position Match Content */}
      {isPositionMatch ? (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-brand-300">
              {positionRankings.length} Players
            </span>
            {positionWinnerName && (
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <span>Winner:</span>
                <span className="text-white">{positionWinnerName}</span>
                <span>🏆</span>
              </span>
            )}
          </div>

          {positionRankings.length > 0 && (
            <div className="bg-surface-700/60 rounded-xl p-3 space-y-1.5 text-xs">
              {positionRankings.map((r) => (
                <div key={r.player_id} className="flex items-center justify-between">
                  <span className="text-gray-300 font-medium truncate">
                    {r.position === 1 ? '🥇' : r.position === 2 ? '🥈' : r.position === 3 ? '🥉' : `${r.position}.`} {r.player?.name || 'Player'}
                  </span>
                  <span className={`font-bold ml-2 ${r.points > 0 ? 'text-emerald-400' : 'text-gray-500'}`}>
                    {r.points} pts
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (teamA || teamB) ? (
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-surface-700 rounded-xl p-3">
            <p className="font-semibold text-brand-300 mb-1">Team A</p>
            <p className="text-gray-400 leading-relaxed">{teamPlayerNames(teamA)}</p>
            {match.result && (
              <p className="mt-2 font-bold text-white text-sm">
                {match.result.team_a_score !== null && match.result.team_a_score !== undefined
                  ? match.result.team_a_score
                  : '—'}
              </p>
            )}
          </div>
          <div className="bg-surface-700 rounded-xl p-3">
            <p className="font-semibold text-amber-400 mb-1">Team B</p>
            <p className="text-gray-400 leading-relaxed">{teamPlayerNames(teamB)}</p>
            {match.result && (
              <p className="mt-2 font-bold text-white text-sm">
                {match.result.team_b_score !== null && match.result.team_b_score !== undefined
                  ? match.result.team_b_score
                  : '—'}
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-600 italic">Teams not yet assigned</p>
      )}

      {/* Winner for non-position matches */}
      {!isPositionMatch && winner && (
        <div className="mt-3 flex items-center gap-2 text-xs text-emerald-400">
          <span>🏆</span>
          <span className="font-semibold">{winner.label} won</span>
        </div>
      )}
    </Link>
  );
}
