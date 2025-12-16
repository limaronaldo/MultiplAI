import { useEffect, useState } from "react";
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
  Pause,
  Loader2,
  FileText,
} from "lucide-react";
import clsx from "clsx";
import type { JobStatus } from "@autodev/shared";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface Job {
  id: string;
  status: JobStatus;
  taskIds: string[];
  githubRepo: string;
  createdAt: string;
  updatedAt: string;
  summary?: {
    total: number;
    completed: number;
    failed: number;
    inProgress: number;
    prsCreated: string[];
  };
}

interface JobTask {
  id: string;
  status: string;
  githubIssueNumber: number;
  githubIssueTitle: string;
  prUrl?: string;
  lastError?: string;
}

interface TaskEvent {
  id: string;
  taskId: string;
  eventType: string;
  agent?: string;
  outputSummary?: string;
  tokensUsed?: number;
  durationMs?: number;
  createdAt: string;
}

const jobStatusConfig: Record<
  JobStatus,
  { icon: typeof Clock; color: string; bg: string; label: string }
> = {
  pending: { icon: Clock, color: "text-slate-400", bg: "bg-slate-500/10", label: "Pending" },
  running: { icon: Loader2, color: "text-blue-400", bg: "bg-blue-500/10", label: "Running" },
  completed: { icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/10", label: "Completed" },
  failed: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10", label: "Failed" },
  cancelled: { icon: Pause, color: "text-slate-400", bg: "bg-slate-500/10", label: "Cancelled" },
};

const taskStatusConfig: Record<string, { color: string; bg: string }> = {
  NEW: { color: "text-slate-400", bg: "bg-slate-500/10" },
  PLANNING: { color: "text-blue-400", bg: "bg-blue-500/10" },
  PLANNING_DONE: { color: "text-blue-400", bg: "bg-blue-500/10" },
  CODING: { color: "text-purple-400", bg: "bg-purple-500/10" },
  CODING_DONE: { color: "text-purple-400", bg: "bg-purple-500/10" },
  TESTING: { color: "text-amber-400", bg: "bg-amber-500/10" },
  TESTS_PASSED: { color: "text-emerald-400", bg: "bg-emerald-500/10" },
  TESTS_FAILED: { color: "text-red-400", bg: "bg-red-500/10" },
  FIXING: { color: "text-orange-400", bg: "bg-orange-500/10" },
  REVIEWING: { color: "text-cyan-400", bg: "bg-cyan-500/10" },
  REVIEW_APPROVED: { color: "text-emerald-400", bg: "bg-emerald-500/10" },
  REVIEW_REJECTED: { color: "text-red-400", bg: "bg-red-500/10" },
  PR_CREATED: { color: "text-emerald-400", bg: "bg-emerald-500/10" },
  WAITING_HUMAN: { color: "text-amber-400", bg: "bg-amber-500/10" },
  COMPLETED: { color: "text-emerald-400", bg: "bg-emerald-500/10" },
  FAILED: { color: "text-red-400", bg: "bg-red-500/10" },
};

export function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [tasks, setTasks] = useState<JobTask[]>([]);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [showEvents, setShowEvents] = useState(false);

  const fetchJob = async () => {
    if (!jobId) return;

    try {
      const res = await fetch(`${API_BASE}/api/jobs/${jobId}`);
      if (!res.ok) {
        throw new Error("Job not found");
      }
      const data = await res.json();
      setJob(data.job);
      setTasks(data.tasks || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load job");
    } finally {
      setLoading(false);
    }
  };

  const fetchEvents = async () => {
    if (!jobId) return;

    try {
      const res = await fetch(`${API_BASE}/api/jobs/${jobId}/events`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch (err) {
      console.error("Failed to fetch events:", err);
    }
  };

  useEffect(() => {
    fetchJob();
  }, [jobId]);

  useEffect(() => {
    if (showEvents && events.length === 0) {
      fetchEvents();
    }
  }, [showEvents]);

  // Auto-refresh while job is running
  useEffect(() => {
    if (job?.status === "running") {
      const interval = setInterval(fetchJob, 5000);
      return () => clearInterval(interval);
    }
  }, [job?.status]);

  const handleRun = async () => {
    if (!job) return;
    setProcessing(true);

    try {
      const res = await fetch(`${API_BASE}/api/jobs/${job.id}/run`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to start job");
      await fetchJob();
    } catch (err) {
      console.error("Run failed:", err);
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!job) return;
    setProcessing(true);

    try {
      const res = await fetch(`${API_BASE}/api/jobs/${job.id}/cancel`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to cancel job");
      await fetchJob();
    } catch (err) {
      console.error("Cancel failed:", err);
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

  if (error || !job) {
    return (
      <div className="p-8">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
          <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">
            Job Not Found
          </h2>
          <p className="text-slate-400 mb-4">{error}</p>
          <Link
            to="/jobs"
            className="text-blue-400 hover:text-blue-300 flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Jobs
          </Link>
        </div>
      </div>
    );
  }

  const status = jobStatusConfig[job.status] || jobStatusConfig.pending;
  const StatusIcon = status.icon;
  const isRunning = job.status === "running";
  const progress = job.summary
    ? ((job.summary.completed + job.summary.failed) / job.summary.total) * 100
    : 0;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button
            onClick={() => navigate("/jobs")}
            className="flex items-center gap-2 text-slate-400 hover:text-white mb-3 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Jobs
          </button>
          <h1 className="text-2xl font-bold text-white mb-2">
            Job: {job.githubRepo}
          </h1>
          <div className="flex items-center gap-3 text-sm">
            <a
              href={`https://github.com/${job.githubRepo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-blue-400 flex items-center gap-1"
            >
              {job.githubRepo}
              <ExternalLink className="w-3 h-3" />
            </a>
            <span className="text-slate-600">|</span>
            <div
              className={clsx(
                "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
                status.bg,
                status.color
              )}
            >
              <StatusIcon
                className={clsx("w-3 h-3", isRunning && "animate-spin")}
              />
              {status.label}
            </div>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">
              {job.taskIds.length} task{job.taskIds.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {job.status === "pending" && (
            <button
              onClick={handleRun}
              disabled={processing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {processing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Run Job
            </button>
          )}
          {job.status === "running" && (
            <button
              onClick={handleCancel}
              disabled={processing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {processing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Pause className="w-4 h-4" />
              )}
              Cancel
            </button>
          )}
          <button
            onClick={fetchJob}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      {job.summary && job.summary.total > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-slate-400">Progress</span>
            <span className="text-slate-300">
              {job.summary.completed + job.summary.failed} / {job.summary.total}
            </span>
          </div>
          <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Summary Cards */}
      {job.summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-white">{job.summary.total}</div>
            <div className="text-sm text-slate-400">Total Tasks</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-emerald-400">{job.summary.completed}</div>
            <div className="text-sm text-slate-400">Completed</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-red-400">{job.summary.failed}</div>
            <div className="text-sm text-slate-400">Failed</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-blue-400">{job.summary.inProgress}</div>
            <div className="text-sm text-slate-400">In Progress</div>
          </div>
        </div>
      )}

      {/* PRs Created */}
      {job.summary && job.summary.prsCreated && job.summary.prsCreated.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6">
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-emerald-400" />
            Pull Requests Created ({job.summary.prsCreated.length})
          </h3>
          <div className="space-y-2">
            {job.summary.prsCreated.map((prUrl, i) => (
              <a
                key={i}
                href={prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
              >
                <ExternalLink className="w-3 h-3" />
                {prUrl}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Tasks List */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-slate-400" />
          Tasks
        </h3>
        {tasks.length === 0 ? (
          <p className="text-slate-500 text-sm">No tasks in this job</p>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => {
              const taskStatus = taskStatusConfig[task.status] || taskStatusConfig.NEW;
              return (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                  onClick={() => navigate(`/tasks/${task.id}`)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-sm">
                        #{task.githubIssueNumber}
                      </span>
                      <span className="text-white truncate">
                        {task.githubIssueTitle}
                      </span>
                    </div>
                    {task.lastError && (
                      <p className="text-xs text-red-400 mt-1 truncate">
                        {task.lastError}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    {task.prUrl && (
                      <a
                        href={task.prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-emerald-400 hover:text-emerald-300"
                      >
                        <GitBranch className="w-4 h-4" />
                      </a>
                    )}
                    <span
                      className={clsx(
                        "text-xs font-medium px-2 py-1 rounded-full",
                        taskStatus.bg,
                        taskStatus.color
                      )}
                    >
                      {task.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Events Timeline */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-400" />
            Event Timeline
          </h3>
          <button
            onClick={() => {
              setShowEvents(!showEvents);
              if (!showEvents) fetchEvents();
            }}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            {showEvents ? "Hide" : "Show"} Events
          </button>
        </div>
        {showEvents && (
          events.length === 0 ? (
            <p className="text-slate-500 text-sm">No events yet</p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {events.slice().reverse().map((event) => (
                <div
                  key={event.id}
                  className="flex gap-3 text-sm border-l-2 border-slate-700 pl-3"
                >
                  <div className="flex-1">
                    <p className="text-white font-medium">{event.eventType}</p>
                    {event.agent && (
                      <p className="text-slate-400 text-xs">{event.agent}</p>
                    )}
                    {event.outputSummary && (
                      <p className="text-slate-500 text-xs mt-1 truncate">
                        {event.outputSummary}
                      </p>
                    )}
                    <p className="text-slate-600 text-xs mt-1">
                      {new Date(event.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {event.durationMs && (
                    <div className="text-xs text-slate-500">
                      {(event.durationMs / 1000).toFixed(1)}s
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Meta Info */}
      <div className="mt-6 flex items-center justify-between text-xs text-slate-500">
        <span>Created: {new Date(job.createdAt).toLocaleString()}</span>
        <span>Updated: {new Date(job.updatedAt).toLocaleString()}</span>
      </div>
    </div>
  );
}
