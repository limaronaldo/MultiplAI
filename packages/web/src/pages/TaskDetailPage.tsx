import { useEffect, useState, useCallback } from "react";
import { observer } from "mobx-react-lite";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ExternalLink,
  GitBranch,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Play,
  FileCode,
  MessageSquare,
  Loader2,
  Wifi,
  WifiOff,
} from "lucide-react";
import clsx from "clsx";
import { DiffViewer } from "../components/diff/DiffViewer";
import { TaskChat } from "../components/chat";
import {
  CheckpointTimeline,
  TaskProgressPanel,
  VisualTestPanel,
  type CheckpointSummary,
  type EffortSummary,
} from "../components/task";
import { PlanReviewPanel } from "../components/plans";
import { sseService, type SSEEvent } from "@/services/sse.service";

const API_BASE = import.meta.env.VITE_API_URL || "";

// Helper to safely format dates
function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return "Just now";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "Just now";
    return date.toLocaleString();
  } catch {
    return "Just now";
  }
}

interface Task {
  id: string;
  githubRepo: string;
  githubIssueNumber: number;
  githubIssueTitle: string;
  githubIssueBody: string;
  status: string;
  branchName?: string;
  currentDiff?: string;
  commitMessage?: string;
  prNumber?: number;
  prUrl?: string;
  prTitle?: string;
  definitionOfDone?: string[];
  plan?: string[];
  targetFiles?: string[];
  estimatedComplexity?: string;
  estimatedEffort?: string;
  attemptCount: number;
  maxAttempts: number;
  lastError?: string;
  linearIssueId?: string;
  createdAt: string;
  updatedAt: string;
}

interface TaskEvent {
  id: string;
  task_id: string;
  event_type: string;
  agent?: string;
  input_summary?: string;
  output_summary?: string;
  tokens_used?: number;
  duration_ms?: number;
  metadata?: Record<string, unknown>;
  created_at: string;
}

const statusConfig: Record<
  string,
  { icon: typeof Clock; color: string; bg: string; label: string }
> = {
  NEW: {
    icon: Clock,
    color: "text-slate-400",
    bg: "bg-slate-500/10",
    label: "New",
  },
  PLANNING: {
    icon: Loader2,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    label: "Planning",
  },
  PLANNING_DONE: {
    icon: CheckCircle,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    label: "Planned",
  },
  CODING: {
    icon: Loader2,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    label: "Coding",
  },
  CODING_DONE: {
    icon: CheckCircle,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    label: "Coded",
  },
  TESTING: {
    icon: Loader2,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    label: "Testing",
  },
  TESTS_PASSED: {
    icon: CheckCircle,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    label: "Tests Passed",
  },
  TESTS_FAILED: {
    icon: XCircle,
    color: "text-red-400",
    bg: "bg-red-500/10",
    label: "Tests Failed",
  },
  FIXING: {
    icon: Loader2,
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    label: "Fixing",
  },
  REVIEWING: {
    icon: Loader2,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    label: "Reviewing",
  },
  REVIEW_APPROVED: {
    icon: CheckCircle,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    label: "Approved",
  },
  REVIEW_REJECTED: {
    icon: XCircle,
    color: "text-red-400",
    bg: "bg-red-500/10",
    label: "Rejected",
  },
  PR_CREATED: {
    icon: GitBranch,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    label: "PR Created",
  },
  WAITING_HUMAN: {
    icon: Clock,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    label: "Awaiting Review",
  },
  WAITING_BATCH: {
    icon: Clock,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    label: "Awaiting Batch",
  },
  PLAN_PENDING_APPROVAL: {
    icon: FileCode,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    label: "Awaiting Approval",
  },
  COMPLETED: {
    icon: CheckCircle,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    label: "Completed",
  },
  FAILED: {
    icon: XCircle,
    color: "text-red-400",
    bg: "bg-red-500/10",
    label: "Failed",
  },
};

export const TaskDetailPage = observer(function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<Task | null>(null);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);

  // Checkpoint state
  const [checkpoints, setCheckpoints] = useState<CheckpointSummary[]>([]);
  const [effortSummary, setEffortSummary] = useState<
    EffortSummary | undefined
  >();
  const [checkpointsLoading, setCheckpointsLoading] = useState(false);

  // Visual test state
  const [visualTestRun, setVisualTestRun] = useState<any>(null);
  const [visualTestsLoading, setVisualTestsLoading] = useState(false);

  const fetchTask = useCallback(async () => {
    if (!taskId) return;

    try {
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}`);
      if (!res.ok) {
        throw new Error("Task not found");
      }
      const data = await res.json();
      setTask(data.task);
      setEvents(data.events || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load task");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  // Fetch checkpoints for the task
  const fetchCheckpoints = useCallback(async () => {
    if (!taskId) return;
    setCheckpointsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}/checkpoints`);
      if (res.ok) {
        const data = await res.json();
        setCheckpoints(data.checkpoints || []);
        setEffortSummary(data.effortSummary);
      }
    } catch (err) {
      console.error("Failed to fetch checkpoints:", err);
    } finally {
      setCheckpointsLoading(false);
    }
  }, [taskId]);

  // Rollback to a checkpoint
  const handleRollback = useCallback(
    async (checkpointId: string) => {
      if (!taskId) return;

      try {
        const res = await fetch(
          `${API_BASE}/api/tasks/${taskId}/checkpoints/${checkpointId}/rollback`,
          { method: "POST" },
        );
        if (!res.ok) {
          throw new Error("Rollback failed");
        }
        // Refresh task and checkpoints after rollback
        await Promise.all([fetchTask(), fetchCheckpoints()]);
      } catch (err) {
        console.error("Rollback failed:", err);
        throw err;
      }
    },
    [taskId, fetchTask, fetchCheckpoints],
  );

  // Fetch visual test runs for the task
  const fetchVisualTests = useCallback(async () => {
    if (!taskId) return;

    try {
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}/visual-tests`);
      if (res.ok) {
        const data = await res.json();
        // Get the most recent test run
        if (data.runs && data.runs.length > 0) {
          setVisualTestRun(data.runs[0]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch visual tests:", err);
    }
  }, [taskId]);

  // Run visual tests
  const handleRunVisualTests = useCallback(async () => {
    if (!taskId || !task) return;

    setVisualTestsLoading(true);
    try {
      // Default test cases based on task context
      const testCases = [
        {
          id: "smoke-test",
          name: "Smoke Test",
          goal: "Verify the application loads without errors",
          expectedOutcome: "Page loads successfully with no console errors",
        },
      ];

      const res = await fetch(
        `${API_BASE}/api/tasks/${taskId}/run-visual-tests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appUrl: "http://localhost:3000", // Default, could be configured
            testCases,
          }),
        },
      );

      if (res.ok) {
        const data = await res.json();
        setVisualTestRun(data.testRun);
      }
    } catch (err) {
      console.error("Failed to run visual tests:", err);
    } finally {
      setVisualTestsLoading(false);
    }
  }, [taskId, task]);

  // SSE for real-time updates
  useEffect(() => {
    if (!taskId) return;

    const handleSSEEvent = (event: SSEEvent) => {
      if (event.type === "connected") {
        setSseConnected(true);
        return;
      }

      // Only process events for this task
      if (event.type === "event" && event.taskId === taskId) {
        // Add new event to the list
        const newEvent: TaskEvent = {
          id: event.id || Date.now().toString(),
          task_id: taskId,
          event_type: event.eventType || "unknown",
          agent: event.agent,
          output_summary: event.message,
          duration_ms: event.durationMs,
          tokens_used: event.tokensUsed,
          created_at: event.timestamp || new Date().toISOString(),
        };

        setEvents((prev) => [newEvent, ...prev]);

        // Refresh task data to get updated status
        fetchTask();
      }
    };

    const unsubscribe = sseService.subscribe(handleSSEEvent);
    sseService.connect(taskId);
    setSseConnected(sseService.isConnected);

    return () => {
      unsubscribe();
      sseService.disconnect();
      setSseConnected(false);
    };
  }, [taskId, fetchTask]);

  // Initial fetch
  useEffect(() => {
    fetchTask();
    fetchCheckpoints();
    fetchVisualTests();
  }, [fetchTask, fetchCheckpoints, fetchVisualTests]);

  const handleRetry = async () => {
    if (!task) return;
    setProcessing(true);

    try {
      const res = await fetch(`${API_BASE}/api/tasks/${task.id}/process`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to retry");
      await fetchTask();
    } catch (err) {
      console.error("Retry failed:", err);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-slate-800 rounded" />
          <div className="h-48 bg-slate-800 rounded-xl" />
          <div className="h-64 bg-slate-800 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="p-8">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
          <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">
            Task Not Found
          </h2>
          <p className="text-slate-400 mb-4">{error}</p>
          <Link
            to="/tasks"
            className="text-blue-400 hover:text-blue-300 flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Tasks
          </Link>
        </div>
      </div>
    );
  }

  const status = statusConfig[task.status] || statusConfig.NEW;
  const StatusIcon = status.icon;
  const isProcessing = [
    "PLANNING",
    "CODING",
    "TESTING",
    "FIXING",
    "REVIEWING",
  ].includes(task.status);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button
            onClick={() => navigate("/tasks")}
            className="flex items-center gap-2 text-slate-400 hover:text-white mb-3 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Tasks
          </button>
          <h1 className="text-2xl font-bold text-white mb-2">
            {task.githubIssueTitle}
          </h1>
          <div className="flex items-center gap-3 text-sm">
            <a
              href={`https://github.com/${task.githubRepo}/issues/${task.githubIssueNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-blue-400 flex items-center gap-1"
            >
              GitHub #{task.githubIssueNumber}
              <ExternalLink className="w-3 h-3" />
            </a>
            {task.linearIssueId && (
              <>
                <span className="text-slate-600">•</span>
                <a
                  href={`https://linear.app/issue/${task.linearIssueId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-400 hover:text-purple-400 flex items-center gap-1"
                >
                  Linear
                  <ExternalLink className="w-3 h-3" />
                </a>
              </>
            )}
            <span className="text-slate-600">•</span>
            <div
              className={clsx(
                "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
                status.bg,
                status.color,
              )}
            >
              <StatusIcon
                className={clsx("w-3 h-3", isProcessing && "animate-spin")}
              />
              {status.label}
            </div>
            {/* SSE Connection Status */}
            <span className="text-slate-600">•</span>
            <div className="flex items-center gap-1">
              {sseConnected ? (
                <>
                  <Wifi className="w-3 h-3 text-emerald-400" />
                  <span className="text-xs text-emerald-400">Live</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 text-slate-500" />
                  <span className="text-xs text-slate-500">Offline</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {task.prUrl && (
            <a
              href={task.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            >
              <GitBranch className="w-4 h-4" />
              PR #{task.prNumber}
            </a>
          )}
          {(task.status === "FAILED" || task.status === "TESTS_FAILED") && (
            <button
              onClick={handleRetry}
              disabled={processing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {processing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Retry
            </button>
          )}
          <button
            onClick={fetchTask}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* Chat with AI */}
          <TaskChat
            taskId={task.id}
            taskTitle={task.githubIssueTitle}
            taskStatus={task.status}
          />
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Issue Summary */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-slate-400" />
                Issue Summary
              </h3>
              <a
                href={`https://github.com/${task.githubRepo}/issues/${task.githubIssueNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                View full issue on GitHub
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            {task.githubIssueBody ? (
              <p className="text-slate-300 text-sm line-clamp-4">
                {task.githubIssueBody.slice(0, 300)}
                {task.githubIssueBody.length > 300 && "..."}
              </p>
            ) : (
              <p className="text-slate-500 text-sm italic">
                No description provided.
              </p>
            )}
          </div>

          {/* Plan - Show PlanReviewPanel when awaiting approval, otherwise show simple plan */}
          {task.plan &&
            task.plan.length > 0 &&
            (task.status === "PLAN_PENDING_APPROVAL" ? (
              <PlanReviewPanel
                taskId={task.id}
                taskTitle={task.githubIssueTitle}
                plan={task.plan}
                definitionOfDone={task.definitionOfDone}
                targetFiles={task.targetFiles}
                complexity={task.estimatedComplexity}
                effort={task.estimatedEffort}
                onApproved={fetchTask}
                onRejected={fetchTask}
              />
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <h3 className="text-lg font-semibold text-white mb-3">
                  Implementation Plan
                </h3>
                <ol className="list-decimal list-inside space-y-2 text-slate-300 text-sm">
                  {task.plan.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            ))}

          {/* Definition of Done */}
          {task.definitionOfDone && task.definitionOfDone.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h3 className="text-lg font-semibold text-white mb-3">
                Definition of Done
              </h3>
              <ul className="space-y-2">
                {task.definitionOfDone.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-slate-300 text-sm"
                  >
                    <CheckCircle className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Diff */}
          {task.currentDiff && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <FileCode className="w-5 h-5 text-slate-400" />
                  Generated Diff
                </h3>
                <button
                  onClick={() => setShowDiff(!showDiff)}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  {showDiff ? "Hide" : "Show"} Diff
                </button>
              </div>
              {showDiff && <DiffViewer diff={task.currentDiff} />}
            </div>
          )}

          {/* Error */}
          {task.lastError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-5">
              <h3 className="text-lg font-semibold text-red-400 mb-3 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Last Error
              </h3>
              <pre className="text-red-300 text-sm whitespace-pre-wrap font-mono bg-red-500/5 p-3 rounded-lg overflow-x-auto">
                {task.lastError}
              </pre>
            </div>
          )}
        </div>

        {/* Right Column - Meta & Events */}
        <div className="space-y-6">
          {/* Progress Panel (Replit-style) */}
          <TaskProgressPanel
            status={task.status}
            currentAgent={events[0]?.agent}
            plan={task.plan}
            modifiedFiles={task.targetFiles}
            isProcessing={isProcessing}
          />

          {/* Visual Test Panel (Replit-style App Testing) */}
          <VisualTestPanel
            taskId={task.id}
            testRun={visualTestRun}
            onRunTests={handleRunVisualTests}
            isRunning={visualTestsLoading}
          />

          {/* Task Meta */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-lg font-semibold text-white mb-4">Details</h3>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-400">Complexity</dt>
                <dd className="text-white font-medium">
                  {task.estimatedComplexity || "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Effort</dt>
                <dd className="text-white font-medium capitalize">
                  {task.estimatedEffort || "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Attempts</dt>
                <dd className="text-white font-medium">
                  {task.attemptCount} / {task.maxAttempts}
                </dd>
              </div>
              {task.branchName && (
                <div className="flex justify-between">
                  <dt className="text-slate-400">Branch</dt>
                  <dd className="text-white font-mono text-xs truncate max-w-[150px]">
                    {task.branchName}
                  </dd>
                </div>
              )}
              {task.targetFiles && task.targetFiles.length > 0 && (
                <div>
                  <dt className="text-slate-400 mb-1">Target Files</dt>
                  <dd className="space-y-1">
                    {task.targetFiles.map((file, i) => (
                      <div
                        key={i}
                        className="text-xs font-mono text-slate-300 truncate"
                      >
                        {file}
                      </div>
                    ))}
                  </dd>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-slate-800">
                <dt className="text-slate-400">Created</dt>
                <dd className="text-slate-300 text-xs">
                  {formatDate(task.createdAt)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Updated</dt>
                <dd className="text-slate-300 text-xs">
                  {formatDate(task.updatedAt)}
                </dd>
              </div>
            </dl>
          </div>

          {/* Checkpoints Timeline (Replit-style) */}
          <CheckpointTimeline
            taskId={task.id}
            checkpoints={checkpoints}
            effortSummary={effortSummary}
            currentPhase={
              task.status.toLowerCase().includes("planning")
                ? "planning"
                : task.status.toLowerCase().includes("coding")
                  ? "coding"
                  : task.status.toLowerCase().includes("test")
                    ? "testing"
                    : task.status.toLowerCase().includes("fix")
                      ? "fixing"
                      : task.status.toLowerCase().includes("review")
                        ? "reviewing"
                        : task.status === "COMPLETED"
                          ? "completed"
                          : task.status === "FAILED"
                            ? "failed"
                            : undefined
            }
            onRollback={handleRollback}
            isLoading={checkpointsLoading}
          />

          {/* Event Timeline */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Timeline</h3>
              {sseConnected && (
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  Live
                </span>
              )}
            </div>
            {events.length === 0 ? (
              <p className="text-slate-500 text-sm">No events yet</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="flex gap-3 text-sm border-l-2 border-slate-700 pl-3"
                  >
                    <div className="flex-1">
                      <p className="text-white font-medium">
                        {event.event_type}
                      </p>
                      {event.agent && (
                        <p className="text-slate-400 text-xs">{event.agent}</p>
                      )}
                      {event.output_summary && (
                        <p className="text-slate-500 text-xs mt-1 truncate">
                          {event.output_summary}
                        </p>
                      )}
                      <p className="text-slate-600 text-xs mt-1">
                        {formatDate(event.created_at)}
                      </p>
                    </div>
                    {event.duration_ms && (
                      <div className="text-xs text-slate-500">
                        {(event.duration_ms / 1000).toFixed(1)}s
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
