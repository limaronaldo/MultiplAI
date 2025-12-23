/**
 * TaskProgressPanel Component
 * Replit-style progress display showing current phase and steps
 *
 * Shows:
 * - Current agent working
 * - Progress percentage
 * - Completed/pending steps
 * - File operations
 */

import { useMemo } from "react";
import {
  Loader2,
  CheckCircle,
  Circle,
  FileText,
  Code,
  TestTube,
  Wrench,
  Eye,
  GitBranch,
  Zap,
  Brain,
  RefreshCw,
} from "lucide-react";
import clsx from "clsx";

// Task phases in order
const PHASES = [
  { id: "planning", label: "Analyze requirements", icon: Brain },
  { id: "coding", label: "Generate code", icon: Code },
  { id: "testing", label: "Run tests", icon: TestTube },
  { id: "reviewing", label: "Review changes", icon: Eye },
  { id: "pr", label: "Create pull request", icon: GitBranch },
] as const;

type PhaseId = (typeof PHASES)[number]["id"];

interface TaskProgressPanelProps {
  status: string;
  currentAgent?: string;
  plan?: string[];
  completedSteps?: number;
  totalSteps?: number;
  modifiedFiles?: string[];
  isProcessing?: boolean;
}

// Map task status to phase
function getPhaseFromStatus(status: string): PhaseId | null {
  const statusUpper = status.toUpperCase();

  if (statusUpper.includes("PLANNING") || statusUpper === "NEW") {
    return "planning";
  }
  if (
    statusUpper.includes("CODING") ||
    statusUpper.includes("FIXING") ||
    statusUpper.includes("BREAKING") ||
    statusUpper.includes("ORCHESTRAT")
  ) {
    return "coding";
  }
  if (statusUpper.includes("TEST") || statusUpper.includes("VISUAL")) {
    return "testing";
  }
  if (statusUpper.includes("REVIEW")) {
    return "reviewing";
  }
  if (
    statusUpper.includes("PR") ||
    statusUpper.includes("WAITING") ||
    statusUpper === "COMPLETED"
  ) {
    return "pr";
  }
  return null;
}

// Get completed phases based on current phase
function getCompletedPhases(currentPhase: PhaseId | null): Set<PhaseId> {
  const completed = new Set<PhaseId>();
  if (!currentPhase) return completed;

  for (const phase of PHASES) {
    if (phase.id === currentPhase) break;
    completed.add(phase.id);
  }
  return completed;
}

// Calculate overall progress percentage
function calculateProgress(
  status: string,
  completedSteps?: number,
  totalSteps?: number,
): number {
  // If we have step info, use it for granular progress
  if (completedSteps !== undefined && totalSteps && totalSteps > 0) {
    return Math.round((completedSteps / totalSteps) * 100);
  }

  // Otherwise, estimate based on status
  const statusUpper = status.toUpperCase();

  if (statusUpper === "NEW") return 0;
  if (statusUpper.includes("PLANNING")) return 15;
  if (
    statusUpper === "PLANNING_DONE" ||
    statusUpper === "PLAN_PENDING_APPROVAL"
  )
    return 20;
  if (statusUpper.includes("BREAKING")) return 25;
  if (statusUpper.includes("CODING")) return 40;
  if (statusUpper === "CODING_DONE") return 50;
  if (statusUpper.includes("TEST")) return 60;
  if (statusUpper === "TESTS_PASSED") return 70;
  if (statusUpper.includes("REVIEW")) return 80;
  if (statusUpper === "REVIEW_APPROVED") return 90;
  if (statusUpper.includes("PR") || statusUpper.includes("WAITING")) return 95;
  if (statusUpper === "COMPLETED") return 100;
  if (statusUpper === "FAILED") return 0;

  return 50; // Default for unknown states
}

// Get agent display name
function formatAgentName(agent?: string): string {
  if (!agent) return "AutoDev";

  const agentMap: Record<string, string> = {
    planner: "PlannerAgent",
    coder: "CoderAgent",
    fixer: "FixerAgent",
    reviewer: "ReviewerAgent",
    orchestrator: "Orchestrator",
    breakdown: "BreakdownAgent",
  };

  return agentMap[agent.toLowerCase()] || agent;
}

export function TaskProgressPanel({
  status,
  currentAgent,
  plan,
  completedSteps,
  totalSteps,
  modifiedFiles = [],
  isProcessing = false,
}: TaskProgressPanelProps) {
  const currentPhase = useMemo(() => getPhaseFromStatus(status), [status]);
  const completedPhases = useMemo(
    () => getCompletedPhases(currentPhase),
    [currentPhase],
  );
  const progress = useMemo(
    () => calculateProgress(status, completedSteps, totalSteps),
    [status, completedSteps, totalSteps],
  );

  const isTerminal = status === "COMPLETED" || status === "FAILED";
  const isActive = isProcessing && !isTerminal;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Header with progress */}
      <div className="px-5 py-4 border-b border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {isActive ? (
              <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
            ) : status === "COMPLETED" ? (
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            ) : (
              <Zap className="w-5 h-5 text-slate-400" />
            )}
            <h3 className="font-semibold text-white">Progress</h3>
          </div>

          <div className="flex items-center gap-2">
            {isActive && currentAgent && (
              <span className="text-xs text-slate-400">
                {formatAgentName(currentAgent)} working...
              </span>
            )}
            <span
              className={clsx(
                "text-sm font-medium",
                progress === 100 ? "text-emerald-400" : "text-blue-400",
              )}
            >
              {progress}%
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={clsx(
              "h-full rounded-full transition-all duration-500",
              progress === 100
                ? "bg-emerald-500"
                : "bg-gradient-to-r from-blue-500 to-purple-500",
              isActive && "animate-pulse",
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Phase steps */}
      <div className="px-5 py-4 space-y-3">
        {PHASES.map((phase) => {
          const Icon = phase.icon;
          const isCompleted = completedPhases.has(phase.id);
          const isCurrent = currentPhase === phase.id;
          const isPending = !isCompleted && !isCurrent;

          return (
            <div
              key={phase.id}
              className={clsx(
                "flex items-center gap-3",
                isPending && "opacity-50",
              )}
            >
              {/* Status indicator */}
              <div
                className={clsx(
                  "flex items-center justify-center w-6 h-6 rounded-full",
                  isCompleted && "bg-emerald-500/20",
                  isCurrent && "bg-blue-500/20",
                  isPending && "bg-slate-800",
                )}
              >
                {isCompleted ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                ) : isCurrent && isActive ? (
                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                ) : isCurrent ? (
                  <RefreshCw className="w-4 h-4 text-blue-400" />
                ) : (
                  <Circle className="w-4 h-4 text-slate-600" />
                )}
              </div>

              {/* Phase info */}
              <div className="flex items-center gap-2 flex-1">
                <Icon
                  className={clsx(
                    "w-4 h-4",
                    isCompleted && "text-emerald-400",
                    isCurrent && "text-blue-400",
                    isPending && "text-slate-500",
                  )}
                />
                <span
                  className={clsx(
                    "text-sm",
                    isCompleted && "text-slate-300",
                    isCurrent && "text-white font-medium",
                    isPending && "text-slate-500",
                  )}
                >
                  {phase.label}
                </span>
              </div>

              {/* Current indicator */}
              {isCurrent && isActive && (
                <span className="text-xs text-blue-400 animate-pulse">
                  In progress
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Modified files (if any) */}
      {modifiedFiles && modifiedFiles.length > 0 && (
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-800/30">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
            <FileText className="w-3 h-3" />
            <span>Modified files ({modifiedFiles.length})</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {modifiedFiles.slice(0, 5).map((file, i) => (
              <span
                key={i}
                className="px-2 py-0.5 text-xs font-mono bg-slate-800 text-slate-400 rounded"
              >
                {file.split("/").pop()}
              </span>
            ))}
            {modifiedFiles.length > 5 && (
              <span className="px-2 py-0.5 text-xs text-slate-500">
                +{modifiedFiles.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
