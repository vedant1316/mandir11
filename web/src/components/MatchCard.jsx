import { Link } from 'react-router-dom';

const SPORT_EMOJI = { cricket: '🏏', volleyball: '🏐', badminton: '🏸' };
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

  return (
    <Link
      to={`/matches/${match.id}`}
      id={`match-card-${match.id}`}
      className="card-hover block p-5 animate-slide-up"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{SPORT_EMOJI[match.sport] || '🎮'}</span>
          <div>
            <p className="font-semibold text-white capitalize">{match.sport}</p>
            <p className="text-xs text-gray-500">
              {new Date(match.date).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric'
              })}
            </p>
          </div>
        </div>
        <span className={STATUS_CLASS[match.status] || 'badge-gray'}>
          {match.status === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
          {match.status}
        </span>
      </div>

      {/* Teams */}
      {(teamA || teamB) ? (
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-surface-700 rounded-xl p-3">
            <p className="font-semibold text-brand-300 mb-1">Team A</p>
            <p className="text-gray-400 leading-relaxed">{teamPlayerNames(teamA)}</p>
            {match.result && (
              <p className="mt-2 font-bold text-white text-sm">
                {match.result.team_a_score ?? '—'}
              </p>
            )}
          </div>
          <div className="bg-surface-700 rounded-xl p-3">
            <p className="font-semibold text-amber-400 mb-1">Team B</p>
            <p className="text-gray-400 leading-relaxed">{teamPlayerNames(teamB)}</p>
            {match.result && (
              <p className="mt-2 font-bold text-white text-sm">
                {match.result.team_b_score ?? '—'}
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-600 italic">Teams not yet assigned</p>
      )}

      {/* Winner */}
      {winner && (
        <div className="mt-3 flex items-center gap-2 text-xs text-emerald-400">
          <span>🏆</span>
          <span className="font-semibold">{winner.label} won</span>
        </div>
      )}
    </Link>
  );
}
