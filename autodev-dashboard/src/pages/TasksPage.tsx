import React from "react";
import { useTasks } from "@/hooks";
import { GitPullRequest, ExternalLink } from "lucide-react";

export function TasksPage() {
  const { tasks, isLoading, error } = useTasks();

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="text-slate-500">Loading tasks...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Tasks</h2>
        <p className="text-slate-400">All autonomous development tasks.</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left p-4 text-xs font-semibold text-slate-500 uppercase">
                Issue
              </th>
              <th className="text-left p-4 text-xs font-semibold text-slate-500 uppercase">
                Repository
              </th>
              <th className="text-left p-4 text-xs font-semibold text-slate-500 uppercase">
                Status
              </th>
              <th className="text-left p-4 text-xs font-semibold text-slate-500 uppercase">
                Attempts
              </th>
              <th className="text-left p-4 text-xs font-semibold text-slate-500 uppercase">
                PR
              </th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr
                key={task.id}
                className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
              >
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">#{task.github_issue_number}</span>
                    <span className="text-slate-200 font-medium truncate max-w-md">
                      {task.github_issue_title}
                    </span>
                  </div>
                </td>
                <td className="p-4">
                  <span className="text-xs font-mono text-blue-400 bg-blue-900/20 px-2 py-1 rounded">
                    {task.github_repo}
                  </span>
                </td>
                <td className="p-4">
                  <span
                    className={`text-xs uppercase font-bold px-2 py-1 rounded-full ${
                      task.status === "COMPLETED"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : task.status === "FAILED"
                        ? "bg-red-500/10 text-red-400"
                        : task.status === "WAITING_HUMAN"
                        ? "bg-purple-500/10 text-purple-400"
                        : "bg-amber-500/10 text-amber-400"
                    }`}
                  >
                    {task.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="p-4">
                  <span className="text-slate-400">
                    {task.attempt_count}/{task.max_attempts}
                  </span>
                </td>
                <td className="p-4">
                  {task.pr_url ? (
                    <a
                      href={task.pr_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      <GitPullRequest className="w-4 h-4" />
                      <span>#{task.pr_number}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-slate-600">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {tasks.length === 0 && (
          <div className="p-8 text-center text-slate-500">No tasks found</div>
        )}
      </div>
    </div>
  );
}

export default TasksPage;
