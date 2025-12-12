import React from "react";
import { ExternalLink, GitBranch, Clock, RotateCcw } from "lucide-react";
import type { Task } from "@/types/api";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface TaskDetailHeaderProps {
  task: Task;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function TaskDetailHeader({ task }: TaskDetailHeaderProps) {
  const githubUrl = `https://github.com/${task.github_repo}/issues/${task.github_issue_number}`;

  return (
    <div className="space-y-4">
      {/* Title and Issue Link */}
      <div>
        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1 mb-2"
        >
          <span className="font-mono">{task.github_repo}#{task.github_issue_number}</span>
          <ExternalLink className="w-3 h-3" />
        </a>
        <h3 className="text-xl font-semibold text-white">
          {task.github_issue_title}
        </h3>
      </div>

      {/* Status and Meta */}
      <div className="flex flex-wrap items-center gap-4">
        <StatusBadge status={task.status} size="lg" />

        <div className="flex items-center gap-1 text-sm text-slate-400">
          <Clock className="w-4 h-4" />
          <span>Updated {formatRelativeTime(task.updated_at)}</span>
        </div>

        <div className="flex items-center gap-1 text-sm text-slate-400">
          <RotateCcw className="w-4 h-4" />
          <span>Attempt {task.attempt_count}/{task.max_attempts}</span>
        </div>
      </div>

      {/* Branch and PR */}
      {(task.branch_name || task.pr_url) && (
        <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-800">
          {task.branch_name && (
            <div className="flex items-center gap-2 text-sm">
              <GitBranch className="w-4 h-4 text-slate-500" />
              <code className="text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
                {task.branch_name}
              </code>
            </div>
          )}

          {task.pr_url && (
            <a
              href={task.pr_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300"
            >
              <span>PR #{task.pr_number}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}

      {/* Error Message */}
      {task.last_error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-sm text-red-400 font-medium mb-1">Last Error</p>
          <p className="text-sm text-red-300 font-mono">{task.last_error}</p>
        </div>
      )}
    </div>
  );
}

export default TaskDetailHeader;
