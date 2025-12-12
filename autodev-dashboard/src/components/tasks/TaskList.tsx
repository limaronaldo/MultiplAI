import React, { useState, useMemo } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { useTasks } from "../../hooks";
import { TaskFilters, type TaskFiltersState } from "./TaskFilters";
import type { Task, TaskStatus } from "../../types/api";

// Sortable columns
type SortField = "issue" | "status" | "title" | "repo" | "attempts" | "updated";
type SortDirection = "asc" | "desc";

interface SortState {
  field: SortField;
  direction: SortDirection;
}

/**
 * Get background color class for task status
 */
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

/**
 * Format date as relative time (e.g., "2m ago", "1h ago")
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Single row in the task table
 */
interface TaskRowProps {
  task: Task;
  onSelect: (taskId: string) => void;
}

function TaskRow({ task, onSelect }: TaskRowProps) {
  return (
    <tr
      onClick={() => onSelect(task.id)}
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

      <td className="px-4 py-3 text-sm text-slate-500">
        {formatRelativeTime(task.updated_at)}
      </td>
    </tr>
  );
}

function TaskListSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-12 bg-slate-800 rounded" />
      ))}
    </div>
  );
}

function TaskListEmpty() {
  return (
    <div className="text-center py-12 text-slate-500">
      <p className="text-lg">No tasks found</p>
      <p className="text-sm mt-2">
        Tasks will appear here when issues are processed
      </p>
    </div>
  );
}

function TaskListError({ message }: { message: string }) {
  return (
    <div className="text-center py-12 text-red-400">
      <p className="text-lg">Failed to load tasks</p>
      <p className="text-sm mt-2">{message}</p>
    </div>
  );
}

interface TaskListProps {
  onSelectTask: (taskId: string) => void;
}

export function TaskList({ onSelectTask }: TaskListProps) {
  const { tasks, isLoading, error } = useTasks();

  // Filter state
  const [filters, setFilters] = useState<TaskFiltersState>({
    status: "ALL",
    search: "",
  });

  // Sort state
  const [sort, setSort] = useState<SortState>({
    field: "updated",
    direction: "desc",
  });

  // Handle column header click
  const handleSort = (field: SortField) => {
    setSort((prev) => ({
      field,
      direction:
        prev.field === field && prev.direction === "desc" ? "asc" : "desc",
    }));
  };

  // Sort icon component
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sort.field !== field) {
      return <span className="w-4" />;
    }
    return sort.direction === "asc" ? (
      <ChevronUp className="w-4 h-4" />
    ) : (
      <ChevronDown className="w-4 h-4" />
    );
  };

  // Apply filters AND sorting
  const filteredAndSortedTasks = useMemo(() => {
    // First filter
    let result = tasks.filter((task) => {
      if (filters.status !== "ALL" && task.status !== filters.status) {
        return false;
      }
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const titleMatch = task.github_issue_title
          .toLowerCase()
          .includes(searchLower);
        const repoMatch = task.github_repo.toLowerCase().includes(searchLower);
        if (!titleMatch && !repoMatch) {
          return false;
        }
      }
      return true;
    });

    // Then sort
    result.sort((a, b) => {
      let comparison = 0;

      switch (sort.field) {
        case "issue":
          comparison = a.github_issue_number - b.github_issue_number;
          break;
        case "status":
          comparison = a.status.localeCompare(b.status);
          break;
        case "title":
          comparison = a.github_issue_title.localeCompare(b.github_issue_title);
          break;
        case "repo":
          comparison = a.github_repo.localeCompare(b.github_repo);
          break;
        case "attempts":
          comparison = a.attempt_count - b.attempt_count;
          break;
        case "updated":
          comparison =
            new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
          break;
      }

      return sort.direction === "asc" ? comparison : -comparison;
    });

    return result;
  }, [tasks, filters, sort]);

  if (isLoading) {
    return <TaskListSkeleton />;
  }

  if (error) {
    return <TaskListError message={error} />;
  }

  return (
    <div>
      <TaskFilters
        filters={filters}
        onFiltersChange={setFilters}
        taskCount={filteredAndSortedTasks.length}
      />

      {filteredAndSortedTasks.length === 0 ? (
        <TaskListEmpty />
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th
                  className="px-4 py-3 cursor-pointer hover:text-slate-300 transition-colors"
                  onClick={() => handleSort("issue")}
                >
                  <div className="flex items-center gap-1">
                    Issue <SortIcon field="issue" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 cursor-pointer hover:text-slate-300 transition-colors"
                  onClick={() => handleSort("status")}
                >
                  <div className="flex items-center gap-1">
                    Status <SortIcon field="status" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 cursor-pointer hover:text-slate-300 transition-colors"
                  onClick={() => handleSort("title")}
                >
                  <div className="flex items-center gap-1">
                    Title <SortIcon field="title" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 cursor-pointer hover:text-slate-300 transition-colors"
                  onClick={() => handleSort("repo")}
                >
                  <div className="flex items-center gap-1">
                    Repo <SortIcon field="repo" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-center cursor-pointer hover:text-slate-300 transition-colors"
                  onClick={() => handleSort("attempts")}
                >
                  <div className="flex items-center justify-center gap-1">
                    Attempts <SortIcon field="attempts" />
                  </div>
                </th>
                <th className="px-4 py-3">PR</th>
                <th
                  className="px-4 py-3 cursor-pointer hover:text-slate-300 transition-colors"
                  onClick={() => handleSort("updated")}
                >
                  <div className="flex items-center gap-1">
                    Updated <SortIcon field="updated" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedTasks.map((task) => (
                <TaskRow key={task.id} task={task} onSelect={onSelectTask} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default TaskList;
