export function LoadingSpinner({ size = 'md', label = 'Loading...' }) {
  const sizeClass = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' }[size];
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12" role="status" aria-label={label}>
      <div className={`${sizeClass} border-2 border-surface-600 border-t-brand-500 rounded-full animate-spin`} />
      <span className="text-sm text-gray-500">{label}</span>
    </div>
  );
}

export function EmptyState({ icon = '📭', title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center animate-fade-in">
      <div className="text-5xl">{icon}</div>
      <div>
        <p className="text-lg font-semibold text-gray-300">{title}</p>
        {description && <p className="text-sm text-gray-500 mt-1 max-w-xs mx-auto">{description}</p>}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center animate-fade-in">
      <div className="text-5xl">⚠️</div>
      <div>
        <p className="text-lg font-semibold text-red-400">Something went wrong</p>
        <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">{message}</p>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary btn btn-sm">
          Try again
        </button>
      )}
    </div>
  );
}

export function ConfirmDialog({ title, message, onConfirm, onCancel, dangerous = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="card max-w-sm w-full mx-4 p-6 animate-slide-up">
        <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
        <p className="text-sm text-gray-400 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button id="confirm-cancel" onClick={onCancel} className="btn-secondary btn btn-sm">Cancel</button>
          <button
            id="confirm-ok"
            onClick={onConfirm}
            className={dangerous ? 'btn-danger btn btn-sm' : 'btn-primary btn btn-sm'}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
