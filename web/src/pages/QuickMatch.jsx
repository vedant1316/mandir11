import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { matchesApi, playersApi } from '../services/api';
import PlayerBadge from '../components/PlayerBadge';

const STEPS = [
  { id: 1, label: 'Sport' },
  { id: 2, label: 'Players' },
  { id: 3, label: 'Teams' },
  { id: 4, label: 'Review' },
  { id: 5, label: 'Match' },
];

const SPORTS = [
  { id: 'volleyball', label: 'Volleyball', emoji: '🏐', desc: 'Final score entry' },
  { id: 'badminton',  label: 'Badminton',  emoji: '🏸', desc: 'Singles & Doubles, final score entry' },
  { id: 'cricket',   label: 'Cricket',    emoji: '🏏', desc: 'Coming in Phase 2', disabled: true },
];

export default function QuickMatch() {
  const navigate = useNavigate();

  // Wizard state
  const [step, setStep] = useState(1);
  const [sport, setSport] = useState(null);
  const [allPlayers, setAllPlayers] = useState([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState(new Set());
  const [teamA, setTeamA] = useState([]);  // player IDs
  const [teamB, setTeamB] = useState([]);
  const [matchId, setMatchId] = useState(null);
  const [matchData, setMatchData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load active players when reaching step 2
  useEffect(() => {
    if (step === 2) {
      (async () => {
        try {
          const res = await playersApi.list(true);
          setAllPlayers(res.data.players);
        } catch {
          setError('Failed to load players.');
        }
      })();
    }
  }, [step]);

  const togglePlayerSelect = (pid) => {
    setSelectedPlayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) {
        next.delete(pid);
        setTeamA((a) => a.filter((id) => id !== pid));
        setTeamB((b) => b.filter((id) => id !== pid));
      } else {
        next.add(pid);
      }
      return next;
    });
  };

  const moveToTeam = (pid, team) => {
    if (team === 'A') {
      setTeamA((a) => a.includes(pid) ? a : [...a, pid]);
      setTeamB((b) => b.filter((id) => id !== pid));
    } else {
      setTeamB((b) => b.includes(pid) ? b : [...b, pid]);
      setTeamA((a) => a.filter((id) => id !== pid));
    }
  };

  const removeFromTeam = (pid) => {
    setTeamA((a) => a.filter((id) => id !== pid));
    setTeamB((b) => b.filter((id) => id !== pid));
  };

  const selectedPlayers = allPlayers.filter((p) => selectedPlayerIds.has(p.id));
  const unassigned = selectedPlayers.filter(
    (p) => !teamA.includes(p.id) && !teamB.includes(p.id)
  );

  const getPlayer = (pid) => allPlayers.find((p) => p.id === pid);

  // ── Step handlers ──────────────────────────────────────────────

  const handleSportSelect = (s) => {
    if (s.disabled) return;
    setSport(s.id);
    setStep(2);
  };

  const handlePlayersNext = () => {
    if (selectedPlayerIds.size < 2) {
      setError('Select at least 2 players.');
      return;
    }
    setError(null);
    setStep(3);
  };

  const handleTeamsNext = () => {
    if (teamA.length === 0 || teamB.length === 0) {
      setError('Both teams must have at least one player.');
      return;
    }
    if (unassigned.length > 0) {
      setError('All selected players must be assigned to a team.');
      return;
    }
    setError(null);
    setStep(4);
  };

  const handleCreateMatch = async () => {
    setLoading(true);
    setError(null);
    try {
      const matchRes = await matchesApi.create(sport);
      const mid = matchRes.data.id;

      await matchesApi.createTeams(mid, [
        { label: 'Team A', player_ids: teamA },
        { label: 'Team B', player_ids: teamB },
      ]);

      const startRes = await matchesApi.start(mid);
      setMatchId(mid);
      setMatchData(startRes.data);
      setStep(5);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to create match.');
    } finally {
      setLoading(false);
    }
  };

  const handleEnterResult = () => {
    navigate(`/matches/${matchId}/result`, { state: { match: matchData } });
  };

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="page">
      <div className="container-app max-w-2xl">
        {/* Page title */}
        <div className="mb-8">
          <h1 className="page-title">⚡ Quick Match</h1>
          <p className="text-sm text-gray-500 mt-1">Set up a match in minutes</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-10 overflow-x-auto pb-1">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1 flex-shrink-0">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={
                    step === s.id
                      ? 'step-dot-active'
                      : step > s.id
                      ? 'step-dot-done'
                      : 'step-dot-inactive'
                  }
                >
                  {step > s.id ? '✓' : s.id}
                </div>
                <span className={`text-xs ${step >= s.id ? 'text-gray-300' : 'text-gray-600'}`}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`h-0.5 w-8 sm:w-12 mt-[-1rem] ${
                    step > s.id ? 'bg-brand-500' : 'bg-surface-600'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {error && (
          <div id="quickmatch-error" className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
            {error}
          </div>
        )}

        {/* ─── Step 1: Sport ────────────────────────────────────── */}
        {step === 1 && (
          <div id="step-sport" className="animate-slide-up space-y-4">
            <h2 className="section-title mb-6">Choose a sport</h2>
            {SPORTS.map((s) => (
              <button
                key={s.id}
                id={`sport-${s.id}`}
                type="button"
                disabled={s.disabled}
                onClick={() => handleSportSelect(s)}
                className={`w-full text-left card p-5 flex items-center gap-5 transition-all duration-200 ${
                  s.disabled
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:border-brand-500/40 hover:shadow-brand-500/10 cursor-pointer'
                }`}
              >
                <span className="text-4xl">{s.emoji}</span>
                <div className="flex-1">
                  <p className="font-bold text-white text-lg">{s.label}</p>
                  <p className="text-sm text-gray-500">{s.desc}</p>
                </div>
                {s.disabled && (
                  <span className="badge-blue text-xs">Phase 2</span>
                )}
                {!s.disabled && (
                  <span className="text-brand-400 text-xl">→</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* ─── Step 2: Select players ───────────────────────────── */}
        {step === 2 && (
          <div id="step-players" className="animate-slide-up">
            <div className="flex items-center justify-between mb-6">
              <h2 className="section-title">Select players</h2>
              <span className="badge-blue">{selectedPlayerIds.size} selected</span>
            </div>

            {allPlayers.length === 0 ? (
              <p className="text-gray-500 text-sm">No active players found. Add players first.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 mb-6">
                {allPlayers.map((p) => (
                  <PlayerBadge
                    key={p.id}
                    player={p}
                    selected={selectedPlayerIds.has(p.id)}
                    onClick={() => togglePlayerSelect(p.id)}
                  />
                ))}
              </div>
            )}

            <div className="flex gap-3 justify-between">
              <button id="step2-back" onClick={() => setStep(1)} className="btn-secondary btn">← Back</button>
              <button
                id="step2-next"
                onClick={handlePlayersNext}
                disabled={selectedPlayerIds.size < 2}
                className="btn-primary btn"
              >
                Assign Teams →
              </button>
            </div>
          </div>
        )}

        {/* ─── Step 3: Build teams ──────────────────────────────── */}
        {step === 3 && (
          <div id="step-teams" className="animate-slide-up">
            <h2 className="section-title mb-2">Build teams</h2>
            <p className="text-xs text-gray-500 mb-6">
              Tap a player, then assign them to Team A or B. Teams can be different sizes.
            </p>

            {/* Unassigned pool */}
            {unassigned.length > 0 && (
              <div className="mb-6">
                <p className="label">Unassigned ({unassigned.length})</p>
                <div className="grid grid-cols-2 gap-2">
                  {unassigned.map((p) => (
                    <div key={p.id} className="flex gap-1">
                      <button
                        id={`assign-a-${p.id}`}
                        type="button"
                        className="flex-1 text-xs btn-secondary btn py-1.5"
                        onClick={() => moveToTeam(p.id, 'A')}
                      >
                        {p.name} → A
                      </button>
                      <button
                        id={`assign-b-${p.id}`}
                        type="button"
                        className="flex-1 text-xs btn-secondary btn py-1.5"
                        onClick={() => moveToTeam(p.id, 'B')}
                      >
                        {p.name} → B
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* Team A */}
              <TeamSlot
                id="team-a-slot"
                label="Team A"
                color="brand"
                players={teamA.map(getPlayer).filter(Boolean)}
                onRemove={(pid) => removeFromTeam(pid)}
              />
              {/* Team B */}
              <TeamSlot
                id="team-b-slot"
                label="Team B"
                color="amber"
                players={teamB.map(getPlayer).filter(Boolean)}
                onRemove={(pid) => removeFromTeam(pid)}
              />
            </div>

            <div className="flex gap-3 justify-between">
              <button id="step3-back" onClick={() => setStep(2)} className="btn-secondary btn">← Back</button>
              <button
                id="step3-next"
                onClick={handleTeamsNext}
                disabled={teamA.length === 0 || teamB.length === 0}
                className="btn-primary btn"
              >
                Review →
              </button>
            </div>
          </div>
        )}

        {/* ─── Step 4: Review ───────────────────────────────────── */}
        {step === 4 && (
          <div id="step-review" className="animate-slide-up">
            <h2 className="section-title mb-6">Review</h2>

            <div className="card p-5 space-y-5">
              <div className="flex items-center gap-3 pb-4 border-b border-surface-600/50">
                <span className="text-2xl">
                  {{ cricket: '🏏', volleyball: '🏐', badminton: '🏸' }[sport]}
                </span>
                <div>
                  <p className="font-bold text-white capitalize">{sport}</p>
                  <p className="text-xs text-gray-500">
                    {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-semibold text-brand-300 mb-2">
                    Team A · {teamA.length} players
                  </p>
                  <ul className="space-y-1">
                    {teamA.map((pid) => (
                      <li key={pid} className="text-gray-300">
                        {getPlayer(pid)?.name}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-amber-400 mb-2">
                    Team B · {teamB.length} players
                  </p>
                  <ul className="space-y-1">
                    {teamB.map((pid) => (
                      <li key={pid} className="text-gray-300">
                        {getPlayer(pid)?.name}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-between mt-6">
              <button id="step4-back" onClick={() => setStep(3)} className="btn-secondary btn">← Edit</button>
              <button
                id="step4-start"
                onClick={handleCreateMatch}
                disabled={loading}
                className="btn-primary btn btn-lg"
              >
                {loading ? 'Creating match…' : '🏁 Start Match'}
              </button>
            </div>
          </div>
        )}

        {/* ─── Step 5: Match started ────────────────────────────── */}
        {step === 5 && matchData && (
          <div id="step-live" className="animate-slide-up text-center py-8">
            <div className="text-6xl mb-4">🏁</div>
            <h2 className="text-2xl font-black text-white mb-2">Match is Live!</h2>
            <p className="text-gray-400 text-sm mb-8">
              Match ID: <span className="font-mono text-brand-400">{matchId?.slice(0, 8)}…</span>
            </p>

            <div className="grid grid-cols-2 gap-4 mb-8 text-sm">
              <div className="card p-4 text-center">
                <p className="text-brand-300 font-semibold mb-2">Team A</p>
                {teamA.map((pid) => (
                  <p key={pid} className="text-gray-300">{getPlayer(pid)?.name}</p>
                ))}
              </div>
              <div className="card p-4 text-center">
                <p className="text-amber-400 font-semibold mb-2">Team B</p>
                {teamB.map((pid) => (
                  <p key={pid} className="text-gray-300">{getPlayer(pid)?.name}</p>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 max-w-xs mx-auto">
              <button id="btn-enter-result" onClick={handleEnterResult} className="btn-primary btn btn-lg w-full">
                Enter Result →
              </button>
              <button
                id="btn-view-match"
                onClick={() => navigate(`/matches/${matchId}`)}
                className="btn-secondary btn w-full"
              >
                View Match Detail
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TeamSlot({ id, label, color, players, onRemove }) {
  const colorMap = {
    brand: 'text-brand-300 border-brand-500/30 bg-brand-500/5',
    amber: 'text-amber-400 border-amber-500/30 bg-amber-500/5',
  };

  return (
    <div id={id} className={`rounded-xl border p-3 min-h-[120px] ${colorMap[color]}`}>
      <p className="text-xs font-semibold mb-2">{label} · {players.length}</p>
      {players.length === 0 && (
        <p className="text-xs text-gray-600 italic">No players assigned</p>
      )}
      <div className="space-y-1">
        {players.map((p) => (
          <div key={p.id} className="flex items-center justify-between text-xs">
            <span className="text-gray-300">{p.name}</span>
            <button
              id={`remove-${p.id}`}
              type="button"
              onClick={() => onRemove(p.id)}
              className="text-gray-600 hover:text-red-400 transition-colors"
              title="Remove"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
