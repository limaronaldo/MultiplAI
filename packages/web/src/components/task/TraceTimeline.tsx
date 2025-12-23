/**
 * TraceTimeline - Visualizes agent execution traces for a task
 *
 * Inspired by OpenAI's Traces dashboard, showing:
 * - Timeline of agent executions
 * - Token usage and cost per agent
 * - Gate validation results
 * - Error details
 * - Duration breakdown
 */

import { useState, useEffect } from "react";
import {
  Clock,
  Coins,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Brain,
  Code,
  Wrench,
  Shield,
  GitBranch,
  Zap,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface Trace {
  id: string;
  taskId: string;
  agentName: string;
  parentTraceId?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  status: "running" | "completed" | "failed" | "skipped";
  modelId?: string;
  inputSummary?: Record<string, unknown>;
  outputSummary?: Record<string, unknown>;
  errorType?: string;
  errorMessage?: string;
  gateName?: string;
  gatePassed?: boolean;
  gateMissingArtifacts?: string[];
}

interface TraceTree {
  trace: Trace;
  children: TraceTree[];
  depth: number;
}

interface TraceStats {
  traceCount: number;
  totalDurationMs: number;
  totalTokens: number;
  totalCostUsd: number;
  failedCount: number;
  gateFailures: number;
  agentsUsed: string[];
  modelsUsed: string[];
}

interface TraceTimelineProps {
  taskId: string;
  compact?: boolean;
}

const AGENT_ICONS: Record<string, typeof Brain> = {
  planner: Brain,
  coder: Code,
  fixer: Wrench,
  reviewer: Shield,
  orchestrator: GitBranch,
  gate_validator: Zap,
};

const AGENT_COLORS: Record<string, string> = {
  planner: "text-purple-400 bg-purple-500/10 border-purple-500/30",
  coder: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  fixer: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  reviewer: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  orchestrator: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
  gate_validator: "text-pink-400 bg-pink-500/10 border-pink-500/30",
};

const STATUS_COLORS: Record<string, string> = {
  running: "text-blue-400",
  completed: "text-emerald-400",
  failed: "text-red-400",
  skipped: "text-slate-400",
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${(usd * 100).toFixed(2)}¢`;
  return `$${usd.toFixed(3)}`;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function TraceNode({ node, isLast }: { node: TraceTree; isLast: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const { trace, children, depth } = node;
  const Icon = AGENT_ICONS[trace.agentName] || Brain;
  const colorClass = AGENT_COLORS[trace.agentName] || AGENT_COLORS.planner;
  const statusColor = STATUS_COLORS[trace.status];

  return (
    <div className="relative">
      {/* Connector line */}
      {depth > 0 && (
        <div
          className={`absolute left-3 top-0 w-px bg-slate-700 ${isLast ? "h-6" : "h-full"}`}
          style={{ marginLeft: (depth - 1) * 24 }}
        />
      )}

      <div
        className={`flex items-start gap-3 py-2 ${depth > 0 ? "ml-6" : ""}`}
        style={{ marginLeft: depth * 24 }}
      >
        {/* Timeline dot */}
        <div className={`relative z-10 p-1.5 rounded-lg border ${colorClass}`}>
          <Icon className="w-4 h-4" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Agent name */}
            <span className="font-medium text-white capitalize">
              {trace.agentName.replace("_", " ")}
            </span>

            {/* Status badge */}
            <span className={`text-xs px-1.5 py-0.5 rounded ${statusColor}`}>
              {trace.status}
            </span>

            {/* Gate badge */}
            {trace.gateName && (
              <span
                className={`text-xs px-1.5 py-0.5 rounded flex items-center gap-1 ${
                  trace.gatePassed
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-red-500/10 text-red-400"
                }`}
              >
                {trace.gatePassed ? (
                  <CheckCircle className="w-3 h-3" />
                ) : (
                  <XCircle className="w-3 h-3" />
                )}
                {trace.gateName.replace("_", " ")}
              </span>
            )}

            {/* Model */}
            {trace.modelId && (
              <span className="text-xs text-slate-500">{trace.modelId}</span>
            )}
          </div>

          {/* Metrics row */}
          <div className="flex items-center gap-4 mt-1 text-xs text-slate-400">
            {/* Time */}
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTime(trace.startedAt)}
            </span>

            {/* Duration */}
            {trace.durationMs !== undefined && (
              <span>{formatDuration(trace.durationMs)}</span>
            )}

            {/* Tokens */}
            {trace.totalTokens > 0 && (
              <span>{trace.totalTokens.toLocaleString()} tokens</span>
            )}

            {/* Cost */}
            {trace.costUsd > 0 && (
              <span className="flex items-center gap-1">
                <Coins className="w-3 h-3" />
                {formatCost(trace.costUsd)}
              </span>
            )}
          </div>

          {/* Error message */}
          {trace.errorMessage && (
            <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-400">
              <div className="font-medium">{trace.errorType}</div>
              <div className="text-red-300">{trace.errorMessage}</div>
            </div>
          )}

          {/* Gate failures */}
          {trace.gateMissingArtifacts && trace.gateMissingArtifacts.length > 0 && (
            <div className="mt-2 p-2 rounded bg-amber-500/10 border border-amber-500/30 text-xs text-amber-400">
              <div className="font-medium flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Missing artifacts
              </div>
              <ul className="mt-1 list-disc list-inside text-amber-300">
                {trace.gateMissingArtifacts.map((artifact) => (
                  <li key={artifact}>{artifact}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Output summary (expandable) */}
          {trace.outputSummary && Object.keys(trace.outputSummary).length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-2 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
            >
              {expanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              Output details
            </button>
          )}

          {expanded && trace.outputSummary && (
            <div className="mt-1 p-2 rounded bg-slate-800/50 text-xs text-slate-400">
              {Object.entries(trace.outputSummary).map(([key, value]) => (
                <div key={key} className="flex gap-2">
                  <span className="text-slate-500">{key}:</span>
                  <span>{String(value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Children */}
      {children.map((child, idx) => (
        <TraceNode
          key={child.trace.id}
          node={child}
          isLast={idx === children.length - 1}
        />
      ))}
    </div>
  );
}

export function TraceTimeline({ taskId, compact = false }: TraceTimelineProps) {
  const [tree, setTree] = useState<TraceTree[]>([]);
  const [stats, setStats] = useState<TraceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTraces() {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE}/api/tasks/${taskId}/traces/tree`);
        if (!res.ok) throw new Error("Failed to fetch traces");
        const data = await res.json();
        setTree(data.tree || []);
        setStats(data.stats);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchTraces();
  }, [taskId]);

  if (loading) {
    return (
      <div className="p-4 text-slate-500 text-center">
        <div className="animate-pulse">Loading traces...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-400 text-center">
        <AlertTriangle className="w-5 h-5 mx-auto mb-2" />
        {error}
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="p-4 text-slate-500 text-center">
        No traces recorded yet
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats summary */}
      {stats && !compact && (
        <div className="grid grid-cols-4 gap-3 p-3 bg-slate-800/50 rounded-lg">
          <div className="text-center">
            <div className="text-2xl font-bold text-white">{stats.traceCount}</div>
            <div className="text-xs text-slate-500">Traces</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-white">
              {formatDuration(stats.totalDurationMs)}
            </div>
            <div className="text-xs text-slate-500">Duration</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-white">
              {stats.totalTokens.toLocaleString()}
            </div>
            <div className="text-xs text-slate-500">Tokens</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-white">
              {formatCost(stats.totalCostUsd)}
            </div>
            <div className="text-xs text-slate-500">Cost</div>
          </div>
        </div>
      )}

      {/* Failure summary */}
      {stats && (stats.failedCount > 0 || stats.gateFailures > 0) && (
        <div className="flex items-center gap-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm">
          {stats.failedCount > 0 && (
            <span className="flex items-center gap-1 text-red-400">
              <XCircle className="w-4 h-4" />
              {stats.failedCount} failed
            </span>
          )}
          {stats.gateFailures > 0 && (
            <span className="flex items-center gap-1 text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              {stats.gateFailures} gate failures
            </span>
          )}
        </div>
      )}

      {/* Trace tree */}
      <div className="space-y-1">
        {tree.map((node, idx) => (
          <TraceNode key={node.trace.id} node={node} isLast={idx === tree.length - 1} />
        ))}
      </div>

      {/* Models used */}
      {stats && stats.modelsUsed.length > 0 && !compact && (
        <div className="text-xs text-slate-500">
          Models: {stats.modelsUsed.join(", ")}
        </div>
      )}
    </div>
  );
}

export default TraceTimeline;
