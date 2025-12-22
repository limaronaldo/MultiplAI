/**
 * CheckpointTimeline Component
 * Replit-style checkpoint display with rollback capability
 *
 * Shows task phases as timeline with costs and timestamps.
 * Each checkpoint can be rolled back to.
 */

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { useTheme } from "../../contexts/ThemeContext";
import {
  History,
  FileText,
  Code,
  TestTube,
  Wrench,
  CheckCircle,
  XCircle,
  Eye,
  DollarSign,
  Clock,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import clsx from "clsx";

// Types matching backend checkpoint types
export interface CheckpointEffort {
  tokensUsed: number;
  costUsd: number;
  durationMs: number;
}

export interface CheckpointSummary {
  id: string;
  sequence: number;
  phase: string;
  description?: string;
  createdAt: string;
  effort?: CheckpointEffort;
}

export interface EffortSummary {
  totalTokens: number;
  totalCost: number;
  totalDuration: number;
  checkpointCount: number;
  byPhase: Record<string, {
    tokens: number;
    cost: number;
    duration: number;
    count: number;
  }>;
}

interface CheckpointTimelineProps {
  taskId: string;
  checkpoints: CheckpointSummary[];
  effortSummary?: EffortSummary;
  currentPhase?: string;
  onRollback?: (checkpointId: string) => Promise<void>;
  isLoading?: boolean;
}

// Phase icons and colors
const PHASE_CONFIG: Record<string, {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
}> = {
  planning: {
    icon: FileText,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    label: "Planning Complete",
  },
  coding: {
    icon: Code,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/30",
    label: "Coding Complete",
  },
  testing: {
    icon: TestTube,
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/30",
    label: "Tests Passed",
  },
  fixing: {
    icon: Wrench,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/30",
    label: "Fix Applied",
  },
  reviewing: {
    icon: Eye,
    color: "text-indigo-500",
    bgColor: "bg-indigo-500/10",
    borderColor: "border-indigo-500/30",
    label: "Review Complete",
  },
  completed: {
    icon: CheckCircle,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    label: "Completed",
  },
  failed: {
    icon: XCircle,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
    label: "Failed",
  },
};

function getPhaseConfig(phase: string) {
  return PHASE_CONFIG[phase] || PHASE_CONFIG.planning;
}

function formatCost(costUsd: number): string {
  if (costUsd < 0.01) return "<$0.01";
  return `$${costUsd.toFixed(2)}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1000000).toFixed(2)}M`;
}

export function CheckpointTimeline({
  taskId,
  checkpoints,
  effortSummary,
  currentPhase,
  onRollback,
  isLoading = false,
}: CheckpointTimelineProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [expanded, setExpanded] = useState(true);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [confirmRollback, setConfirmRollback] = useState<string | null>(null);

  const handleRollback = async (checkpointId: string) => {
    if (!onRollback) return;

    setRollingBack(checkpointId);
    try {
      await onRollback(checkpointId);
    } finally {
      setRollingBack(null);
      setConfirmRollback(null);
    }
  };

  if (isLoading) {
    return (
      <div className={clsx(
        "rounded-xl border p-5",
        isDark ? "bg-slate-900 border-slate-800" : "bg-white border-gray-200"
      )}>
        <div className="flex items-center justify-center py-8">
          <Loader2 className={clsx("w-6 h-6 animate-spin", isDark ? "text-slate-400" : "text-gray-400")} />
          <span className={clsx("ml-2", isDark ? "text-slate-400" : "text-gray-500")}>
            Loading checkpoints...
          </span>
        </div>
      </div>
    );
  }

  if (checkpoints.length === 0) {
    return (
      <div className={clsx(
        "rounded-xl border p-5",
        isDark ? "bg-slate-900 border-slate-800" : "bg-white border-gray-200"
      )}>
        <div className="flex items-center gap-2 mb-3">
          <History className={clsx("w-5 h-5", isDark ? "text-slate-400" : "text-gray-400")} />
          <h3 className={clsx("font-semibold", isDark ? "text-slate-200" : "text-gray-800")}>
            Checkpoints
          </h3>
        </div>
        <p className={clsx("text-sm", isDark ? "text-slate-500" : "text-gray-500")}>
          No checkpoints yet. Checkpoints are created after each phase completes.
        </p>
      </div>
    );
  }

  return (
    <div className={clsx(
      "rounded-xl border",
      isDark ? "bg-slate-900 border-slate-800" : "bg-white border-gray-200"
    )}>
      {/* Header */}
      <div
        className={clsx(
          "flex items-center justify-between p-5 cursor-pointer",
          isDark ? "hover:bg-slate-800/50" : "hover:bg-gray-50"
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <History className={clsx("w-5 h-5", isDark ? "text-slate-400" : "text-gray-400")} />
          <h3 className={clsx("font-semibold", isDark ? "text-slate-200" : "text-gray-800")}>
            Checkpoints
          </h3>
          <span className={clsx(
            "px-2 py-0.5 text-xs rounded-full",
            isDark ? "bg-slate-800 text-slate-400" : "bg-gray-100 text-gray-600"
          )}>
            {checkpoints.length}
          </span>
        </div>

        <div className="flex items-center gap-4">
          {/* Total cost badge */}
          {effortSummary && effortSummary.totalCost > 0 && (
            <div className={clsx(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm",
              isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600"
            )}>
              <DollarSign className="w-3.5 h-3.5" />
              <span className="font-medium">{formatCost(effortSummary.totalCost)}</span>
            </div>
          )}

          {expanded ? (
            <ChevronUp className={clsx("w-5 h-5", isDark ? "text-slate-400" : "text-gray-400")} />
          ) : (
            <ChevronDown className={clsx("w-5 h-5", isDark ? "text-slate-400" : "text-gray-400")} />
          )}
        </div>
      </div>

      {/* Timeline content */}
      {expanded && (
        <div className={clsx("px-5 pb-5", isDark ? "border-t border-slate-800" : "border-t border-gray-100")}>
          <div className="relative pt-4">
            {/* Vertical line */}
            <div className={clsx(
              "absolute left-[11px] top-6 bottom-4 w-0.5",
              isDark ? "bg-slate-700" : "bg-gray-200"
            )} />

            {/* Checkpoint items */}
            <div className="space-y-4">
              {checkpoints.map((checkpoint, index) => {
                const config = getPhaseConfig(checkpoint.phase);
                const Icon = config.icon;
                const isLatest = index === checkpoints.length - 1;
                const isCurrent = checkpoint.phase === currentPhase;

                return (
                  <div key={checkpoint.id} className="relative flex items-start gap-4">
                    {/* Timeline dot */}
                    <div className={clsx(
                      "relative z-10 flex items-center justify-center w-6 h-6 rounded-full border-2",
                      config.bgColor,
                      config.borderColor,
                      isLatest && "ring-2 ring-offset-2",
                      isLatest && (isDark ? "ring-slate-700 ring-offset-slate-900" : "ring-gray-200 ring-offset-white")
                    )}>
                      {isLatest ? (
                        <div className={clsx("w-2 h-2 rounded-full", config.color.replace("text-", "bg-"))} />
                      ) : (
                        <div className={clsx("w-1.5 h-1.5 rounded-full", isDark ? "bg-slate-500" : "bg-gray-400")} />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Icon className={clsx("w-4 h-4", config.color)} />
                          <span className={clsx(
                            "font-medium",
                            isDark ? "text-slate-200" : "text-gray-800"
                          )}>
                            {checkpoint.description || config.label}
                          </span>
                          {isCurrent && (
                            <span className={clsx(
                              "px-1.5 py-0.5 text-xs rounded",
                              isDark ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-600"
                            )}>
                              Current
                            </span>
                          )}
                        </div>

                        {/* Rollback button (not on latest) */}
                        {!isLatest && onRollback && (
                          <div className="flex items-center gap-2">
                            {confirmRollback === checkpoint.id ? (
                              <>
                                <button
                                  onClick={() => handleRollback(checkpoint.id)}
                                  disabled={rollingBack !== null}
                                  className={clsx(
                                    "px-2 py-1 text-xs rounded font-medium transition-colors",
                                    isDark
                                      ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                                      : "bg-red-100 text-red-600 hover:bg-red-200"
                                  )}
                                >
                                  {rollingBack === checkpoint.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    "Confirm"
                                  )}
                                </button>
                                <button
                                  onClick={() => setConfirmRollback(null)}
                                  className={clsx(
                                    "px-2 py-1 text-xs rounded font-medium transition-colors",
                                    isDark
                                      ? "bg-slate-700 text-slate-300 hover:bg-slate-600"
                                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                  )}
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => setConfirmRollback(checkpoint.id)}
                                className={clsx(
                                  "flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors",
                                  isDark
                                    ? "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                                )}
                                title="Rollback to this checkpoint"
                              >
                                <RotateCcw className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Metadata row */}
                      <div className={clsx(
                        "flex items-center gap-4 mt-1 text-xs",
                        isDark ? "text-slate-500" : "text-gray-500"
                      )}>
                        <span>{format(parseISO(checkpoint.createdAt), "h:mm a")}</span>

                        {checkpoint.effort && (
                          <>
                            <span className="flex items-center gap-1">
                              <DollarSign className="w-3 h-3" />
                              {formatCost(checkpoint.effort.costUsd)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDuration(checkpoint.effort.durationMs)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Summary footer */}
          {effortSummary && (
            <div className={clsx(
              "mt-4 pt-4 flex items-center justify-between text-sm",
              isDark ? "border-t border-slate-800" : "border-t border-gray-100"
            )}>
              <div className={clsx("flex items-center gap-4", isDark ? "text-slate-400" : "text-gray-500")}>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  Total: {formatDuration(effortSummary.totalDuration)}
                </span>
                <span className="flex items-center gap-1">
                  Tokens: {formatTokens(effortSummary.totalTokens)}
                </span>
              </div>
              <div className={clsx(
                "font-medium",
                isDark ? "text-emerald-400" : "text-emerald-600"
              )}>
                Total: {formatCost(effortSummary.totalCost)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Compact version for dashboard widgets
export function CheckpointTimelineCompact({
  checkpoints,
  effortSummary,
}: {
  checkpoints: CheckpointSummary[];
  effortSummary?: EffortSummary;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  if (checkpoints.length === 0) {
    return (
      <div className={clsx(
        "text-sm",
        isDark ? "text-slate-500" : "text-gray-500"
      )}>
        No checkpoints
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* Phase dots */}
      <div className="flex items-center gap-1">
        {checkpoints.slice(-5).map((cp, i) => {
          const config = getPhaseConfig(cp.phase);
          return (
            <div
              key={cp.id}
              className={clsx(
                "w-2 h-2 rounded-full",
                config.color.replace("text-", "bg-")
              )}
              title={`${config.label} - ${format(parseISO(cp.createdAt), "h:mm a")}`}
            />
          );
        })}
      </div>

      {/* Cost */}
      {effortSummary && (
        <span className={clsx(
          "text-xs font-medium",
          isDark ? "text-emerald-400" : "text-emerald-600"
        )}>
          {formatCost(effortSummary.totalCost)}
        </span>
      )}
    </div>
  );
}
