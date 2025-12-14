import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, RotateCcw, Play, XCircle } from "lucide-react";
import type { TaskSummary, TaskStatus } from "@autodev/shared";
import { FilterBar } from "@/components/tasks/FilterBar";
import { useTaskFilters } from "@/hooks/useTaskFilters";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ToastContainer, useToast } from "@/components/common/Toast";

function getStatusColor(status: TaskStatus): string {
  switch (status) {
    case "COMPLETED":
      return "bg-emerald-500/10 text-emerald-400";
    case "FAILED":
      return "bg-red-500/10 text-red-400";
    case "WAITING_HUMAN":
    case "PR_CREATED":
      return "bg-purple-500/10 text-purple-400";
    case "TESTING":
    case "REVIEWING":
      return "bg-blue-500/10 text-blue-400";
    default:
      return "bg-amber-500/10 text-amber-400";
  }
}

type ActionType = "retry" | "rerun" | "cancel";

interface PendingAction {
  type: ActionType;
  taskId: string;
  taskTitle: string;
}

export function TasksPage() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const toast = useToast();

  const { filters, setFilters, clearFilters, activeFilterCount } =
    useTaskFilters();

  const fetchTasks = () => {
    setLoading(true);
    fetch("/api/tasks")
      .then((res) => res.json())
      .then((data) => {
        setTasks(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 10000);
    return () => clearInterval(interval);
  }, []);

  // Get unique repos for filter dropdown
  const repos = useMemo(() => {
    const repoSet = new Set(tasks.map((t) => t.github_repo));
    return Array.from(repoSet).sort();
  }, [tasks]);

  // Action handlers
  const canRetry = (status: TaskStatus) =>
    status === "FAILED" ||
    status === "TESTS_FAILED" ||
    status === "REVIEW_REJECTED";

  const canRerun = (status: TaskStatus) =>
    status === "COMPLETED" ||
    status === "PR_CREATED" ||
    status === "WAITING_HUMAN";

  const canCancel = (status: TaskStatus) =>
    !["COMPLETED", "FAILED", "WAITING_HUMAN"].includes(status);

  const handleAction = async () => {
    if (!pendingAction) return;

    const { type, taskId, taskTitle } = pendingAction;
    setActionLoading(taskId);
    setPendingAction(null);

    try {
      let endpoint = "";
      let body: Record<string, unknown> | undefined;

      switch (type) {
        case "retry":
        case "rerun":
          endpoint = `/api/tasks/${taskId}/process`;
          break;
        case "cancel":
          endpoint = `/api/tasks/${taskId}/reject`;
          body = { feedback: "Cancelled by user from dashboard" };
          break;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(error.error || `Failed to ${type} task`);
      }

      toast.success(
        `Task ${type} initiated`,
        `#${taskTitle.substring(0, 30)}${taskTitle.length > 30 ? "..." : ""}`,
      );
      fetchTasks();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to ${type} task`, message);
    } finally {
      setActionLoading(null);
    }
  };

  const getConfirmConfig = (type: ActionType) => {
    switch (type) {
      case "retry":
        return {
          title: "Retry Task",
          message: "This will attempt to process the task again. Continue?",
          confirmLabel: "Retry",
          variant: "warning" as const,
        };
      case "rerun":
        return {
          title: "Rerun Task",
          message:
            "This will process the task again from the beginning. Continue?",
          confirmLabel: "Rerun",
          variant: "warning" as const,
        };
      case "cancel":
        return {
          title: "Cancel Task",
          message: "This will stop the task and mark it as failed. Continue?",
          confirmLabel: "Cancel Task",
          variant: "danger" as const,
        };
    }
  };

  // Apply filters
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // Search filter
      if (filters.search) {
        const search = filters.search.toLowerCase();
        const matchesTitle = task.github_issue_title
          .toLowerCase()
          .includes(search);
        const matchesRepo = task.github_repo.toLowerCase().includes(search);
        const matchesIssue = `#${task.github_issue_number}`.includes(search);
        if (!matchesTitle && !matchesRepo && !matchesIssue) return false;
      }

      // Status filter
      if (filters.status.length > 0 && !filters.status.includes(task.status)) {
        return false;
      }

      // Repo filter
      if (filters.repo && task.github_repo !== filters.repo) {
        return false;
      }

      // Date filters
      if (filters.dateFrom) {
        const taskDate = new Date(task.created_at);
        const fromDate = new Date(filters.dateFrom);
        if (taskDate < fromDate) return false;
      }

      if (filters.dateTo) {
        const taskDate = new Date(task.created_at);
        const toDate = new Date(filters.dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (taskDate > toDate) return false;
      }

      return true;
    });
  }, [tasks, filters]);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Tasks</h1>
        <button
          onClick={fetchTasks}
          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <FilterBar
        filters={filters}
        onFiltersChange={setFilters}
        onClearFilters={clearFilters}
        activeFilterCount={activeFilterCount}
        repos={repos}
      />

      {loading && tasks.length === 0 ? (
        <div className="animate-pulse space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 bg-slate-800 rounded-lg" />
          ))}
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          {tasks.length === 0 ? (
            <>
              <p className="text-lg">No tasks yet</p>
              <p className="text-sm mt-2">
                Tasks will appear when issues are processed
              </p>
            </>
          ) : (
            <>
              <p className="text-lg">No matching tasks</p>
              <p className="text-sm mt-2">Try adjusting your filters</p>
              <button
                onClick={clearFilters}
                className="mt-4 px-4 py-2 text-sm text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg transition-colors"
              >
                Clear all filters
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="text-sm text-slate-500 mb-3">
            Showing {filteredTasks.length} of {tasks.length} tasks
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Issue</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Repo</th>
                  <th className="px-4 py-3 text-center">Attempts</th>
                  <th className="px-4 py-3">PR</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task) => (
                  <tr
                    key={task.id}
                    onClick={() => navigate(`/tasks/${task.id}`)}
                    className="border-b border-slate-800 hover:bg-slate-800/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-sm">
                      <span className="text-blue-400 font-mono">
                        #{task.github_issue_number}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded-full ${getStatusColor(task.status)}`}
                      >
                        {task.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-200 max-w-md truncate">
                      {task.github_issue_title}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400 font-mono">
                      {task.github_repo.split("/")[1] || task.github_repo}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400 text-center">
                      {task.attempt_count}/{task.max_attempts}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {task.pr_url ? (
                        <a
                          href={task.pr_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-purple-400 hover:text-purple-300"
                        >
                          PR #{task.pr_number}
                        </a>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td
                      className="px-4 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-1">
                        {actionLoading === task.id ? (
                          <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
                        ) : (
                          <>
                            {canRetry(task.status) && (
                              <button
                                onClick={() =>
                                  setPendingAction({
                                    type: "retry",
                                    taskId: task.id,
                                    taskTitle: task.github_issue_title,
                                  })
                                }
                                className="p-1.5 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded transition-colors"
                                title="Retry"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            )}
                            {canRerun(task.status) && (
                              <button
                                onClick={() =>
                                  setPendingAction({
                                    type: "rerun",
                                    taskId: task.id,
                                    taskTitle: task.github_issue_title,
                                  })
                                }
                                className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"
                                title="Rerun"
                              >
                                <Play className="w-4 h-4" />
                              </button>
                            )}
                            {canCancel(task.status) && (
                              <button
                                onClick={() =>
                                  setPendingAction({
                                    type: "cancel",
                                    taskId: task.id,
                                    taskTitle: task.github_issue_title,
                                  })
                                }
                                className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                                title="Cancel"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Confirm Dialog */}
      {pendingAction && (
        <ConfirmDialog
          isOpen={true}
          title={getConfirmConfig(pendingAction.type).title}
          message={getConfirmConfig(pendingAction.type).message}
          confirmLabel={getConfirmConfig(pendingAction.type).confirmLabel}
          variant={getConfirmConfig(pendingAction.type).variant}
          isLoading={actionLoading !== null}
          onConfirm={handleAction}
          onCancel={() => setPendingAction(null)}
        />
      )}

      {/* Toast notifications */}
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismissToast} />
    </div>
  );
}
