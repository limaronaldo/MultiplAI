import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorFallbackProps {
  error: Error | null;
  onRetry?: () => void;
  compact?: boolean;
}

export function ErrorFallback({ error, onRetry, compact = false }: ErrorFallbackProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
        <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
        <p className="text-sm text-red-400 flex-1 truncate">
          {error?.message || "Something went wrong"}
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 hover:bg-red-500/20 rounded"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] p-8 text-center">
      <div className="w-16 h-16 mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
        <AlertTriangle className="w-8 h-8 text-red-400" />
      </div>

      <h2 className="text-xl font-semibold text-slate-200 mb-2">Something went wrong</h2>

      {error?.message && (
        <p className="text-sm text-slate-400 mb-6 max-w-md">{error.message}</p>
      )}

      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Try Again
        </button>
      )}

      {error?.stack && (
        <details className="mt-6 text-left w-full max-w-2xl">
          <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400">
            Technical details
          </summary>
          <pre className="mt-2 p-4 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-500 overflow-auto max-h-48">
            {error.stack}
          </pre>
        </details>
      )}
    </div>
  );
}
