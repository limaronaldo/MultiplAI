import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  RefreshCw,
  RotateCcw,
  Play,
  XCircle,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Plus,
  X,
  ExternalLink,
} from "lucide-react";
import type { TaskStatus } from "@autodev/shared";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ToastContainer, useToast } from "@/components/common/Toast";
import { AdvancedFilters } from "@/components/filters/AdvancedFilters";
import { LiveActivityFeed } from "@/components/live";
import { useTaskStore, type SortField, type StatusFilter } from "@/stores";

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

export const TasksPageMobX = observer(function TasksPageMobX() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const taskStore = useTaskStore();
  const toast = useToast();

  // Local UI state
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newIssue, setNewIssue] = useState({
    repo: "",
    title: "",
    body: "",
    autoProcess: true,
  });

  // Sync URL params with store
  const selectedRepo = searchParams.get("repo") || "all";

  useEffect(() => {
    taskStore.setSelectedRepo(selectedRepo);
  }, [selectedRepo, taskStore]);

  const setSelectedRepo = (repo: string) => {
    taskStore.setSelectedRepo(repo);
    if (repo === "all") {
      searchParams.delete("repo");
    } else {
      searchParams.set("repo", repo);
    }
    setSearchParams(searchParams);
  };

  // Action handlers
  const handleAction = async () => {
    if (!pendingAction) return;

    const { type, taskId, taskTitle } = pendingAction;
    setPendingAction(null);

    const result = await taskStore.performAction(type, taskId);

    if (result.success) {
      toast.success(
        `Task ${type} initiated`,
        `#${taskTitle.substring(0, 30)}${taskTitle.length > 30 ? "..." : ""}`,
      );
    } else {
      toast.error(`Failed to ${type} task`, result.error || "Unknown error");
    }
  };

  const handleCreateIssue = async () => {
    if (!newIssue.repo || !newIssue.title) {
      toast.error("Missing fields", "Please select a repo and enter a title");
      return;
    }

    setCreating(true);
    const result = await taskStore.createIssue(newIssue);

    if (result.success && result.data) {
      toast.success(
        "Issue created",
        `#${result.data.number}: ${result.data.title.substring(0, 30)}...`,
      );
      setShowCreateModal(false);
      setNewIssue({ repo: "", title: "", body: "", autoProcess: true });
    } else {
      toast.error("Failed to create issue", result.error || "Unknown error");
    }
    setCreating(false);
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

  const SortIcon = ({ field }: { field: SortField }) => {
    if (taskStore.sortField !== field) {
      return <ChevronsUpDown className="w-3 h-3 opacity-40" />;
    }
    return taskStore.sortDirection === "asc" ? (
      <ChevronUp className="w-3 h-3" />
    ) : (
      <ChevronDown className="w-3 h-3" />
    );
  };

  const {
    tasks,
    filteredTasks,
    loading,
    actionLoading,
    repoTabs,
    statusCounts,
    repositories,
    availableModels,
    statusFilter,
    search,
    advancedFilters,
  } = taskStore;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Queue</h1>
          <p className="text-sm text-slate-500 mt-1">
            AI processing status for your issues
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://github.com/issues?q=is%3Aopen+label%3Aauto-dev"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            All Issues
          </a>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Issue
          </button>
          <button
            onClick={() => taskStore.fetchTasks()}
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Live Activity Feed */}
      <LiveActivityFeed maxEvents={5} className="mb-6" />

      {/* Repository Tabs */}
      <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-2 border-b border-slate-800">
        <button
          onClick={() => setSelectedRepo("all")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
            selectedRepo === "all"
              ? "bg-slate-800 text-white border-b-2 border-blue-500"
              : "text-slate-400 hover:text-white hover:bg-slate-800/50"
          }`}
        >
          All Repos
          <span className="text-xs bg-slate-700 px-1.5 py-0.5 rounded-full">
            {tasks.length}
          </span>
        </button>
        {repoTabs.map(({ repo, name, count }) => (
          <button
            key={repo}
            onClick={() => setSelectedRepo(repo)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
              selectedRepo === repo
                ? "bg-slate-800 text-white border-b-2 border-blue-500"
                : "text-slate-400 hover:text-white hover:bg-slate-800/50"
            }`}
          >
            {name}
            <span className="text-xs bg-slate-700 px-1.5 py-0.5 rounded-full">
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Status Filter + Search */}
      <div className="flex items-center gap-4 mb-4">
        {/* Status pills */}
        <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-1">
          {(["all", "active", "completed", "failed"] as StatusFilter[]).map(
            (status) => (
              <button
                key={status}
                onClick={() => taskStore.setStatusFilter(status)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  statusFilter === status
                    ? status === "completed"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : status === "failed"
                        ? "bg-red-500/20 text-red-400"
                        : status === "active"
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-slate-700 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
                <span className="ml-1.5 text-xs opacity-70">
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
          placeholder="Search by title, repo, or issue #..."
          className="flex-1 max-w-md px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Advanced Filters */}
      <AdvancedFilters
        filters={advancedFilters}
        onChange={(filters) => taskStore.setAdvancedFilters(filters)}
        availableModels={availableModels}
        className="mb-4"
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
              <p className="text-sm mt-2">Create an issue to get started</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4 inline mr-2" />
                New Issue
              </button>
            </>
          ) : (
            <>
              <p className="text-lg">No matching tasks</p>
              <p className="text-sm mt-2">Try adjusting your filters</p>
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
                  <th className="px-4 py-3">
                    <button
                      onClick={() => taskStore.toggleSort("issue")}
                      className="flex items-center gap-1 hover:text-white transition-colors"
                    >
                      Issue <SortIcon field="issue" />
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button
                      onClick={() => taskStore.toggleSort("status")}
                      className="flex items-center gap-1 hover:text-white transition-colors"
                    >
                      Status <SortIcon field="status" />
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button
                      onClick={() => taskStore.toggleSort("title")}
                      className="flex items-center gap-1 hover:text-white transition-colors"
                    >
                      Title <SortIcon field="title" />
                    </button>
                  </th>
                  {selectedRepo === "all" && (
                    <th className="px-4 py-3">Repo</th>
                  )}
                  <th className="px-4 py-3 text-center">
                    <button
                      onClick={() => taskStore.toggleSort("attempts")}
                      className="flex items-center gap-1 hover:text-white transition-colors mx-auto"
                    >
                      Attempts <SortIcon field="attempts" />
                    </button>
                  </th>
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
                    {selectedRepo === "all" && (
                      <td className="px-4 py-3 text-sm text-slate-400 font-mono">
                        {task.github_repo.split("/")[1] || task.github_repo}
                      </td>
                    )}
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
                            {taskStore.canRetry(task.status) && (
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
                            {taskStore.canRerun(task.status) && (
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
                            {taskStore.canCancel(task.status) && (
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

      {/* Create Issue Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                Create New Issue
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Repository select */}
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">
                  Repository
                </label>
                <select
                  value={newIssue.repo}
                  onChange={(e) =>
                    setNewIssue({ ...newIssue, repo: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select a repository...</option>
                  {repositories.map((repo) => (
                    <option key={repo.id} value={repo.full_name}>
                      {repo.full_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={newIssue.title}
                  onChange={(e) =>
                    setNewIssue({ ...newIssue, title: e.target.value })
                  }
                  placeholder="feat: add new feature..."
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Body */}
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={newIssue.body}
                  onChange={(e) =>
                    setNewIssue({ ...newIssue, body: e.target.value })
                  }
                  placeholder="Describe what needs to be done..."
                  rows={4}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              {/* Auto-process toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newIssue.autoProcess}
                  onChange={(e) =>
                    setNewIssue({ ...newIssue, autoProcess: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                />
                <span className="text-sm text-slate-300">
                  Auto-process with AutoDev (adds{" "}
                  <code className="text-blue-400">auto-dev</code> label)
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateIssue}
                disabled={creating || !newIssue.repo || !newIssue.title}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {creating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Create Issue
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
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
});
