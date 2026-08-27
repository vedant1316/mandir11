export default function PlayerBadge({ player, selected, onClick, disabled }) {
  if (!player) return null;

  const base =
    'flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all duration-200 select-none';

  const state = disabled
    ? 'bg-surface-700/30 border-surface-600/30 text-gray-600 cursor-not-allowed'
    : selected
    ? 'bg-brand-500/20 border-brand-500 text-brand-200 cursor-pointer shadow-lg shadow-brand-500/10'
    : 'bg-surface-700 border-surface-500 text-gray-300 hover:border-brand-500/50 hover:bg-surface-600 cursor-pointer';

  return (
    <button
      type="button"
      id={`player-badge-${player.id}`}
      className={`${base} ${state}`}
      onClick={!disabled && onClick ? onClick : undefined}
      disabled={disabled}
      title={!player.is_active ? 'Inactive player' : player.name}
    >
      <span className="w-6 h-6 rounded-full bg-brand-500/20 flex items-center justify-center text-xs text-brand-300 font-bold flex-shrink-0">
        {player.name.charAt(0).toUpperCase()}
      </span>
      <span className="truncate">{player.name}</span>
      {selected && (
        <span className="ml-auto text-brand-400 flex-shrink-0">✓</span>
      )}
      {!player.is_active && (
        <span className="ml-auto text-xs text-gray-600 flex-shrink-0">inactive</span>
      )}
    </button>
  );
}
