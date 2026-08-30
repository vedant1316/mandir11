import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { cricketApi, matchesApi, playersApi } from '../services/api';
import { LoadingSpinner, ErrorState } from '../components/ui';

const DISMISSAL_TYPES = [
  { id: 'bowled', label: 'Bowled' },
  { id: 'caught', label: 'Caught' },
  { id: 'run_out', label: 'Run Out' },
  { id: 'lbw', label: 'LBW' },
  { id: 'stumped', label: 'Stumped' },
  { id: 'other', label: 'Other' },
];

export default function CricketScorer() {
  const { matchId } = useParams();
  const navigate = useNavigate();

  // State
  const [matchScorecard, setMatchScorecard] = useState(null);
  const [activeInningsState, setActiveInningsState] = useState(null);
  const [allPlayers, setAllPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [actionNotice, setActionNotice] = useState(null);

  // Modals
  const [showWicketModal, setShowWicketModal] = useState(false);
  const [dismissalType, setDismissalType] = useState('bowled');
  const [nextBatterId, setNextBatterId] = useState('');
  const [wicketError, setWicketError] = useState(null);

  const [showDeclareModal, setShowDeclareModal] = useState(false);
  const [showDrawModal, setShowDrawModal] = useState(false);

  const [showNextBowlerModal, setShowNextBowlerModal] = useState(false);
  const [selectedNextBowlerId, setSelectedNextBowlerId] = useState('');

  const [showInningsBreakModal, setShowInningsBreakModal] = useState(false);
  const [inn2OpeningBatter, setInn2OpeningBatter] = useState('');
  const [inn2OpeningBowler, setInn2OpeningBowler] = useState('');

  const [showExtraRunsModal, setShowExtraRunsModal] = useState(false);
  const [pendingExtraType, setPendingExtraType] = useState(null); // 'wide' | 'no_ball'
  const [extraRunsInput, setExtraRunsInput] = useState(0);

  const [showChangeBatterModal, setShowChangeBatterModal] = useState(false);
  const [newBatterSelection, setNewBatterSelection] = useState('');

  const [showChangeBowlerModal, setShowChangeBowlerModal] = useState(false);
  const [newBowlerSelection, setNewBowlerSelection] = useState('');

  const [pomPlayerId, setPomPlayerId] = useState('');
  const [pomSubmitting, setPomSubmitting] = useState(false);

  const [scorecardTab, setScorecardTab] = useState(1); // 1, 2, 3, 4
  const [showDetailedScorecard, setShowDetailedScorecard] = useState(false);

  // Load match state
  const loadState = useCallback(async () => {
    try {
      const [scorecardRes, playersRes] = await Promise.all([
        cricketApi.getMatchScorecard(matchId),
        playersApi.list(false),
      ]);

      const sc = scorecardRes.data;
      setMatchScorecard(sc);
      setAllPlayers(playersRes.data.players);

      if (sc.innings && sc.innings.length > 0) {
        const latestInnings = sc.innings[sc.innings.length - 1];
        setActiveInningsState(latestInnings);
        setScorecardTab(latestInnings.innings.innings_number);

        const isTest = sc.match.cricket_format === 'test' || sc.match.format === 'test';
        const maxInnings = isTest ? 4 : 2;

        // Check if over completed and needs bowler
        if (
          !latestInnings.isInningsClosed &&
          sc.match.status === 'live' &&
          latestInnings.isOverComplete
        ) {
          setShowNextBowlerModal(true);
        }

        // Check if latest innings is closed but match is still live and more innings remain
        if (
          latestInnings.isInningsClosed &&
          sc.match.status === 'live' &&
          sc.innings.length < maxInnings
        ) {
          setShowInningsBreakModal(true);
        }
      }
      setError(null);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to load cricket match.');
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    loadState();
  }, [loadState]);

  const showFlash = (msg) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3000);
  };

  // ── Scoring Handlers ──────────────────────────────────────────

  const handleScoreRuns = async (runs) => {
    if (!activeInningsState || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await cricketApi.recordBall({
        matchId,
        inningsId: activeInningsState.innings.id,
        runs,
        extraType: 'none',
      });
      setActiveInningsState(res.data);
      showFlash(`+${runs} run${runs !== 1 ? 's' : ''}`);
      await loadState();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Error recording ball.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleScoreExtra = async (extraType, extraRuns = 0) => {
    if (!activeInningsState || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await cricketApi.recordBall({
        matchId,
        inningsId: activeInningsState.innings.id,
        runs: extraType === 'no_ball' ? extraRuns : 0,
        extraType,
        extraRuns: extraType === 'wide' ? extraRuns : 0,
      });
      setActiveInningsState(res.data);
      showFlash(extraType === 'wide' ? `Wide (+${1 + extraRuns})` : `No Ball (+${1 + extraRuns})`);
      setShowExtraRunsModal(false);
      await loadState();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Error recording extra.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmWicket = async () => {
    if (!activeInningsState || submitting) return;
    setSubmitting(true);
    setWicketError(null);
    try {
      const isNextNeeded =
        activeInningsState.totalWickets + 1 < activeInningsState.battingScorecard.length;

      if (isNextNeeded && !nextBatterId) {
        setWicketError('Please select the next batter.');
        setSubmitting(false);
        return;
      }

      const res = await cricketApi.recordBall({
        matchId,
        inningsId: activeInningsState.innings.id,
        runs: 0,
        extraType: 'none',
        isWicket: true,
        dismissalType,
        nextBatterId: isNextNeeded ? nextBatterId : null,
      });

      setActiveInningsState(res.data);
      setShowWicketModal(false);
      setNextBatterId('');
      showFlash('☝️ WICKET!');
      await loadState();
    } catch (err) {
      setWicketError(err.response?.data?.detail || err.message || 'Error recording wicket.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartNextOver = async () => {
    if (!activeInningsState || !selectedNextBowlerId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await cricketApi.startNextOver({
        inningsId: activeInningsState.innings.id,
        bowlerId: selectedNextBowlerId,
      });
      setActiveInningsState(res.data);
      setShowNextBowlerModal(false);
      setSelectedNextBowlerId('');
      showFlash('🎯 New over started!');
      await loadState();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Error starting next over.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartNextInnings = async () => {
    if (!matchScorecard || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const allInns = matchScorecard.innings;
      const latestInn = allInns[allInns.length - 1];
      const teams = matchScorecard.match.teams;
      const targetBattingTeam = teams.find((t) => t.id !== latestInn?.battingTeam?.id);

      await cricketApi.switchInnings({
        matchId,
        nextBattingTeamId: targetBattingTeam?.id,
        openingBatterId: inn2OpeningBatter || null,
        openingBowlerId: inn2OpeningBowler || null,
      });

      setShowInningsBreakModal(false);
      setInn2OpeningBatter('');
      setInn2OpeningBowler('');
      showFlash(`🏏 Innings ${allInns.length + 1} Started!`);
      await loadState();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Error starting next innings.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeclareInnings = async () => {
    if (!activeInningsState || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await cricketApi.declareInnings({
        matchId,
        inningsId: activeInningsState.innings.id,
      });
      setActiveInningsState(res.data);
      setShowDeclareModal(false);
      showFlash('🚩 Innings Declared');
      await loadState();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to declare innings.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEndMatchAsDraw = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await cricketApi.endMatchAsDraw(matchId);
      setShowDrawModal(false);
      showFlash('🤝 Match Ended as Draw');
      await loadState();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to end match as draw.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUndo = async () => {
    if (!activeInningsState || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await cricketApi.undoLastBall({
        matchId,
        inningsId: activeInningsState.innings.id,
      });
      setActiveInningsState(res.data);
      showFlash('⤺ Undone last delivery');
      await loadState();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Error undoing delivery.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangeBatter = async () => {
    if (!activeInningsState || !newBatterSelection || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await cricketApi.changeBatter({
        inningsId: activeInningsState.innings.id,
        batterId: newBatterSelection,
      });
      setActiveInningsState(res.data);
      setShowChangeBatterModal(false);
      showFlash('Striker changed.');
      await loadState();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Error changing striker.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangeBowler = async () => {
    if (!activeInningsState || !newBowlerSelection || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await cricketApi.changeBowler({
        inningsId: activeInningsState.innings.id,
        bowlerId: newBowlerSelection,
      });
      setActiveInningsState(res.data);
      setShowChangeBowlerModal(false);
      showFlash('Bowler changed.');
      await loadState();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Error changing bowler.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetPom = async () => {
    if (!pomPlayerId) return;
    setPomSubmitting(true);
    try {
      await matchesApi.setPlayerOfMatch(matchId, pomPlayerId);
      showFlash('⭐ Player of Match updated!');
      await loadState();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to set Player of Match.');
    } finally {
      setPomSubmitting(false);
    }
  };

  // ── Render Guards ─────────────────────────────────────────────

  if (loading) {
    return (
      <div className="page">
        <div className="container-app">
          <LoadingSpinner label="Loading Cricket Scorer..." />
        </div>
      </div>
    );
  }

  if (error && !matchScorecard) {
    return (
      <div className="page">
        <div className="container-app">
          <ErrorState message={error} onRetry={loadState} />
        </div>
      </div>
    );
  }

  const isMatchLive = matchScorecard?.match.status === 'live';
  const isMatchCompleted = matchScorecard?.match.status === 'completed';
  const currentInnings = activeInningsState;

  // Potential available next batters
  const availableNextBatters = currentInnings
    ? currentInnings.battingScorecard.filter((b) => !b.isOut && b.id !== currentInnings.currentBatter?.id)
    : [];

  // Potential bowlers (exclude last bowler if team size > 1)
  const bowlingTeamPlayers = currentInnings?.bowlingTeam
    ? matchScorecard?.match.teams
        .find((t) => t.id === currentInnings.bowlingTeam.id)
        ?.players?.map((p) => p.player)
        .filter(Boolean) || []
    : [];

  const eligibleBowlers = bowlingTeamPlayers.filter((p) => {
    if (bowlingTeamPlayers.length <= 1) return true;
    return p.id !== currentInnings?.activeOverBowler?.id;
  });

  const displayScorecardInnings = matchScorecard?.innings.find(
    (i) => i.innings.innings_number === scorecardTab
  );

  return (
    <div className="page pb-20">
      <div className="container-app max-w-2xl">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <button onClick={() => navigate(`/matches/${matchId}`)} className="btn-ghost btn btn-sm">
            ← Match Detail
          </button>
          <div className="flex items-center gap-2">
            <span
              id="live-status-pill"
              className={
                isMatchCompleted
                  ? 'status-completed'
                  : currentInnings?.isInningsClosed
                  ? 'status-upcoming'
                  : 'status-live'
              }
            >
              {isMatchLive && !currentInnings?.isInningsClosed && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
              {isMatchCompleted
                ? 'Completed'
                : currentInnings?.isInningsClosed
                ? 'Innings Break'
                : 'Live'}
            </span>
          </div>
        </div>

        {/* Action toast */}
        {actionNotice && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-brand-500 text-white font-bold text-sm rounded-full shadow-xl animate-bounce">
            {actionNotice}
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div id="scorer-error" className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400">
            {error}
          </div>
        )}

        {/* ── Main Scoreboard Card ──────────────────────────────── */}
        {currentInnings && (() => {
          const isTestMatch = matchScorecard?.match.cricket_format === 'test' || matchScorecard?.match.format === 'test';

          return (
            <div className="card p-5 mb-5 bg-gradient-to-br from-surface-800 to-surface-900 border-surface-600/70 shadow-2xl relative overflow-hidden">
              {/* Background sport watermark */}
              <div className="absolute right-[-10px] bottom-[-20px] text-8xl opacity-5 pointer-events-none select-none">
                🏏
              </div>

              {/* Match Format & Innings info */}
              <div className="mb-3 flex items-center justify-between text-xs text-gray-400 bg-surface-700/60 px-3 py-1.5 rounded-lg border border-surface-600/40">
                <span className="font-semibold text-gray-300">
                  {isTestMatch ? '🛡️ Test Match' : '⚡ Limited Overs'} · Innings {currentInnings.innings.innings_number} of {isTestMatch ? 4 : 2}
                  {currentInnings.innings.is_declared ? ' (dec)' : ''}
                </span>
                {isTestMatch && currentInnings.targetInfo?.trailOrLead && (
                  <span className="text-amber-400 font-bold">
                    {currentInnings.targetInfo.trailOrLead}
                  </span>
                )}
                {!isTestMatch && currentInnings.innings.innings_number === 2 && currentInnings.targetInfo && (
                  <span className="text-amber-400 font-semibold">
                    Target: {currentInnings.targetInfo.targetRuns}
                  </span>
                )}
              </div>

              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-brand-400 font-bold mb-1 flex items-center gap-1.5">
                    <span>Inn {currentInnings.innings.innings_number}</span> · <span>{currentInnings.battingTeam?.label} Batting</span>
                  </p>
                  <div className="flex items-baseline gap-2">
                    <h1 id="live-score-display" className="text-4xl sm:text-5xl font-black text-white tracking-tight">
                      {currentInnings.totalRuns}/{currentInnings.totalWickets}
                    </h1>
                    <span id="live-overs-display" className="text-lg sm:text-xl font-bold text-gray-400">
                      ({currentInnings.oversFormatted}{!isTestMatch ? ` / ${currentInnings.oversLimit}` : ''} ov)
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-xs text-gray-500 font-medium">CRR</p>
                  <p id="live-crr" className="text-lg font-bold text-white">
                    {currentInnings.currentRunRate}
                  </p>
                  {!isTestMatch && currentInnings.targetInfo && (
                    <>
                      <p className="text-xs text-gray-500 font-medium mt-1">RRR</p>
                      <p id="live-rrr" className="text-sm font-bold text-amber-400">
                        {currentInnings.targetInfo.requiredRunRate}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Chase Equation for Limited Overs */}
              {!isTestMatch && currentInnings.targetInfo && !isMatchCompleted && (
                <div id="chase-equation-banner" className="mt-4 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs font-semibold text-amber-300 flex items-center justify-between">
                  <span>
                    Need <strong className="text-white text-sm">{currentInnings.targetInfo.runsNeeded}</strong> runs from{' '}
                    <strong className="text-white text-sm">{currentInnings.targetInfo.ballsRemaining}</strong> balls
                  </span>
                  <span className="text-amber-400">
                    {currentInnings.battingScorecard.length - currentInnings.totalWickets} wkts in hand
                  </span>
                </div>
              )}

              {/* 4th Innings Chase Equation for Test Matches */}
              {isTestMatch && currentInnings.targetInfo?.isFourthInnings && !isMatchCompleted && (
                <div id="test-chase-equation-banner" className="mt-4 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs font-semibold text-amber-300 flex items-center justify-between">
                  <span>
                    Target: <strong className="text-white text-sm">{currentInnings.targetInfo.targetRuns}</strong> · Need{' '}
                    <strong className="text-white text-sm">{currentInnings.targetInfo.runsNeeded}</strong> runs
                  </span>
                  <span className="text-amber-400">
                    {currentInnings.targetInfo.wicketsInHand} wkts in hand
                  </span>
                </div>
              )}

              {/* Completed Match Winner Banner */}
              {isMatchCompleted && matchScorecard && (
                <div id="match-winner-card" className="mt-4 p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <span className="text-xl">🏆</span>
                    <span>{matchScorecard.resultSummary}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Active Striker & Bowler Cards ─────────────────────── */}
        {isMatchLive && !currentInnings?.isInningsClosed && (
          <div className="grid grid-cols-2 gap-3 mb-5">
            {/* Striker */}
            <div id="current-striker-card" className="card p-3.5 border-brand-500/30 bg-brand-500/5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-brand-300 flex items-center gap-1">
                    🏏 Striker
                  </span>
                  <button
                    onClick={() => setShowChangeBatterModal(true)}
                    className="text-[10px] text-gray-400 hover:text-white transition-colors underline"
                  >
                    Change
                  </button>
                </div>
                <p id="striker-name" className="font-bold text-white text-sm truncate">
                  {currentInnings?.currentBatter?.player?.name || 'Select Striker'}
                </p>
              </div>

              <div className="mt-3 pt-2 border-t border-surface-600/40 flex items-baseline justify-between text-xs">
                <span id="striker-score" className="font-black text-white text-base">
                  {currentInnings?.currentBatter?.runs ?? 0}
                  <span className="text-gray-500 text-xs font-normal">
                    ({currentInnings?.currentBatter?.balls ?? 0})
                  </span>
                </span>
                <span className="text-gray-400 text-[11px]">
                  4s: <strong>{currentInnings?.currentBatter?.fours ?? 0}</strong> · 6s:{' '}
                  <strong>{currentInnings?.currentBatter?.sixes ?? 0}</strong>
                </span>
              </div>
            </div>

            {/* Bowler */}
            <div id="current-bowler-card" className="card p-3.5 border-amber-500/30 bg-amber-500/5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400 flex items-center gap-1">
                    🎯 Bowler
                  </span>
                  <button
                    onClick={() => setShowChangeBowlerModal(true)}
                    className="text-[10px] text-gray-400 hover:text-white transition-colors underline"
                  >
                    Change
                  </button>
                </div>
                <p id="bowler-name" className="font-bold text-white text-sm truncate">
                  {currentInnings?.currentBowler?.player?.name || currentInnings?.activeOverBowler?.name || 'Select Bowler'}
                </p>
              </div>

              <div className="mt-3 pt-2 border-t border-surface-600/40 flex items-baseline justify-between text-xs">
                <span id="bowler-figures" className="font-black text-white text-base">
                  {currentInnings?.currentBowler?.wickets ?? 0}/{currentInnings?.currentBowler?.runs ?? 0}
                </span>
                <span className="text-gray-400 text-[11px]">
                  {currentInnings?.currentBowler?.oversFormatted ?? '0.0'} ov · Econ:{' '}
                  <strong>{currentInnings?.currentBowler?.economy ?? '0.0'}</strong>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Over Delivery Ribbon ──────────────────────────────── */}
        {isMatchLive && !currentInnings?.isInningsClosed && (
          <div className="card p-3 mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-400">
                This Over (Over {currentInnings?.activeOverNumber})
              </span>
              <span className="text-xs text-gray-500">
                {currentInnings?.legalBallsInCurrentOver}/6 legal balls
              </span>
            </div>

            <div id="over-delivery-chips" className="flex items-center gap-2 overflow-x-auto py-1">
              {currentInnings?.overDeliveryChips.length === 0 ? (
                <span className="text-xs text-gray-600 italic">No balls bowled yet in this over</span>
              ) : (
                currentInnings?.overDeliveryChips.map((chip, idx) => (
                  <span
                    key={chip.id || idx}
                    className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 shadow-md ${
                      chip.isWicket
                        ? 'bg-red-500 text-white'
                        : chip.isSix
                        ? 'bg-amber-500 text-black'
                        : chip.isBoundary
                        ? 'bg-brand-500 text-white'
                        : chip.isExtra
                        ? 'bg-purple-600 text-white'
                        : chip.runs === 0
                        ? 'bg-surface-700 text-gray-400 border border-surface-600'
                        : 'bg-surface-600 text-white'
                    }`}
                  >
                    {chip.label}
                  </span>
                ))
              )}
            </div>
          </div>
        )}

        {/* ── Tactile Ground Scoring Pad ─────────────────────────── */}
        {isMatchLive && !currentInnings?.isInningsClosed && !currentInnings?.isOverComplete && (
          <div className="space-y-3 mb-6">
            {/* Primary run buttons */}
            <div className="grid grid-cols-4 gap-2.5">
              <button
                id="btn-run-0"
                type="button"
                disabled={submitting}
                onClick={() => handleScoreRuns(0)}
                className="h-16 rounded-2xl bg-surface-700 border border-surface-600 hover:bg-surface-600 active:scale-95 text-white font-black text-xl flex flex-col items-center justify-center transition-all shadow-md"
              >
                <span>0</span>
                <span className="text-[10px] text-gray-400 font-normal">Dot</span>
              </button>

              <button
                id="btn-run-1"
                type="button"
                disabled={submitting}
                onClick={() => handleScoreRuns(1)}
                className="h-16 rounded-2xl bg-surface-700 border border-surface-600 hover:bg-surface-600 active:scale-95 text-white font-black text-xl flex flex-col items-center justify-center transition-all shadow-md"
              >
                <span>1</span>
                <span className="text-[10px] text-gray-400 font-normal">Single</span>
              </button>

              <button
                id="btn-run-2"
                type="button"
                disabled={submitting}
                onClick={() => handleScoreRuns(2)}
                className="h-16 rounded-2xl bg-surface-700 border border-surface-600 hover:bg-surface-600 active:scale-95 text-white font-black text-xl flex flex-col items-center justify-center transition-all shadow-md"
              >
                <span>2</span>
                <span className="text-[10px] text-gray-400 font-normal">Double</span>
              </button>

              <button
                id="btn-run-3"
                type="button"
                disabled={submitting}
                onClick={() => handleScoreRuns(3)}
                className="h-16 rounded-2xl bg-surface-700 border border-surface-600 hover:bg-surface-600 active:scale-95 text-white font-black text-xl flex flex-col items-center justify-center transition-all shadow-md"
              >
                <span>3</span>
                <span className="text-[10px] text-gray-400 font-normal">Three</span>
              </button>
            </div>

            {/* Boundaries & Specials */}
            <div className="grid grid-cols-4 gap-2.5">
              <button
                id="btn-run-4"
                type="button"
                disabled={submitting}
                onClick={() => handleScoreRuns(4)}
                className="h-16 rounded-2xl bg-brand-600/90 border border-brand-500/50 hover:bg-brand-500 active:scale-95 text-white font-black text-xl flex flex-col items-center justify-center transition-all shadow-lg shadow-brand-500/20"
              >
                <span>4</span>
                <span className="text-[10px] text-brand-200 font-normal">Boundary</span>
              </button>

              <button
                id="btn-run-6"
                type="button"
                disabled={submitting}
                onClick={() => handleScoreRuns(6)}
                className="h-16 rounded-2xl bg-amber-500/90 border border-amber-400/50 hover:bg-amber-400 active:scale-95 text-black font-black text-xl flex flex-col items-center justify-center transition-all shadow-lg shadow-amber-500/20"
              >
                <span>6</span>
                <span className="text-[10px] text-amber-950 font-bold">Six</span>
              </button>

              <button
                id="btn-extra-wide"
                type="button"
                disabled={submitting}
                onClick={() => {
                  setPendingExtraType('wide');
                  setExtraRunsInput(0);
                  setShowExtraRunsModal(true);
                }}
                className="h-16 rounded-2xl bg-purple-900/40 border border-purple-500/40 hover:bg-purple-800/50 active:scale-95 text-purple-200 font-bold text-sm flex flex-col items-center justify-center transition-all"
              >
                <span>Wide</span>
                <span className="text-[10px] text-purple-300/70 font-normal">+1 Extra</span>
              </button>

              <button
                id="btn-extra-noball"
                type="button"
                disabled={submitting}
                onClick={() => {
                  setPendingExtraType('no_ball');
                  setExtraRunsInput(0);
                  setShowExtraRunsModal(true);
                }}
                className="h-16 rounded-2xl bg-purple-900/40 border border-purple-500/40 hover:bg-purple-800/50 active:scale-95 text-purple-200 font-bold text-sm flex flex-col items-center justify-center transition-all"
              >
                <span>No Ball</span>
                <span className="text-[10px] text-purple-300/70 font-normal">+1 Extra</span>
              </button>
            </div>

            {/* Wicket & Undo Actions */}
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              <button
                id="btn-wicket"
                type="button"
                disabled={submitting}
                onClick={() => {
                  setDismissalType('bowled');
                  setNextBatterId(availableNextBatters[0]?.id || '');
                  setWicketError(null);
                  setShowWicketModal(true);
                }}
                className="col-span-2 h-14 rounded-2xl bg-red-600 hover:bg-red-500 active:scale-95 text-white font-black text-base flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-500/30"
              >
                <span>☝️</span>
                <span>WICKET</span>
              </button>

              <button
                id="btn-undo"
                type="button"
                disabled={submitting}
                onClick={handleUndo}
                className="h-14 rounded-2xl bg-surface-700 hover:bg-surface-600 active:scale-95 border border-surface-500 text-gray-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all"
              >
                <span>⤺</span>
                <span>Undo</span>
              </button>
            </div>

            {/* Test Match & Inning Control Buttons */}
            <div className="flex gap-2 pt-2 border-t border-surface-700/50">
              <button
                id="btn-declare-innings"
                type="button"
                disabled={submitting}
                onClick={() => setShowDeclareModal(true)}
                className="flex-1 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/25 text-amber-300 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
              >
                <span>🚩</span>
                <span>Declare Innings</span>
              </button>

              {(matchScorecard?.match.cricket_format === 'test' || matchScorecard?.match.format === 'test') && (
                <button
                  id="btn-draw-match"
                  type="button"
                  disabled={submitting}
                  onClick={() => setShowDrawModal(true)}
                  className="flex-1 py-2 rounded-xl bg-surface-700 border border-surface-600 hover:bg-surface-600 text-gray-300 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                >
                  <span>🤝</span>
                  <span>End as Draw</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Over Complete Banner Button ───────────────────────── */}
        {isMatchLive && currentInnings?.isOverComplete && !currentInnings?.isInningsClosed && (
          <div id="over-complete-banner" className="card p-5 mb-6 text-center border-amber-500/40 bg-amber-500/10">
            <h3 className="text-lg font-bold text-amber-300 mb-1">
              Over {currentInnings.activeOverNumber} Complete!
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              6 legal deliveries bowled. Select the next bowler to continue.
            </p>
            <button
              id="btn-open-next-bowler"
              type="button"
              onClick={() => setShowNextBowlerModal(true)}
              className="btn-primary btn w-full btn-lg"
            >
              Select Next Bowler →
            </button>
          </div>
        )}

        {/* ── Innings Break Banner Button ───────────────────────── */}
        {isMatchLive && currentInnings?.isInningsClosed && (() => {
          const isTest = matchScorecard?.match.cricket_format === 'test' || matchScorecard?.match.format === 'test';
          const maxInnings = isTest ? 4 : 2;
          const nextInnNum = (matchScorecard?.innings.length || 1) + 1;

          if (matchScorecard && matchScorecard.innings.length < maxInnings) {
            return (
              <div id="innings-break-banner" className="card p-6 mb-6 text-center border-brand-500/40 bg-brand-500/10 animate-fade-in">
                <h3 className="text-xl font-black text-white mb-2">
                  Innings {currentInnings.innings.innings_number} Complete{currentInnings.innings.is_declared ? ' (Declared)' : ''}!
                </h3>
                <p className="text-sm text-gray-300 mb-2">
                  <strong>{currentInnings.battingTeam?.label}</strong> finished with{' '}
                  <strong className="text-brand-300 text-base">
                    {currentInnings.totalRuns}/{currentInnings.totalWickets}
                  </strong>{' '}
                  ({currentInnings.oversFormatted} ov)
                </p>
                <button
                  id="btn-start-next-inn"
                  type="button"
                  onClick={() => setShowInningsBreakModal(true)}
                  className="btn-primary btn w-full btn-lg mt-4"
                >
                  Start Innings {nextInnNum} →
                </button>
              </div>
            );
          }
          return null;
        })()}

        {/* ── Match Completed Actions & POM ───────────────────────── */}
        {isMatchCompleted && (
          <div className="card p-5 mb-6 space-y-4">
            <h3 className="section-title text-base">Match Actions</h3>
            {!matchScorecard?.match.player_of_match_id ? (
              <div>
                <label className="label">⭐ Select Player of the Match</label>
                <div className="flex gap-2">
                  <select
                    id="select-cricket-pom"
                    className="input flex-1 text-sm"
                    value={pomPlayerId}
                    onChange={(e) => setPomPlayerId(e.target.value)}
                  >
                    <option value="">— Choose player —</option>
                    {allPlayers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    id="btn-save-cricket-pom"
                    onClick={handleSetPom}
                    disabled={!pomPlayerId || pomSubmitting}
                    className="btn-primary btn"
                  >
                    {pomSubmitting ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <div id="cricket-pom-banner" className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-sm">
                <span>⭐</span>
                <span className="text-amber-300 font-semibold">Player of the Match:</span>
                <span className="text-white">{matchScorecard.playerOfMatch?.name}</span>
              </div>
            )}

            <button
              onClick={handleUndo}
              className="btn-ghost btn btn-sm text-gray-400 hover:text-white"
            >
              ⤺ Undo Last Delivery
            </button>
          </div>
        )}

        {/* ── Toggle Scorecard Detail ─────────────────────────────── */}
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">📊</span>
              <h3 className="font-bold text-white text-sm">Detailed Scorecard</h3>
            </div>
            <button
              id="btn-toggle-scorecard"
              type="button"
              onClick={() => setShowDetailedScorecard((v) => !v)}
              className="btn-secondary btn btn-sm"
            >
              {showDetailedScorecard ? 'Hide ▲' : 'Show Scorecard ▼'}
            </button>
          </div>

          {showDetailedScorecard && (
            <div className="mt-4 pt-4 border-t border-surface-600/50 space-y-5">
              {/* Innings Tabs */}
              {matchScorecard?.innings.length > 1 && (
                <div className="flex gap-2">
                  {matchScorecard.innings.map((inn) => (
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

              {displayScorecardInnings && (
                <>
                  {/* Batting Card */}
                  <div>
                    <h4 className="text-xs uppercase font-bold text-gray-400 mb-2">
                      Batting · {displayScorecardInnings.battingTeam?.label}
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
                          {displayScorecardInnings.battingScorecard.map((b) => (
                            <tr key={b.id} className="text-gray-300">
                              <td className="py-2 font-semibold text-white">
                                {b.player?.name}
                                {b.status === 'batting' && !displayScorecardInnings.isInningsClosed && (
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
                        Extras: <strong>{displayScorecardInnings.extras.totalExtras}</strong> (wd {displayScorecardInnings.extras.wides}, nb {displayScorecardInnings.extras.noBalls})
                      </span>
                      <span>
                        Total: <strong className="text-white text-sm">{displayScorecardInnings.totalRuns}/{displayScorecardInnings.totalWickets}</strong> ({displayScorecardInnings.oversFormatted} ov)
                      </span>
                    </div>
                  </div>

                  {/* Bowling Card */}
                  <div className="pt-2">
                    <h4 className="text-xs uppercase font-bold text-gray-400 mb-2">
                      Bowling · {displayScorecardInnings.bowlingTeam?.label}
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
                          {displayScorecardInnings.bowlingScorecard.map((bw) => (
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
                  {displayScorecardInnings.fallOfWickets?.length > 0 && (
                    <div className="pt-2">
                      <h4 className="text-xs uppercase font-bold text-gray-400 mb-2">Fall of Wickets</h4>
                      <p className="text-xs text-gray-400 leading-relaxed">
                        {displayScorecardInnings.fallOfWickets
                          .map((f) => `${f.score}-${f.wicketNumber} (${f.batterName}, ${f.overs} ov)`)
                          .join(', ')}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL: WICKET ────────────────────────────────────────── */}
      {showWicketModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="card max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-surface-600">
              <h3 className="text-lg font-black text-red-400 flex items-center gap-2">
                <span>☝️</span> Record Wicket
              </h3>
              <button onClick={() => setShowWicketModal(false)} className="text-gray-400 hover:text-white">
                ✕
              </button>
            </div>

            {wicketError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400">
                {wicketError}
              </div>
            )}

            <div>
              <p className="text-xs text-gray-400 mb-1">Batter Dismissed</p>
              <p className="font-bold text-white text-base">
                {currentInnings?.currentBatter?.player?.name}
              </p>
            </div>

            {/* Dismissal Type */}
            <div>
              <label className="label">Dismissal Type</label>
              <div className="grid grid-cols-3 gap-2">
                {DISMISSAL_TYPES.map((d) => (
                  <button
                    key={d.id}
                    id={`dismissal-${d.id}`}
                    type="button"
                    onClick={() => setDismissalType(d.id)}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                      dismissalType === d.id
                        ? 'bg-red-500/20 border-red-500 text-red-300'
                        : 'bg-surface-700 border-surface-600 text-gray-400 hover:text-white'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Next Batter Selection (if not all out) */}
            {activeInningsState &&
            activeInningsState.totalWickets + 1 < activeInningsState.battingScorecard.length ? (
              <div>
                <label className="label">Next Batter to the Crease</label>
                <select
                  id="select-next-batter"
                  className="input text-sm"
                  value={nextBatterId}
                  onChange={(e) => setNextBatterId(e.target.value)}
                >
                  <option value="">— Select next batter —</option>
                  {availableNextBatters.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.player?.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 font-semibold">
                ⚠️ This wicket will make the batting team ALL OUT.
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowWicketModal(false)}
                className="btn-secondary btn flex-1"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-wicket"
                type="button"
                disabled={submitting}
                onClick={handleConfirmWicket}
                className="btn-danger btn flex-1"
              >
                {submitting ? 'Recording…' : 'Confirm Out'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: SELECT NEXT BOWLER ────────────────────────────── */}
      {showNextBowlerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="card max-w-md w-full p-6 space-y-5">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <span>🎯</span> Select Next Bowler
            </h3>
            <p className="text-xs text-gray-400">
              Over {currentInnings?.activeOverNumber} complete. The same bowler cannot bowl consecutive overs.
            </p>

            <div>
              <label className="label">Bowler for Over {(currentInnings?.activeOverNumber || 0) + 1}</label>
              <div className="space-y-2">
                {eligibleBowlers.map((p) => (
                  <button
                    key={p.id}
                    id={`select-bowler-${p.id}`}
                    type="button"
                    onClick={() => setSelectedNextBowlerId(p.id)}
                    className={`w-full text-left p-3.5 rounded-xl border text-sm font-semibold transition-all ${
                      selectedNextBowlerId === p.id
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                        : 'bg-surface-700 border-surface-600 text-gray-300 hover:text-white'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                id="btn-start-over-submit"
                type="button"
                disabled={!selectedNextBowlerId || submitting}
                onClick={handleStartNextOver}
                className="btn-primary btn w-full btn-lg"
              >
                {submitting ? 'Starting Over…' : 'Start Next Over →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: INNINGS BREAK / SETUP NEXT INNINGS ────────────── */}
      {showInningsBreakModal && (() => {
        const isTest = matchScorecard?.match.cricket_format === 'test' || matchScorecard?.match.format === 'test';
        const nextInnNumber = (matchScorecard?.innings.length || 1) + 1;
        const targetBattingTeam = matchScorecard?.match.teams.find((t) => t.id !== currentInnings?.battingTeam?.id);
        const defendingTeam = currentInnings?.battingTeam;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="card max-w-md w-full p-6 space-y-5">
              <h3 className="text-xl font-black text-white flex items-center gap-2">
                <span>🏏</span> Setup Innings {nextInnNumber} of {isTest ? 4 : 2}
              </h3>
              <p className="text-xs text-gray-400">
                Innings {currentInnings?.innings.innings_number}: {currentInnings?.totalRuns}/{currentInnings?.totalWickets} ({currentInnings?.oversFormatted} ov)
                {currentInnings?.innings.is_declared ? ' · Declared' : ''}
              </p>

              {/* Select Opening Batter */}
              <div>
                <label className="label">Opening Batter ({targetBattingTeam?.label})</label>
                <select
                  id="select-inn2-batter"
                  className="input text-sm"
                  value={inn2OpeningBatter}
                  onChange={(e) => setInn2OpeningBatter(e.target.value)}
                >
                  <option value="">— Select opening batter —</option>
                  {targetBattingTeam?.players?.map((p) => (
                    <option key={p.player?.id} value={p.player?.id}>
                      {p.player?.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Select Opening Bowler */}
              <div>
                <label className="label">Opening Bowler ({defendingTeam?.label})</label>
                <select
                  id="select-inn2-bowler"
                  className="input text-sm"
                  value={inn2OpeningBowler}
                  onChange={(e) => setInn2OpeningBowler(e.target.value)}
                >
                  <option value="">— Select opening bowler —</option>
                  {defendingTeam && matchScorecard?.match.teams
                    .find((t) => t.id === defendingTeam.id)
                    ?.players?.map((p) => (
                      <option key={p.player?.id} value={p.player?.id}>
                        {p.player?.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInningsBreakModal(false)}
                  className="btn-secondary btn flex-1"
                >
                  Cancel
                </button>
                <button
                  id="btn-confirm-start-inn2"
                  type="button"
                  disabled={submitting}
                  onClick={handleStartNextInnings}
                  className="btn-primary btn flex-1 btn-lg"
                >
                  {submitting ? 'Starting…' : `Start Innings ${nextInnNumber} →`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── MODAL: DECLARE INNINGS CONFIRMATION ──────────────────── */}
      {showDeclareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="card max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-black text-amber-400 flex items-center gap-2">
              <span>🚩</span> Declare Innings?
            </h3>
            <p className="text-xs text-gray-300">
              Are you sure you want to declare <strong>{currentInnings?.battingTeam?.label}</strong>&apos;s innings at{' '}
              <strong className="text-white">{currentInnings?.totalRuns}/{currentInnings?.totalWickets}</strong>?
            </p>
            <p className="text-xs text-gray-400">
              This will immediately close the current innings and allow the next innings to begin.
            </p>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeclareModal(false)}
                className="btn-secondary btn flex-1"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-declare"
                type="button"
                disabled={submitting}
                onClick={handleDeclareInnings}
                className="btn-primary btn flex-1 bg-amber-500 hover:bg-amber-600 border-none text-black font-bold"
              >
                {submitting ? 'Declaring…' : 'Yes, Declare Innings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: END MATCH AS DRAW CONFIRMATION ────────────────── */}
      {showDrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="card max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <span>🤝</span> End Match as Draw?
            </h3>
            <p className="text-xs text-gray-300">
              Are you sure you want to conclude this Test match as a <strong>Draw</strong>?
            </p>
            <p className="text-xs text-gray-400">
              This will complete the match with a Drawn result and close any remaining innings.
            </p>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDrawModal(false)}
                className="btn-secondary btn flex-1"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-draw"
                type="button"
                disabled={submitting}
                onClick={handleEndMatchAsDraw}
                className="btn-primary btn flex-1"
              >
                {submitting ? 'Concluding…' : 'End as Draw'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: EXTRA RUNS SELECTOR ───────────────────────────── */}
      {showExtraRunsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="card max-w-sm w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-white capitalize">
              {pendingExtraType === 'wide' ? 'Wide Delivery' : 'No Ball Delivery'}
            </h3>
            <p className="text-xs text-gray-400">
              {pendingExtraType === 'wide'
                ? 'Adds 1 penalty extra run + any byes/overthrows.'
                : 'Adds 1 penalty extra run + runs scored off the bat.'}
            </p>

            <div>
              <label className="label">Additional Runs</label>
              <div className="grid grid-cols-5 gap-2">
                {[0, 1, 2, 4, 6].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setExtraRunsInput(r)}
                    className={`py-3 rounded-xl border text-sm font-bold transition-all ${
                      extraRunsInput === r
                        ? 'bg-purple-600 border-purple-400 text-white'
                        : 'bg-surface-700 border-surface-600 text-gray-300 hover:text-white'
                    }`}
                  >
                    +{r}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowExtraRunsModal(false)}
                className="btn-secondary btn flex-1"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-extra"
                type="button"
                disabled={submitting}
                onClick={() => handleScoreExtra(pendingExtraType, extraRunsInput)}
                className="btn-primary btn flex-1"
              >
                Confirm (+{1 + extraRunsInput})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CHANGE BATTER ─────────────────────────────────── */}
      {showChangeBatterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="card max-w-sm w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-white">Change Active Striker</h3>
            <select
              className="input text-sm"
              value={newBatterSelection}
              onChange={(e) => setNewBatterSelection(e.target.value)}
            >
              <option value="">— Select batter —</option>
              {currentInnings?.battingScorecard.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.player?.name} ({b.status})
                </option>
              ))}
            </select>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowChangeBatterModal(false)}
                className="btn-secondary btn flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newBatterSelection || submitting}
                onClick={handleChangeBatter}
                className="btn-primary btn flex-1"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CHANGE BOWLER ─────────────────────────────────── */}
      {showChangeBowlerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="card max-w-sm w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-white">Change Current Bowler</h3>
            <select
              className="input text-sm"
              value={newBowlerSelection}
              onChange={(e) => setNewBowlerSelection(e.target.value)}
            >
              <option value="">— Select bowler —</option>
              {bowlingTeamPlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowChangeBowlerModal(false)}
                className="btn-secondary btn flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newBowlerSelection || submitting}
                onClick={handleChangeBowler}
                className="btn-primary btn flex-1"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
