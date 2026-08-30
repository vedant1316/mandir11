import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { matchesApi, playersApi, cricketApi, ledgerApi } from '../services/api';
import PlayerBadge from '../components/PlayerBadge';

const STEPS = [
  { id: 1, label: 'Sport' },
  { id: 2, label: 'Players' },
  { id: 3, label: 'Teams' },
  { id: 4, label: 'Stakes' },
  { id: 5, label: 'Review' },
  { id: 6, label: 'Match' },
];

const SPORTS = [
  { id: 'cricket',    label: 'Cricket',    emoji: '🏏', desc: 'Ball-by-ball scoring' },
  { id: 'volleyball', label: 'Volleyball', emoji: '🏐', desc: 'Final score entry' },
  { id: 'badminton',  label: 'Badminton',  emoji: '🏸', desc: 'Singles & Doubles, final score entry' },
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

  // Stakes / Ledger state
  const [stakePairs, setStakePairs] = useState([]); // [{ id, playerAId, playerBId, amount }]
  const [selectedStakePlayerA, setSelectedStakePlayerA] = useState('');
  const [selectedStakePlayerB, setSelectedStakePlayerB] = useState('');
  const [stakeAmountInput, setStakeAmountInput] = useState('50');
  const [stakeError, setStakeError] = useState(null);

  // Cricket specific settings
  const [oversLimit, setOversLimit] = useState(5);
  const [battingFirstTeam, setBattingFirstTeam] = useState('A'); // 'A' | 'B'
  const [openingBatterId, setOpeningBatterId] = useState('');
  const [openingBowlerId, setOpeningBowlerId] = useState('');

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

  // Pre-select defaults when reaching Stakes or Review
  useEffect(() => {
    if (step === 4) {
      if (teamA.length > 0 && !selectedStakePlayerA) {
        setSelectedStakePlayerA(teamA[0]);
      }
      if (teamB.length > 0 && !selectedStakePlayerB) {
        setSelectedStakePlayerB(teamB[0]);
      }
    }
    if (step === 5 && sport === 'cricket') {
      const battingPlayerIds = battingFirstTeam === 'A' ? teamA : teamB;
      const bowlingPlayerIds = battingFirstTeam === 'A' ? teamB : teamA;
      if (battingPlayerIds.length > 0 && !openingBatterId) {
        setOpeningBatterId(battingPlayerIds[0]);
      }
      if (bowlingPlayerIds.length > 0 && !openingBowlerId) {
        setOpeningBowlerId(bowlingPlayerIds[0]);
      }
    }
  }, [step, sport, battingFirstTeam, teamA, teamB, openingBatterId, openingBowlerId, selectedStakePlayerA, selectedStakePlayerB]);

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
      setTeamA((a) => (a.includes(pid) ? a : [...a, pid]));
      setTeamB((b) => b.filter((id) => id !== pid));
    } else {
      setTeamB((b) => (b.includes(pid) ? b : [...b, pid]));
      setTeamA((a) => a.filter((id) => id !== pid));
    }
  };

  const removeFromTeam = (pid) => {
    setTeamA((a) => a.filter((id) => id !== pid));
    setTeamB((b) => b.filter((id) => id !== pid));
    setStakePairs((pairs) => pairs.filter((p) => p.playerAId !== pid && p.playerBId !== pid));
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

  // ── Stakes management ──────────────────────────────────────────

  const totalStakeA = stakePairs.reduce((sum, p) => sum + p.amount, 0);
  const totalStakeB = stakePairs.reduce((sum, p) => sum + p.amount, 0);
  const totalPool = totalStakeA + totalStakeB;
  const isStakesBalanced = totalStakeA === totalStakeB;

  const handleAddStakePair = () => {
    setStakeError(null);
    const amountNum = parseFloat(stakeAmountInput);
    if (isNaN(amountNum) || amountNum <= 0) {
      setStakeError('Please enter a valid positive stake amount.');
      return;
    }
    if (!selectedStakePlayerA || !selectedStakePlayerB) {
      setStakeError('Select one player from Team A and one player from Team B.');
      return;
    }

    const newPair = {
      id: 'stake_' + Math.random().toString(36).substr(2, 9),
      playerAId: selectedStakePlayerA,
      playerBId: selectedStakePlayerB,
      amount: amountNum,
    };

    setStakePairs((prev) => [...prev, newPair]);
  };

  const handleRemoveStakePair = (pairId) => {
    setStakePairs((prev) => prev.filter((p) => p.id !== pairId));
  };

  const handleStakesNext = () => {
    if (!isStakesBalanced) {
      setStakeError('Total stakes on Team A must equal total stakes on Team B.');
      return;
    }
    setStakeError(null);
    setStep(5);
  };

  // ── Create & Start Match ───────────────────────────────────────

  const handleCreateMatch = async () => {
    setLoading(true);
    setError(null);
    try {
      const matchRes = await matchesApi.create(sport);
      const mid = matchRes.data.id;

      const teamsRes = await matchesApi.createTeams(mid, [
        { label: 'Team A', player_ids: teamA },
        { label: 'Team B', player_ids: teamB },
      ]);

      // Save match stakes / ledger entries if any
      if (stakePairs.length > 0) {
        const formattedEntries = stakePairs.map((p) => ({
          player_a_id: p.playerAId,
          player_b_id: p.playerBId,
          amount: p.amount,
        }));
        await ledgerApi.setMatchLedger(mid, formattedEntries);
      }

      const startRes = await matchesApi.start(mid);
      setMatchId(mid);
      setMatchData(startRes.data);

      if (sport === 'cricket') {
        const teams = teamsRes.data.teams;
        const teamARecord = teams.find((t) => t.label === 'Team A');
        const teamBRecord = teams.find((t) => t.label === 'Team B');
        const battingTeamRecord = battingFirstTeam === 'A' ? teamARecord : teamBRecord;

        await cricketApi.initInnings({
          matchId: mid,
          battingTeamId: battingTeamRecord.id,
          inningsNumber: 1,
          oversLimit: parseInt(oversLimit, 10) || 5,
          openingBatterId: openingBatterId || null,
          openingBowlerId: openingBowlerId || null,
        });

        // Navigate directly to cricket scoring
        navigate(`/matches/${mid}/score`);
        return;
      }

      setStep(6);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to create match.');
    } finally {
      setLoading(false);
    }
  };

  const handleEnterResult = () => {
    if (sport === 'cricket') {
      navigate(`/matches/${matchId}/score`);
    } else {
      navigate(`/matches/${matchId}/result`, { state: { match: matchData } });
    }
  };

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="page pb-16">
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
                  className={`h-0.5 w-6 sm:w-10 mt-[-1rem] ${
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
                <span className="text-brand-400 text-xl">→</span>
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
                Set Stakes →
              </button>
            </div>
          </div>
        )}

        {/* ─── Step 4: Stakes (Money Ledger) ────────────────────── */}
        {step === 4 && (
          <div id="step-stakes" className="animate-slide-up space-y-6">
            <div>
              <h2 className="section-title flex items-center gap-2">
                <span>💰</span> Match Ledger & Stakes
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Optional: Record peer-to-peer match stakes. Equal amounts will be matched between teams.
              </p>
            </div>

            {stakeError && (
              <div id="stake-error" className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400">
                {stakeError}
              </div>
            )}

            {/* Total Stakes Pool Header */}
            <div className="card p-4 bg-gradient-to-br from-surface-800 to-surface-900 border-surface-600">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-gray-400">Total Match Pool</span>
                <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                  stakePairs.length === 0
                    ? 'bg-surface-700 text-gray-400'
                    : isStakesBalanced
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-red-500/20 text-red-300 border border-red-500/30'
                }`}>
                  {stakePairs.length === 0 ? 'No Stakes (Casual)' : isStakesBalanced ? '✓ Balanced' : '⚠️ Unbalanced'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="p-3 rounded-xl bg-brand-500/10 border border-brand-500/30">
                  <p className="text-[11px] text-brand-300 font-semibold mb-0.5">Team A Total</p>
                  <p className="text-2xl font-black text-white">₹{totalStakeA}</p>
                </div>
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <p className="text-[11px] text-amber-400 font-semibold mb-0.5">Team B Total</p>
                  <p className="text-2xl font-black text-white">₹{totalStakeB}</p>
                </div>
              </div>
            </div>

            {/* Add Stake Pair Card */}
            <div className="card p-5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <span>➕</span> Add Matchup Stake
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label text-brand-300">Team A Player</label>
                  <select
                    id="select-stake-a"
                    className="input text-xs"
                    value={selectedStakePlayerA}
                    onChange={(e) => setSelectedStakePlayerA(e.target.value)}
                  >
                    {teamA.map((pid) => (
                      <option key={pid} value={pid}>
                        {getPlayer(pid)?.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label text-amber-400">Team B Player</label>
                  <select
                    id="select-stake-b"
                    className="input text-xs"
                    value={selectedStakePlayerB}
                    onChange={(e) => setSelectedStakePlayerB(e.target.value)}
                  >
                    {teamB.map((pid) => (
                      <option key={pid} value={pid}>
                        {getPlayer(pid)?.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Amount (₹)</label>
                <div className="flex gap-2 items-center mb-2">
                  {[20, 50, 100, 200, 500].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setStakeAmountInput(amt.toString())}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                        stakeAmountInput === amt.toString()
                          ? 'bg-brand-500 border-brand-400 text-white'
                          : 'bg-surface-700 border-surface-600 text-gray-400 hover:text-white'
                      }`}
                    >
                      ₹{amt}
                    </button>
                  ))}
                </div>
                <input
                  id="input-stake-amount"
                  type="number"
                  min="1"
                  className="input text-sm"
                  placeholder="Custom amount"
                  value={stakeAmountInput}
                  onChange={(e) => setStakeAmountInput(e.target.value)}
                />
              </div>

              <button
                id="btn-add-stake-pair"
                type="button"
                onClick={handleAddStakePair}
                className="btn-secondary btn w-full"
              >
                + Add Stake Matchup
              </button>
            </div>

            {/* List of Matched Stakes */}
            {stakePairs.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs uppercase font-bold text-gray-400 tracking-wider">
                  Matched Stakes ({stakePairs.length})
                </h4>
                <div className="space-y-2">
                  {stakePairs.map((pair) => (
                    <div
                      key={pair.id}
                      className="card p-3 flex items-center justify-between text-xs bg-surface-800"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-brand-300">
                          {getPlayer(pair.playerAId)?.name}
                        </span>
                        <span className="text-gray-500 font-bold">vs</span>
                        <span className="font-semibold text-amber-400">
                          {getPlayer(pair.playerBId)?.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-white text-sm">₹{pair.amount}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveStakePair(pair.id)}
                          className="text-gray-500 hover:text-red-400 font-bold"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-between pt-2">
              <button id="step4-back" onClick={() => setStep(3)} className="btn-secondary btn">
                ← Back
              </button>
              <button
                id="step4-next"
                onClick={handleStakesNext}
                className="btn-primary btn"
              >
                Review Setup →
              </button>
            </div>
          </div>
        )}

        {/* ─── Step 5: Review & Match Settings ───────────────────── */}
        {step === 5 && (
          <div id="step-review" className="animate-slide-up space-y-6">
            <h2 className="section-title">Review Match Setup</h2>

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
                    Team A · {teamA.length} player{teamA.length !== 1 ? 's' : ''}
                  </p>
                  <ul className="space-y-1">
                    {teamA.map((pid) => (
                      <li key={pid} className="text-gray-300 text-xs">
                        {getPlayer(pid)?.name}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-amber-400 mb-2">
                    Team B · {teamB.length} player{teamB.length !== 1 ? 's' : ''}
                  </p>
                  <ul className="space-y-1">
                    {teamB.map((pid) => (
                      <li key={pid} className="text-gray-300 text-xs">
                        {getPlayer(pid)?.name}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Stakes summary in review */}
              <div className="pt-3 border-t border-surface-600/50">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">Match Stakes:</span>
                  <span className="font-bold text-white">
                    {stakePairs.length > 0 ? `₹${totalPool} Pool (₹${totalStakeA} / team)` : 'No Stakes (₹0)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Cricket-specific settings */}
            {sport === 'cricket' && (
              <div id="cricket-settings-panel" className="card p-5 space-y-4 border-brand-500/30">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>🏏</span> Cricket Match Settings
                </h3>

                {/* Overs selector */}
                <div>
                  <label className="label">Overs per Innings</label>
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    {[2, 4, 5, 6, 8, 10, 15, 20].map((ov) => (
                      <button
                        key={ov}
                        id={`overs-chip-${ov}`}
                        type="button"
                        onClick={() => setOversLimit(ov)}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                          oversLimit === ov
                            ? 'bg-brand-500 border-brand-400 text-white'
                            : 'bg-surface-700 border-surface-600 text-gray-400 hover:text-white'
                        }`}
                      >
                        {ov} ov
                      </button>
                    ))}
                  </div>
                </div>

                {/* Toss / Batting First */}
                <div>
                  <label className="label">Who bats first?</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      id="bat-first-a"
                      onClick={() => {
                        setBattingFirstTeam('A');
                        setOpeningBatterId(teamA[0] || '');
                        setOpeningBowlerId(teamB[0] || '');
                      }}
                      className={`p-3 rounded-xl border text-center transition-all ${
                        battingFirstTeam === 'A'
                          ? 'bg-brand-500/20 border-brand-500 text-brand-300 font-bold'
                          : 'bg-surface-700 border-surface-600 text-gray-400'
                      }`}
                    >
                      Team A Bats First
                    </button>
                    <button
                      type="button"
                      id="bat-first-b"
                      onClick={() => {
                        setBattingFirstTeam('B');
                        setOpeningBatterId(teamB[0] || '');
                        setOpeningBowlerId(teamA[0] || '');
                      }}
                      className={`p-3 rounded-xl border text-center transition-all ${
                        battingFirstTeam === 'B'
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                          : 'bg-surface-700 border-surface-600 text-gray-400'
                      }`}
                    >
                      Team B Bats First
                    </button>
                  </div>
                </div>

                {/* Opening Batter & Bowler */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Opening Batter</label>
                    <select
                      id="select-opening-batter"
                      className="input text-xs"
                      value={openingBatterId}
                      onChange={(e) => setOpeningBatterId(e.target.value)}
                    >
                      {(battingFirstTeam === 'A' ? teamA : teamB).map((pid) => (
                        <option key={pid} value={pid}>
                          {getPlayer(pid)?.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label">Opening Bowler</label>
                    <select
                      id="select-opening-bowler"
                      className="input text-xs"
                      value={openingBowlerId}
                      onChange={(e) => setOpeningBowlerId(e.target.value)}
                    >
                      {(battingFirstTeam === 'A' ? teamB : teamA).map((pid) => (
                        <option key={pid} value={pid}>
                          {getPlayer(pid)?.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-between">
              <button id="step5-back" onClick={() => setStep(4)} className="btn-secondary btn">
                ← Edit Stakes
              </button>
              <button
                id="step5-start"
                onClick={handleCreateMatch}
                disabled={loading}
                className="btn-primary btn btn-lg"
              >
                {loading ? 'Creating match…' : sport === 'cricket' ? '🏏 Start & Score Match' : '🏁 Start Match'}
              </button>
            </div>
          </div>
        )}

        {/* ─── Step 6: Match started (Volleyball / Badminton) ─────── */}
        {step === 6 && matchData && (
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
