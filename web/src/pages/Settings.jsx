import { useEffect, useState, useCallback, useRef } from 'react';
import { backupApi } from '../services/api';
import { LoadingSpinner, ConfirmDialog } from '../components/ui';

export default function Settings() {
  const fileInputRef = useRef(null);

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Export State
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(null);
  const [exportError, setExportError] = useState(null);

  // Import State
  const [importPreview, setImportPreview] = useState(null);
  const [importError, setImportError] = useState(null);
  const [importSuccess, setImportSuccess] = useState(null);
  const [importing, setImporting] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);

  // Reset State
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await backupApi.getStats();
      setStats(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Handle Export
  const handleExport = async () => {
    setExporting(true);
    setExportSuccess(null);
    setExportError(null);
    try {
      const res = await backupApi.download();
      setExportSuccess(`Backup exported successfully: ${res.data.filename}`);
    } catch (err) {
      setExportError(err?.message || 'Unable to export backup. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // Handle File Selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    setImportSuccess(null);
    setImportPreview(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result);
        const validation = backupApi.validate(json);
        setImportPreview({
          parsedData: json,
          validation,
          fileName: file.name,
          fileSize: (file.size / 1024).toFixed(1) + ' KB',
        });
      } catch (err) {
        setImportError(err.message || 'Invalid JSON file.');
      }
    };
    reader.onerror = () => {
      setImportError('Failed to read file.');
    };
    reader.readAsText(file);
  };

  // Handle Confirm Import
  const handleConfirmImport = async () => {
    if (!importPreview?.parsedData) return;
    setShowImportConfirm(false);
    setImporting(true);
    setImportError(null);
    setImportSuccess(null);
    try {
      const res = await backupApi.import(importPreview.parsedData);
      setImportSuccess(
        `Successfully restored ${res.data.restoredCounts.players} players, ${res.data.restoredCounts.matches} matches, and ${res.data.restoredCounts.tournaments} tournaments.`
      );
      setImportPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadStats();
    } catch (err) {
      setImportError(err.response?.data?.detail || err.message || 'Failed to import backup.');
    } finally {
      setImporting(false);
    }
  };

  // Handle Reset
  const handleReset = async () => {
    setShowResetConfirm(false);
    setResetting(true);
    setResetSuccess(null);
    try {
      await backupApi.reset();
      setResetSuccess('All local Mandir 11 data has been completely reset.');
      await loadStats();
    } catch {
      alert('Failed to reset database.');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="page pb-16">
      <div className="container-app max-w-3xl space-y-8">
        {/* Header */}
        <div>
          <h1 className="page-title flex items-center gap-2">
            <span>⚙️</span> Settings & Data Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Local-first storage controls, offline backups, data portability, and database reset
          </p>
        </div>

        {/* ── 1. Storage Status & Overview ────────────────────────── */}
        <div className="card p-6 space-y-4 bg-surface-800 border-surface-600">
          <h2 className="section-title text-base flex items-center justify-between">
            <span>💾 Local Database Health</span>
            <span className="badge-green text-[10px]">IndexedDB Local-First</span>
          </h2>

          {loading ? (
            <LoadingSpinner label="Inspecting local storage..." />
          ) : stats ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center pt-2">
              <div className="p-3 rounded-xl bg-surface-700/50">
                <p className="text-[11px] text-gray-400">Players</p>
                <p className="text-xl font-black text-white">{stats.playersCount}</p>
              </div>
              <div className="p-3 rounded-xl bg-surface-700/50">
                <p className="text-[11px] text-gray-400">Matches</p>
                <p className="text-xl font-black text-white">{stats.matchesCount}</p>
              </div>
              <div className="p-3 rounded-xl bg-surface-700/50">
                <p className="text-[11px] text-gray-400">Tournaments</p>
                <p className="text-xl font-black text-brand-300">{stats.tournamentsCount}</p>
              </div>
              <div className="p-3 rounded-xl bg-surface-700/50">
                <p className="text-[11px] text-gray-400">Ledger Stakes</p>
                <p className="text-xl font-black text-emerald-400">{stats.ledgerCount}</p>
              </div>
            </div>
          ) : null}

          <p className="text-xs text-gray-400">
            All Mandir 11 data is strictly stored locally on this device. No remote servers, cloud databases, or tracking are used.
          </p>
        </div>

        {/* ── 2. Export & Download Backup ─────────────────────────── */}
        <div className="card p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="section-title text-base flex items-center gap-2">
                <span>⬇️</span> Export Local Backup
              </h2>
              <p className="text-xs text-gray-400 mt-1 max-w-lg">
                Download a complete JSON snapshot containing all players, ball-by-ball records, matches, tournaments, and money ledgers.
              </p>
            </div>
            <button
              id="btn-export-backup"
              onClick={handleExport}
              disabled={exporting}
              className="btn-primary btn btn-sm whitespace-nowrap"
            >
              {exporting ? 'Generating…' : 'Download Backup'}
            </button>
          </div>

          {exportSuccess && (
            <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
              <span>✓</span>
              <span>{exportSuccess}</span>
            </div>
          )}

          {exportError && (
            <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-xs text-red-300 flex items-center gap-2">
              <span>❌</span>
              <span>{exportError}</span>
            </div>
          )}
        </div>

        {/* ── 3. Import & Restore Backup ──────────────────────────── */}
        <div className="card p-6 space-y-5">
          <div>
            <h2 className="section-title text-base flex items-center gap-2">
              <span>📥</span> Restore from JSON Backup
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Select a previously downloaded Mandir 11 backup file to restore records on this device.
            </p>
          </div>

          {/* File Picker */}
          <div className="p-4 rounded-xl bg-surface-700/40 border border-surface-600/40 space-y-3">
            <input
              ref={fileInputRef}
              id="input-backup-file"
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="text-xs text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-brand-500 file:text-white hover:file:bg-brand-600 cursor-pointer"
            />
          </div>

          {importError && (
            <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-xs text-red-300">
              ❌ {importError}
            </div>
          )}

          {importSuccess && (
            <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-xs text-emerald-300">
              ✓ {importSuccess}
            </div>
          )}

          {/* Backup Preview */}
          {importPreview && (
            <div className="p-4 rounded-xl bg-surface-700/60 border border-brand-500/30 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-white">{importPreview.fileName}</p>
                  <p className="text-[11px] text-gray-400">
                    Exported on: {new Date(importPreview.validation.exported_at).toLocaleString('en-IN')} · {importPreview.fileSize}
                  </p>
                </div>
                <span className="badge-green text-[10px]">Valid Format</span>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-center text-xs text-gray-300 pt-2 border-t border-surface-600/40">
                <div className="p-2 rounded bg-surface-800">
                  <span className="text-[10px] text-gray-400 block">Players</span>
                  <strong className="text-white">{importPreview.validation.counts.players}</strong>
                </div>
                <div className="p-2 rounded bg-surface-800">
                  <span className="text-[10px] text-gray-400 block">Matches</span>
                  <strong className="text-white">{importPreview.validation.counts.matches}</strong>
                </div>
                <div className="p-2 rounded bg-surface-800">
                  <span className="text-[10px] text-gray-400 block">Tournaments</span>
                  <strong className="text-white">{importPreview.validation.counts.tournaments}</strong>
                </div>
                <div className="p-2 rounded bg-surface-800">
                  <span className="text-[10px] text-gray-400 block">Ledger Entries</span>
                  <strong className="text-white">{importPreview.validation.counts.ledger_entries}</strong>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-400/10 border border-amber-400/20 text-xs text-amber-200">
                ⚠️ <strong>Warning:</strong> Restoring this backup will replace existing local data on this device with the contents of the backup file.
              </div>

              <button
                id="btn-confirm-import"
                onClick={() => setShowImportConfirm(true)}
                disabled={importing}
                className="btn-primary btn btn-sm w-full"
              >
                {importing ? 'Restoring Backup…' : '⚡ Overwrite & Restore from Backup'}
              </button>
            </div>
          )}
        </div>

        {/* ── 4. Danger Zone: Reset Database ──────────────────────── */}
        <div className="card p-6 space-y-4 border-red-500/30 bg-red-950/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-black text-red-400 flex items-center gap-2">
                <span>⚠️</span> Danger Zone: Reset All Local Data
              </h2>
              <p className="text-xs text-gray-400 mt-1 max-w-lg">
                Permanently delete all colony records, cricket scores, money ledgers, tournaments, and player rosters from this device.
              </p>
            </div>

            <button
              id="btn-reset-database"
              onClick={() => setShowResetConfirm(true)}
              disabled={resetting}
              className="btn-danger btn btn-sm whitespace-nowrap self-start sm:self-auto"
            >
              {resetting ? 'Resetting…' : '🗑️ Reset All Data'}
            </button>
          </div>

          {resetSuccess && (
            <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-xs text-emerald-300">
              ✓ {resetSuccess}
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────── */}
      {showImportConfirm && (
        <ConfirmDialog
          title="Overwrite Local Data with Backup?"
          message="Restoring this backup will overwrite your current local match history, teams, scores, and money ledgers. This action cannot be undone."
          confirmText="Confirm Overwrite & Restore"
          onConfirm={handleConfirmImport}
          onCancel={() => setShowImportConfirm(false)}
          dangerous
        />
      )}

      {showResetConfirm && (
        <ConfirmDialog
          title="Reset All Local Data Permanently?"
          message="Are you sure you want to reset all Mandir 11 data? This will permanently delete all local records, matches, scores, ledger entries, tournaments, and players from this device. This cannot be undone."
          confirmText="Reset Everything"
          onConfirm={handleReset}
          onCancel={() => setShowResetConfirm(false)}
          dangerous
        />
      )}
    </div>
  );
}
