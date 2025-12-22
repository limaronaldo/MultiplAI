import { observer } from "mobx-react-lite";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  Wifi,
  WifiOff,
  X,
  Bot,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Zap,
  FileCode,
  GitPullRequest,
  Microscope,
  TestTube,
  Cog,
} from "lucide-react";
import { useTaskStore, type LiveEvent } from "@/stores";
import { useMemo } from "react";

// Map event types to icons
function getEventIcon(eventType: string): React.ReactNode {
  const iconClass = "w-3.5 h-3.5";
  switch (eventType) {
    case "PLANNING":
    case "PLANNING_DONE":
      return <Microscope className={iconClass} />;
    case "CODING":
    case "CODING_DONE":
      return <FileCode className={iconClass} />;
    case "TESTING":
    case "TESTS_PASSED":
    case "TESTS_FAILED":
      return <TestTube className={iconClass} />;
    case "REVIEWING":
    case "REVIEW_APPROVED":
    case "REVIEW_REJECTED":
      return <Microscope className={iconClass} />;
    case "PR_CREATED":
      return <GitPullRequest className={iconClass} />;
    case "FIXING":
      return <RefreshCw className={iconClass} />;
    case "COMPLETED":
      return <CheckCircle2 className={iconClass} />;
    case "FAILED":
      return <XCircle className={iconClass} />;
    default:
      return <Cog className={iconClass} />;
  }
}

function getLevelColor(level: LiveEvent["level"]): string {
  switch (level) {
    case "success":
      return "text-emerald-400";
    case "error":
      return "text-red-400";
    case "warn":
      return "text-amber-400";
    default:
      return "text-slate-400";
  }
}

function getLevelBg(level: LiveEvent["level"]): string {
  switch (level) {
    case "success":
      return "bg-emerald-500/10 border-l-2 border-emerald-500";
    case "error":
      return "bg-red-500/10 border-l-2 border-red-500";
    case "warn":
      return "bg-amber-500/10 border-l-2 border-amber-500";
    default:
      return "bg-slate-800/50 border-l-2 border-slate-700";
  }
}

// Get agent display info
function getAgentInfo(agent?: string): { name: string; color: string } | null {
  if (!agent) return null;

  const agentMap: Record<string, { name: string; color: string }> = {
    PlannerAgent: {
      name: "Planner",
      color: "text-purple-400 bg-purple-500/10",
    },
    CoderAgent: { name: "Coder", color: "text-blue-400 bg-blue-500/10" },
    FixerAgent: { name: "Fixer", color: "text-orange-400 bg-orange-500/10" },
    ReviewerAgent: { name: "Reviewer", color: "text-cyan-400 bg-cyan-500/10" },
    ValidatorAgent: {
      name: "Validator",
      color: "text-green-400 bg-green-500/10",
    },
    OrchestratorAgent: {
      name: "Orchestrator",
      color: "text-pink-400 bg-pink-500/10",
    },
    BreakdownAgent: {
      name: "Breakdown",
      color: "text-indigo-400 bg-indigo-500/10",
    },
  };

  return (
    agentMap[agent] || { name: agent, color: "text-slate-400 bg-slate-500/10" }
  );
}

// Progress metrics derived from events
interface ProgressMetrics {
  currentAgent: string | null;
  phase: string;
  phasesCompleted: number;
  totalPhases: number;
  isActive: boolean;
  lastEventTime: Date | null;
}

function deriveProgressMetrics(events: LiveEvent[]): ProgressMetrics {
  const phaseOrder = [
    "PLANNING",
    "PLANNING_DONE",
    "CODING",
    "CODING_DONE",
    "TESTING",
    "TESTS_PASSED",
    "REVIEWING",
    "REVIEW_APPROVED",
    "PR_CREATED",
    "COMPLETED",
  ];

  if (events.length === 0) {
    return {
      currentAgent: null,
      phase: "Idle",
      phasesCompleted: 0,
      totalPhases: 5,
      isActive: false,
      lastEventTime: null,
    };
  }

  const latestEvent = events[0];
  const recentEvents = events.slice(0, 50);

  // Find highest phase reached
  let highestPhaseIndex = -1;
  for (const event of recentEvents) {
    const index = phaseOrder.indexOf(event.eventType);
    if (index > highestPhaseIndex) {
      highestPhaseIndex = index;
    }
  }

  // Map phase index to completed count (5 main phases)
  const phasesCompleted = Math.min(Math.floor((highestPhaseIndex + 1) / 2), 5);

  // Determine current phase name
  let phase = "Processing";
  if (latestEvent.eventType.includes("PLANNING")) phase = "Planning";
  else if (latestEvent.eventType.includes("CODING")) phase = "Coding";
  else if (
    latestEvent.eventType.includes("TESTING") ||
    latestEvent.eventType.includes("TESTS")
  )
    phase = "Testing";
  else if (latestEvent.eventType.includes("REVIEW")) phase = "Reviewing";
  else if (latestEvent.eventType.includes("FIX")) phase = "Fixing";
  else if (latestEvent.eventType === "COMPLETED") phase = "Completed";
  else if (latestEvent.eventType === "FAILED") phase = "Failed";
  else if (latestEvent.eventType === "PR_CREATED") phase = "PR Created";

  // Check if actively processing (event within last 30 seconds)
  const lastTime = new Date(latestEvent.timestamp);
  const isActive = Date.now() - lastTime.getTime() < 30000;

  return {
    currentAgent: latestEvent.agent || null,
    phase,
    phasesCompleted,
    totalPhases: 5,
    isActive,
    lastEventTime: lastTime,
  };
}

interface LiveActivityFeedProps {
  maxEvents?: number;
  showClear?: boolean;
  showProgress?: boolean;
  compact?: boolean;
  className?: string;
}

export const LiveActivityFeed = observer(function LiveActivityFeed({
  maxEvents = 10,
  showClear = true,
  showProgress = true,
  compact = false,
  className = "",
}: LiveActivityFeedProps) {
  const taskStore = useTaskStore();
  const { liveEvents, sseConnected } = taskStore;

  const displayEvents = liveEvents.slice(0, maxEvents);

  // Derive progress metrics from events
  const metrics = useMemo(
    () => deriveProgressMetrics(liveEvents),
    [liveEvents],
  );

  return (
    <div
      className={`bg-slate-900 border border-slate-800 rounded-xl ${className}`}
    >
      {/* Header with connection status */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-white">Live Activity</span>
          {!compact && (
            <span className="text-xs text-slate-500">
              ({liveEvents.length} events)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Connection status */}
          <div className="flex items-center gap-1.5">
            {sseConnected ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs text-emerald-400">Live</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-red-400" />
                <span className="text-xs text-red-400">Offline</span>
              </>
            )}
          </div>
          {/* Clear button */}
          {showClear && liveEvents.length > 0 && (
            <button
              onClick={() => taskStore.clearLiveEvents()}
              className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
              title="Clear events"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Progress Panel - Replit Agent style */}
      {showProgress && metrics.isActive && (
        <div className="px-4 py-3 border-b border-slate-800 bg-slate-800/30">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {metrics.isActive && (
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                  <span className="text-xs text-blue-400 font-medium">
                    Processing
                  </span>
                </div>
              )}
              <span className="text-sm text-white font-medium">
                {metrics.phase}
              </span>
            </div>
            <span className="text-xs text-slate-400">
              {metrics.phasesCompleted}/{metrics.totalPhases} phases
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500"
              style={{
                width: `${(metrics.phasesCompleted / metrics.totalPhases) * 100}%`,
              }}
            />
          </div>

          {/* Current agent */}
          {metrics.currentAgent && (
            <div className="flex items-center gap-2 mt-2">
              <Bot className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs text-slate-400">
                {getAgentInfo(metrics.currentAgent)?.name ||
                  metrics.currentAgent}{" "}
                working...
              </span>
              {metrics.lastEventTime && (
                <span className="text-xs text-slate-500">
                  {formatDistanceToNow(metrics.lastEventTime, {
                    addSuffix: true,
                  })}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Events list */}
      <div
        className={compact ? "max-h-40" : "max-h-64"}
        style={{ overflowY: "auto" }}
      >
        {displayEvents.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-500 text-sm">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No recent activity</p>
            <p className="text-xs mt-1">Events will appear here in real-time</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/50">
            {displayEvents.map((event, index) => {
              const agentInfo = getAgentInfo(event.agent);
              const isLatest = index === 0;

              return (
                <div
                  key={event.id}
                  className={`px-4 py-2.5 ${getLevelBg(event.level)} transition-colors ${
                    isLatest ? "bg-opacity-100" : "bg-opacity-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {/* Event type icon */}
                        <span className={getLevelColor(event.level)}>
                          {getEventIcon(event.eventType)}
                        </span>

                        {/* Agent badge */}
                        {agentInfo && (
                          <span
                            className={`text-xs font-medium px-1.5 py-0.5 rounded ${agentInfo.color}`}
                          >
                            {agentInfo.name}
                          </span>
                        )}

                        {/* Event type */}
                        <span
                          className={`text-xs font-mono ${getLevelColor(event.level)}`}
                        >
                          {event.eventType}
                        </span>

                        {/* Latest indicator */}
                        {isLatest && metrics.isActive && (
                          <Zap className="w-3 h-3 text-yellow-400 animate-pulse" />
                        )}
                      </div>

                      {/* Message */}
                      {!compact && (
                        <p className="text-sm text-slate-300 mt-0.5 truncate">
                          {event.message}
                        </p>
                      )}
                    </div>

                    {/* Timestamp */}
                    <span className="text-xs text-slate-500 whitespace-nowrap flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDistanceToNow(new Date(event.timestamp), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Show more indicator */}
      {liveEvents.length > maxEvents && (
        <div className="px-4 py-2 border-t border-slate-800 text-center">
          <span className="text-xs text-slate-500">
            +{liveEvents.length - maxEvents} more events
          </span>
        </div>
      )}
    </div>
  );
});
