import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ledgerApi, playersApi } from '../services/api';
import { LoadingSpinner, ErrorState, ConfirmDialog } from '../components/ui';

const TABS = [
  { id: 'outstanding', label: '🔴 Outstanding', desc: 'Active pending debts' },
  { id: 'settled',     label: '🟢 Settled',     desc: 'Fully resolved debts' },
  { id: 'history',     label: '📜 Payment Log', desc: 'All recorded payments' },
  { id: 'balances',    label: '🏆 Net Balances', desc: 'Colony leaderboard' },
  { id: 'statement',   label: '👤 Statements',   desc: 'Individual player accounts' },
];

export default function Ledger() {
  const [activeTab, setActiveTab] = useState('outstanding');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [allPlayers, setAllPlayers] = useState([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [playerHistory, setPlayerHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Modals state
  const [payModalDebt, setPayModalDebt] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [payError, setPayError] = useState(null);

  const [editDebtModal, setEditDebtModal] = useState(null);
  const [editDebtAmount, setEditDebtAmount] = useState('');
  const [editDebtReason, setEditDebtReason] = useState('');
  const [editDebtSubmitting, setEditDebtSubmitting] = useState(false);
  const [editDebtError, setEditDebtError] = useState(null);

  const [undoPaymentTarget, setUndoPaymentTarget] = useState(null);
  const [undoSubmitting, setUndoSubmitting] = useState(false);

  const [editPaymentTarget, setEditPaymentTarget] = useState(null);
  const [editPaymentAmount, setEditPaymentAmount] = useState('');
  const [editPaymentNote, setEditPaymentNote] = useState('');
  const [editPaymentSubmitting, setEditPaymentSubmitting] = useState(false);
  const [editPaymentError, setEditPaymentError] = useState(null);

  const showFlash = (msg) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 4000);
  };

  const loadColonySummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, playersRes] = await Promise.all([
        ledgerApi.getColonySummary(),
        playersApi.list(false),
      ]);
      setSummary(sumRes.data);
      const players = playersRes.data.players;
      setAllPlayers(players);
      if (players.length > 0 && !selectedPlayerId) {
        setSelectedPlayerId(players[0].id);
      }
    } catch {
      setError('Failed to load colony ledger.');
    } finally {
      setLoading(false);
    }
  }, [selectedPlayerId]);

  useEffect(() => {
    loadColonySummary();
  }, [loadColonySummary]);

  const loadPlayerHistory = useCallback(async (pid) => {
    if (!pid) return;
    setHistoryLoading(true);
    try {
      const res = await ledgerApi.getPlayerHistory(pid);
      setPlayerHistory(res.data);
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedPlayerId) {
      loadPlayerHistory(selectedPlayerId);
    }
  }, [selectedPlayerId, loadPlayerHistory]);

  // ── Actions ───────────────────────────────────────────────────────

  const openPayModal = (debt) => {
    setPayModalDebt(debt);
    setPayAmount(String(debt.remainingAmount));
    setPayNote('');
    setPayError(null);
  };

  const handleRecordPayment = async (e) => {
    e?.preventDefault();
    if (!payModalDebt || paySubmitting) return;

    const numAmount = Number(payAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setPayError('Please enter a valid payment amount greater than zero.');
      return;
    }
    if (numAmount > payModalDebt.remainingAmount) {
      setPayError(`Payment (₹${numAmount}) cannot exceed remaining debt (₹${payModalDebt.remainingAmount}).`);
      return;
    }

    setPaySubmitting(true);
    setPayError(null);
    try {
      await ledgerApi.recordPayment({
        matchId: payModalDebt.matchId,
        debtId: payModalDebt.debtId,
        fromPlayerId: payModalDebt.fromPlayer.id,
        toPlayerId: payModalDebt.toPlayer.id,
        amount: numAmount,
        note: payNote,
      });

      setPayModalDebt(null);
      showFlash(`💸 Payment of ₹${numAmount} recorded successfully!`);
      await loadColonySummary();
    } catch (err) {
      setPayError(err.response?.data?.detail || err.message || 'Failed to record payment.');
    } finally {
      setPaySubmitting(false);
    }
  };

  const openEditDebtModal = (debt) => {
    setEditDebtModal(debt);
    setEditDebtAmount(String(debt.currentDebtAmount));
    setEditDebtReason(debt.adjustmentReason || '');
    setEditDebtError(null);
  };

  const handleSaveDebtAmount = async (e) => {
    e?.preventDefault();
    if (!editDebtModal || editDebtSubmitting) return;

    const numAmount = Number(editDebtAmount);
    if (isNaN(numAmount) || numAmount < 0) {
      setEditDebtError('Debt amount must be a non-negative number (>= 0).');
      return;
    }
    if (numAmount < editDebtModal.totalPaid) {
      setEditDebtError(`Debt amount cannot be less than already paid amount (₹${editDebtModal.totalPaid}).`);
      return;
    }

    setEditDebtSubmitting(true);
    setEditDebtError(null);
    try {
      await ledgerApi.adjustDebtAmount({
        matchId: editDebtModal.matchId,
        debtId: editDebtModal.debtId,
        fromPlayerId: editDebtModal.fromPlayer.id,
        toPlayerId: editDebtModal.toPlayer.id,
        newAmount: numAmount,
        reason: editDebtReason,
      });

      setEditDebtModal(null);
      showFlash(`✏️ Debt amount updated to ₹${numAmount}`);
      await loadColonySummary();
    } catch (err) {
      setEditDebtError(err.response?.data?.detail || err.message || 'Failed to update debt amount.');
    } finally {
      setEditDebtSubmitting(false);
    }
  };

  const handleConfirmUndoPayment = async () => {
    if (!undoPaymentTarget || undoSubmitting) return;
    setUndoSubmitting(true);
    try {
      await ledgerApi.deletePayment(undoPaymentTarget.id);
      setUndoPaymentTarget(null);
      showFlash('↩ Payment successfully undone.');
      await loadColonySummary();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to undo payment.');
    } finally {
      setUndoSubmitting(false);
    }
  };

  const openEditPaymentModal = (payment) => {
    setEditPaymentTarget(payment);
    setEditPaymentAmount(String(payment.amount));
    setEditPaymentNote(payment.note || '');
    setEditPaymentError(null);
  };

  const handleSavePaymentEdit = async (e) => {
    e?.preventDefault();
    if (!editPaymentTarget || editPaymentSubmitting) return;

    const numAmount = Number(editPaymentAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setEditPaymentError('Payment amount must be greater than zero.');
      return;
    }

    setEditPaymentSubmitting(true);
    setEditPaymentError(null);
    try {
      await ledgerApi.updatePayment(editPaymentTarget.id, {
        amount: numAmount,
        note: editPaymentNote,
      });

      setEditPaymentTarget(null);
      showFlash('✏️ Payment details updated.');
      await loadColonySummary();
    } catch (err) {
      setEditPaymentError(err.response?.data?.detail || err.message || 'Failed to update payment.');
    } finally {
      setEditPaymentSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div className="container-app">
          <LoadingSpinner label="Loading colony ledger & settlements..." />
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="page">
        <div className="container-app">
          <ErrorState message={error || 'Failed to load ledger.'} onRetry={loadColonySummary} />
        </div>
      </div>
    );
  }

  const outstandingDebts = summary.outstandingDebts || [];
  const settledDebts = summary.settledDebts || [];
  const allPayments = summary.allPayments || [];

  return (
    <div className="page pb-16">
      <div className="container-app max-w-3xl space-y-8">
        {/* Flash Message */}
        {actionSuccess && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm font-semibold flex items-center justify-between animate-slide-up">
            <span>{actionSuccess}</span>
            <button onClick={() => setActionSuccess(null)} className="text-gray-400 hover:text-white font-bold ml-2">✕</button>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <span>💰</span> Colony Money Ledger
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Peer-to-peer settlement & payment tracking for match stakes
            </p>
          </div>
          <div className="flex gap-2">
            <div className="card p-3 px-4 bg-surface-800 border-surface-600">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Outstanding</p>
              <p className="text-lg font-black text-amber-400">₹{summary.totalOutstanding || 0}</p>
            </div>
            <div className="card p-3 px-4 bg-surface-800 border-surface-600">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Settled</p>
              <p className="text-lg font-black text-emerald-400">₹{summary.totalPaid || 0}</p>
            </div>
          </div>
        </div>

        {/* Tabs Navigation */}
        <div className="flex gap-2 border-b border-surface-600/50 pb-2 overflow-x-auto">
          {TABS.map((tab) => {
            const count =
              tab.id === 'outstanding'
                ? outstandingDebts.length
                : tab.id === 'settled'
                ? settledDebts.length
                : tab.id === 'history'
                ? allPayments.length
                : null;

            return (
              <button
                key={tab.id}
                id={`tab-ledger-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
                  activeTab === tab.id
                    ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/25'
                    : 'bg-surface-800 text-gray-400 hover:text-white'
                }`}
              >
                <span>{tab.label}</span>
                {count !== null && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                      activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-surface-700 text-gray-400'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── TAB 1: 🔴 Outstanding Debts ───────────────────────── */}
        {activeTab === 'outstanding' && (
          <div className="space-y-4 animate-slide-up">
            <div className="flex items-center justify-between">
              <h2 className="section-title text-base flex items-center gap-2">
                <span>🔴</span> Active Outstanding Debts
              </h2>
              <span className="text-xs text-gray-500">{outstandingDebts.length} pending</span>
            </div>

            {outstandingDebts.length === 0 ? (
              <div className="card p-12 text-center text-gray-400">
                <span className="text-4xl block mb-2">✨</span>
                <p className="font-semibold text-white">All accounts are settled!</p>
                <p className="text-xs text-gray-500 mt-1">No outstanding peer-to-peer debts in the colony.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {outstandingDebts.map((d) => {
                  const percentPaid = Math.min(100, Math.round((d.totalPaid / (d.currentDebtAmount || 1)) * 100));

                  return (
                    <div
                      key={d.debtId}
                      className="card p-5 border-surface-600 bg-surface-800 space-y-4 transition-all hover:border-surface-500"
                    >
                      {/* Top line: Rahul owes Aman */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap text-sm">
                          <span className="px-2.5 py-1 rounded-lg font-bold bg-red-500/15 text-red-400 border border-red-500/30">
                            {d.fromPlayer?.name}
                          </span>
                          <span className="text-gray-400 text-xs font-semibold">owes</span>
                          <span className="px-2.5 py-1 rounded-lg font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            {d.toPlayer?.name}
                          </span>
                          <span className="font-black text-white text-base ml-1">
                            ₹{d.currentDebtAmount}
                          </span>
                          {d.isAdjusted && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                              ✏️ Adjusted (was ₹{d.originalAmount})
                            </span>
                          )}
                        </div>

                        {d.matchId && (
                          <Link
                            to={`/matches/${d.matchId}`}
                            className="text-[11px] text-brand-400 hover:text-brand-300 font-semibold"
                          >
                            {d.sport ? d.sport.toUpperCase() : 'Match'} →
                          </Link>
                        )}
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1.5">
                        <div className="w-full bg-surface-700 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-brand-500 to-emerald-400 h-full transition-all duration-300"
                            style={{ width: `${percentPaid}%` }}
                          />
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-gray-400">
                            Paid: <strong className="text-emerald-400">₹{d.totalPaid}</strong>
                          </span>
                          <span className="text-gray-400">
                            Remaining: <strong className="text-amber-400 text-sm">₹{d.remainingAmount}</strong>
                          </span>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center justify-between pt-2 border-t border-surface-700/60 gap-3">
                        <div className="text-[11px] text-gray-500">
                          {d.payments?.length > 0 ? `${d.payments.length} payment(s) recorded` : 'No payments yet'}
                        </div>

                        <div className="flex gap-2">
                          <button
                            id={`btn-edit-${d.debtId}`}
                            type="button"
                            onClick={() => openEditDebtModal(d)}
                            className="btn-secondary btn btn-sm text-xs flex items-center gap-1"
                          >
                            <span>✏️</span> Edit
                          </button>
                          <button
                            id={`btn-pay-${d.debtId}`}
                            type="button"
                            onClick={() => openPayModal(d)}
                            className="btn-primary btn btn-sm text-xs flex items-center gap-1"
                          >
                            <span>💸</span> Pay ₹
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: 🟢 Settled Debts ───────────────────────────── */}
        {activeTab === 'settled' && (
          <div className="space-y-4 animate-slide-up">
            <div className="flex items-center justify-between">
              <h2 className="section-title text-base flex items-center gap-2">
                <span>🟢</span> Settled Debts
              </h2>
              <span className="text-xs text-gray-500">{settledDebts.length} settled</span>
            </div>

            {settledDebts.length === 0 ? (
              <div className="card p-12 text-center text-gray-400">
                <span className="text-4xl block mb-2">⏳</span>
                <p className="font-semibold text-white">No settled debts yet</p>
                <p className="text-xs text-gray-500 mt-1">When debts are fully paid, they will appear here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {settledDebts.map((d) => (
                  <div
                    key={d.debtId}
                    className="card p-5 border-emerald-500/20 bg-emerald-500/5 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="badge-emerald text-xs font-black">✅ Settled</span>
                        <p className="text-sm text-white font-bold">
                          <span className="text-gray-300">{d.fromPlayer?.name}</span> paid{' '}
                          <span className="text-emerald-300">{d.toPlayer?.name}</span>{' '}
                          <span className="text-white font-black text-base">₹{d.currentDebtAmount}</span>
                        </p>
                      </div>

                      {d.lastPaymentDate && (
                        <span className="text-xs text-gray-400">
                          {new Date(d.lastPaymentDate).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      )}
                    </div>

                    {d.payments?.length > 0 && (
                      <div className="pt-2 border-t border-surface-700/50 space-y-1.5">
                        <p className="text-[11px] font-semibold text-gray-400">Payment Breakdown:</p>
                        {d.payments.map((p) => (
                          <div key={p.id} className="flex items-center justify-between text-xs text-gray-300 bg-surface-800/60 p-2 rounded-lg">
                            <span>
                              ₹{p.amount} {p.note ? `· ${p.note}` : ''}
                            </span>
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] text-gray-500">
                                {new Date(p.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                              </span>
                              <button
                                type="button"
                                onClick={() => setUndoPaymentTarget(p)}
                                className="text-red-400 hover:text-red-300 text-xs font-semibold"
                              >
                                ↩ Undo
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: 📜 Payment History Log ─────────────────────── */}
        {activeTab === 'history' && (
          <div className="space-y-4 animate-slide-up">
            <div className="flex items-center justify-between">
              <h2 className="section-title text-base flex items-center gap-2">
                <span>📜</span> All Payment Transactions
              </h2>
              <span className="text-xs text-gray-500">{allPayments.length} recorded</span>
            </div>

            {allPayments.length === 0 ? (
              <div className="card p-12 text-center text-gray-400">
                <span className="text-4xl block mb-2">📝</span>
                <p className="font-semibold text-white">No payment transactions recorded</p>
                <p className="text-xs text-gray-500 mt-1">Use the "Pay ₹" button on outstanding debts to log payments.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {allPayments.map((p) => (
                  <div
                    key={p.id}
                    className="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface-700/50 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-bold text-red-400">{p.fromPlayer?.name}</span>
                        <span className="text-gray-500">→</span>
                        <span className="font-bold text-emerald-400">{p.toPlayer?.name}</span>
                        <span className="font-black text-white text-sm ml-2">₹{p.amount}</span>
                      </div>
                      {p.note && <p className="text-[11px] text-gray-400">Note: {p.note}</p>}
                    </div>

                    <div className="flex items-center gap-3 justify-between sm:justify-end text-xs">
                      <span className="text-gray-500 text-[11px]">
                        {new Date(p.created_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEditPaymentModal(p)}
                          className="btn-ghost btn btn-sm text-xs text-gray-300 hover:text-white"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setUndoPaymentTarget(p)}
                          className="btn-ghost btn btn-sm text-xs text-red-400 hover:text-red-300"
                        >
                          ↩ Undo
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 4: 🏆 Net Balances Leaderboard ─────────────────── */}
        {activeTab === 'balances' && (
          <div className="card p-6 space-y-4 animate-slide-up">
            <h2 className="section-title text-base flex items-center gap-2">
              <span>🏆</span> Colony Net Balance Standings
            </h2>

            {summary.leaderboard.length === 0 ? (
              <p className="text-xs text-gray-500">No staked matches completed yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-surface-600 text-gray-500">
                      <th className="pb-3 font-semibold">Player</th>
                      <th className="pb-3 font-semibold text-right">Matches</th>
                      <th className="pb-3 font-semibold text-right">Won</th>
                      <th className="pb-3 font-semibold text-right">Lost</th>
                      <th className="pb-3 font-semibold text-right">Net Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-700/50">
                    {summary.leaderboard.map((p) => (
                      <tr key={p.player.id} className="text-gray-300 hover:bg-surface-700/30 transition-colors">
                        <td className="py-3 font-semibold text-white flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-surface-600 flex items-center justify-center text-xs text-gray-300 font-bold">
                            {p.player.name.charAt(0).toUpperCase()}
                          </div>
                          {p.player.name}
                        </td>
                        <td className="py-3 text-right text-gray-400">{p.matchesCount}</td>
                        <td className="py-3 text-right text-emerald-400 font-semibold">₹{p.totalWon}</td>
                        <td className="py-3 text-right text-red-400 font-semibold">₹{p.totalLost}</td>
                        <td className="py-3 text-right">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                              p.netBalance > 0
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : p.netBalance < 0
                                ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                : 'bg-surface-700 text-gray-400'
                            }`}
                          >
                            {p.netBalance > 0 ? `+₹${p.netBalance}` : p.netBalance < 0 ? `-₹${Math.abs(p.netBalance)}` : '₹0'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 5: 👤 Individual Statement Inspector ──────────── */}
        {activeTab === 'statement' && (
          <div className="card p-6 space-y-4 animate-slide-up">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="section-title text-base flex items-center gap-2">
                <span>📜</span> Individual Player Statement
              </h2>
              <select
                id="select-player-statement"
                className="input text-xs sm:w-48"
                value={selectedPlayerId}
                onChange={(e) => setSelectedPlayerId(e.target.value)}
              >
                {allPlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {historyLoading ? (
              <div className="py-8"><LoadingSpinner /></div>
            ) : playerHistory ? (
              <div className="space-y-4">
                {/* Player Summary Pill */}
                <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-surface-700/40 text-center text-xs">
                  <div>
                    <p className="text-gray-400 mb-0.5">Total Won</p>
                    <p className="text-emerald-400 font-bold text-base">₹{playerHistory.totalWon}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 mb-0.5">Total Lost</p>
                    <p className="text-red-400 font-bold text-base">₹{playerHistory.totalLost}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 mb-0.5">Net Balance</p>
                    <p className={`font-black text-base ${
                      playerHistory.totalBalance >= 0 ? 'text-emerald-300' : 'text-red-400'
                    }`}>
                      {playerHistory.totalBalance >= 0 ? `+₹${playerHistory.totalBalance}` : `-₹${Math.abs(playerHistory.totalBalance)}`}
                    </p>
                  </div>
                </div>

                {/* Match History List */}
                {playerHistory.history.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-4">No staked match history for this player.</p>
                ) : (
                  <div className="space-y-2">
                    {playerHistory.history.map((h) => (
                      <div
                        key={h.matchId}
                        className="p-3 rounded-xl bg-surface-700 flex items-center justify-between text-xs hover:bg-surface-600 transition-colors"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="capitalize font-semibold text-white">{h.sport}</span>
                            <span className="text-[10px] text-gray-400">
                              {new Date(h.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-400">
                            Stake: ₹{h.stakeAmount} · Status: {h.status}
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
                          <span
                            className={`font-black text-sm ${
                              h.netAmount > 0
                                ? 'text-emerald-400'
                                : h.netAmount < 0
                                ? 'text-red-400'
                                : 'text-gray-400'
                            }`}
                          >
                            {h.netAmount > 0 ? `+₹${h.netAmount}` : h.netAmount < 0 ? `-₹${Math.abs(h.netAmount)}` : '₹0'}
                          </span>
                          <Link to={`/matches/${h.matchId}`} className="text-brand-400 hover:text-brand-300 font-bold">
                            View →
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* ── MODAL: Record Payment ─────────────────────────────────── */}
      {payModalDebt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="card max-w-md w-full p-6 space-y-5 border-surface-600 bg-surface-800 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="section-title text-base flex items-center gap-2">
                <span>💸</span> Record Payment
              </h3>
              <button
                type="button"
                onClick={() => setPayModalDebt(null)}
                className="text-gray-400 hover:text-white font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-surface-700/50 border border-surface-600 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-gray-400">Debtor (Paying):</span>
                <span className="font-bold text-red-400">{payModalDebt.fromPlayer?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Creditor (Receiving):</span>
                <span className="font-bold text-emerald-400">{payModalDebt.toPlayer?.name}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-surface-600/50">
                <span className="text-gray-300 font-semibold">Remaining Debt:</span>
                <span className="font-black text-amber-300 text-sm">₹{payModalDebt.remainingAmount}</span>
              </div>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div>
                <label className="label">Payment Amount (₹)</label>
                <input
                  id="input-pay-amount"
                  type="number"
                  step="any"
                  min="1"
                  max={payModalDebt.remainingAmount}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="input text-lg font-black text-emerald-400"
                  required
                />
                {/* Quick select buttons */}
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setPayAmount(String(payModalDebt.remainingAmount))}
                    className="btn-secondary btn btn-xs text-[11px]"
                  >
                    Full (₹{payModalDebt.remainingAmount})
                  </button>
                  {payModalDebt.remainingAmount > 50 && (
                    <button
                      type="button"
                      onClick={() => setPayAmount('50')}
                      className="btn-secondary btn btn-xs text-[11px]"
                    >
                      ₹50
                    </button>
                  )}
                  {payModalDebt.remainingAmount > 100 && (
                    <button
                      type="button"
                      onClick={() => setPayAmount('100')}
                      className="btn-secondary btn btn-xs text-[11px]"
                    >
                      ₹100
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="label">Payment Note / Method (Optional)</label>
                <input
                  id="input-pay-note"
                  type="text"
                  placeholder="e.g. GPay, Cash, UPI"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  className="input text-sm"
                />
              </div>

              {payError && <p className="text-red-400 text-xs">{payError}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPayModalDebt(null)}
                  className="btn-secondary btn flex-1"
                >
                  Cancel
                </button>
                <button
                  id="btn-confirm-payment"
                  type="submit"
                  disabled={paySubmitting}
                  className="btn-primary btn flex-1"
                >
                  {paySubmitting ? 'Recording…' : `Confirm ₹${payAmount || 0}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Edit Debt Amount ──────────────────────────────── */}
      {editDebtModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="card max-w-md w-full p-6 space-y-5 border-surface-600 bg-surface-800 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="section-title text-base flex items-center gap-2">
                <span>✏️</span> Edit Debt Amount
              </h3>
              <button
                type="button"
                onClick={() => setEditDebtModal(null)}
                className="text-gray-400 hover:text-white font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded-xl bg-surface-700/50 text-xs space-y-1">
              <p className="text-gray-300">
                Editing debt between <strong className="text-red-400">{editDebtModal.fromPlayer?.name}</strong> and{' '}
                <strong className="text-emerald-400">{editDebtModal.toPlayer?.name}</strong>.
              </p>
              <p className="text-gray-400">
                Already paid: <strong className="text-emerald-400">₹{editDebtModal.totalPaid}</strong>
              </p>
            </div>

            <form onSubmit={handleSaveDebtAmount} className="space-y-4">
              <div>
                <label className="label">New Total Debt Amount (₹)</label>
                <input
                  id="input-edit-debt-amount"
                  type="number"
                  step="any"
                  min={editDebtModal.totalPaid}
                  value={editDebtAmount}
                  onChange={(e) => setEditDebtAmount(e.target.value)}
                  className="input font-bold text-white"
                  required
                />
              </div>

              <div>
                <label className="label">Reason for Correction (Optional)</label>
                <input
                  id="input-edit-debt-reason"
                  type="text"
                  placeholder="e.g. Colony discount agreed, stake adjustment"
                  value={editDebtReason}
                  onChange={(e) => setEditDebtReason(e.target.value)}
                  className="input text-sm"
                />
              </div>

              {editDebtError && <p className="text-red-400 text-xs">{editDebtError}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditDebtModal(null)}
                  className="btn-secondary btn flex-1"
                >
                  Cancel
                </button>
                <button
                  id="btn-save-debt-amount"
                  type="submit"
                  disabled={editDebtSubmitting}
                  className="btn-primary btn flex-1"
                >
                  {editDebtSubmitting ? 'Saving…' : 'Save Amount'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Edit Payment ──────────────────────────────────── */}
      {editPaymentTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="card max-w-md w-full p-6 space-y-5 border-surface-600 bg-surface-800 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="section-title text-base flex items-center gap-2">
                <span>✏️</span> Edit Payment Receipt
              </h3>
              <button
                type="button"
                onClick={() => setEditPaymentTarget(null)}
                className="text-gray-400 hover:text-white font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePaymentEdit} className="space-y-4">
              <div>
                <label className="label">Payment Amount (₹)</label>
                <input
                  id="input-edit-payment-amount"
                  type="number"
                  step="any"
                  min="1"
                  value={editPaymentAmount}
                  onChange={(e) => setEditPaymentAmount(e.target.value)}
                  className="input font-bold text-white"
                  required
                />
              </div>

              <div>
                <label className="label">Payment Note</label>
                <input
                  id="input-edit-payment-note"
                  type="text"
                  value={editPaymentNote}
                  onChange={(e) => setEditPaymentNote(e.target.value)}
                  className="input text-sm"
                />
              </div>

              {editPaymentError && <p className="text-red-400 text-xs">{editPaymentError}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditPaymentTarget(null)}
                  className="btn-secondary btn flex-1"
                >
                  Cancel
                </button>
                <button
                  id="btn-save-payment-edit"
                  type="submit"
                  disabled={editPaymentSubmitting}
                  className="btn-primary btn flex-1"
                >
                  {editPaymentSubmitting ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── DIALOG: Undo Payment ─────────────────────────────────── */}
      {undoPaymentTarget && (
        <ConfirmDialog
          title="Undo Payment Receipt?"
          message={`Are you sure you want to undo the payment of ₹${undoPaymentTarget.amount} from ${undoPaymentTarget.fromPlayer?.name} to ${undoPaymentTarget.toPlayer?.name}? This will restore the debt balance.`}
          confirmText="Yes, Undo Payment"
          onConfirm={handleConfirmUndoPayment}
          onCancel={() => setUndoPaymentTarget(null)}
          dangerous
        />
      )}
    </div>
  );
}
