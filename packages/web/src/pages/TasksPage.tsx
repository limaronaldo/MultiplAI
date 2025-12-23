import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { Link } from "react-router-dom";
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  GitPullRequest,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import type { TaskStatus } from "@autodev/shared";
import { useTaskStore, type StatusFilter } from "@/stores";

const statusConfig: Record<
  string,
  { icon: typeof Clock; color: string; bg: string; label: string }
> = {
  COMPLETED: {
    icon: CheckCircle,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    label: "Done",
  },
  FAILED: {
    icon: XCircle,
    color: "text-red-400",
    bg: "bg-red-500/10",
    label: "Failed",
  },
  WAITING_HUMAN: {
    icon: GitPullRequest,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    label: "PR Ready",
  },
  PR_CREATED: {
    icon: GitPullRequest,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    label: "PR Created",
  },
  NEW: {
    icon: Clock,
    color: "text-slate-400",
    bg: "bg-slate-500/10",
    label: "Queued",
  },
  PLANNING: {
    icon: Zap,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    label: "Planning",
  },
  PLANNING_DONE: {
    icon: Zap,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    label: "Planned",
  },
  CODING: {
    icon: Zap,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    label: "Coding",
  },
  CODING_DONE: {
    icon: Zap,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    label: "Coded",
  },
  TESTING: {
    icon: Zap,
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
  REVIEWING: {
    icon: Zap,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    label: "Reviewing",
  },
  FIXING: {
    icon: Zap,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    label: "Fixing",
  },
};

function getConfig(status: TaskStatus) {
  return statusConfig[status] || statusConfig.NEW;
}

function isActiveStatus(status: TaskStatus): boolean {
  return ["PLANNING", "CODING", "TESTING", "REVIEWING", "FIXING"].includes(
    status,
  );
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export const TasksPage = observer(function TasksPage() {
  const taskStore = useTaskStore();

  useEffect(() => {
    taskStore.fetchTasks();
  }, [taskStore]);

  const { filteredTasks, loading, statusFilter, statusCounts, search } =
    taskStore;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Tasks</h1>
          <p className="text-slate-500 mt-1">
            Track your automated development tasks
          </p>
        </div>
        <button
          onClick={() => taskStore.fetchTasks()}
          disabled={loading}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg">
          {(["all", "active", "completed", "failed"] as StatusFilter[]).map(
            (status) => (
              <button
                key={status}
                onClick={() => taskStore.setStatusFilter(status)}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  statusFilter === status
                    ? "bg-slate-800 text-white"
                    : "text-slate-500 hover:text-white"
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
                <span className="ml-2 text-xs opacity-60">
                  {statusCounts[status]}
                </span>
              </button>
            ),
          )}
        </div>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => taskStore.setSearch(e.target.value)}
          placeholder="Search tasks..."
          className="flex-1 px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Task List */}
      {loading && filteredTasks.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 bg-slate-900 rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-500">No tasks found</p>
          <Link
            to="/plans"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            Create your first task
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task) => {
            const config = getConfig(task.status);
            const Icon = config.icon;
            const isActive = isActiveStatus(task.status);

            return (
              <Link
                key={task.id}
                to={`/tasks/${task.id}`}
                className="block p-4 bg-slate-900 hover:bg-slate-800/80 border border-slate-800 rounded-xl transition-colors group"
              >
                <div className="flex items-center gap-4">
                  {/* Status Icon */}
                  <div className={`p-2.5 rounded-lg ${config.bg}`}>
                    <Icon
                      className={`w-5 h-5 ${config.color} ${isActive ? "animate-pulse" : ""}`}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-white truncate group-hover:text-blue-400 transition-colors">
                        {task.github_issue_title}
                      </h3>
                      {task.pr_url && (
                        <a
                          href={task.pr_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                      <span>{task.github_repo}</span>
                      <span>#{task.github_issue_number}</span>
                      <span>{formatTime(task.updated_at)}</span>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${config.bg} ${config.color}`}
                    >
                      {config.label}
                    </span>

                    {/* Retry button for failed tasks */}
                    {task.status === "FAILED" && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          taskStore.performAction("retry", task.id);
                        }}
                        className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                        title="Retry task"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress indicator for active tasks */}
                {isActive && (
                  <div className="mt-3 h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full animate-pulse"
                      style={{ width: "60%" }}
                    />
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
});
