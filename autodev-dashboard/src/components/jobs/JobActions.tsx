import React from "react";
import { Play, Square, RefreshCw, Loader2 } from "lucide-react";
import type { JobStatus } from "../../types/api";

interface JobActionsProps {
  jobId: string;
  status: JobStatus;
  onStart: () => Promise<void>;
  onCancel: () => Promise<void>;
  onRefresh: () => Promise<void>;
  isLoading?: boolean;
}

export function JobActions({
  status,
  onStart,
  onCancel,
  onRefresh,
  isLoading = false
}: JobActionsProps) {
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);

  const handleAction = async (action: string, fn: () => Promise<void>) => {
    setActionLoading(action);
    try {
      await fn();
    } finally {
      setActionLoading(null);
    }
  };

  const canStart = status === "queued";
  const canCancel = status === "running" || status === "queued";
  const isRunning = status === "running";

  return (
    <div className="flex items-center gap-2">
      {/* Start button */}
      {canStart && (
        <button
          onClick={() => handleAction("start", onStart)}
          disabled={isLoading || actionLoading !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {actionLoading === "start" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          Start
        </button>
      )}

      {/* Cancel button */}
      {canCancel && (
        <button
          onClick={() => handleAction("cancel", onCancel)}
          disabled={isLoading || actionLoading !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm rounded-lg font-medium border border-red-600/30 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {actionLoading === "cancel" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Square className="w-4 h-4" />
          )}
          Cancel
        </button>
      )}

      {/* Refresh button */}
      <button
        onClick={() => handleAction("refresh", onRefresh)}
        disabled={isLoading || actionLoading !== null}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        title="Refresh job status"
      >
        {actionLoading === "refresh" || isRunning ? (
          <Loader2 className={`w-4 h-4 ${isRunning ? "animate-spin" : ""}`} />
        ) : (
          <RefreshCw className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}

export default JobActions;
