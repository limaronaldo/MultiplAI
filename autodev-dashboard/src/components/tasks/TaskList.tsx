import React from "react";
import { useTasks } from "@/hooks";
import type { Task, TaskStatus } from "@/types/api";

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

  if (isLoading) {
    return <TaskListSkeleton />;
  }

  if (error) {
    return <TaskListError message={error} />;
  }

  if (tasks.length === 0) {
    return <TaskListEmpty />;
  }

  return (
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
            <th className="px-4 py-3">Updated</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} onSelect={onSelectTask} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default TaskList;
