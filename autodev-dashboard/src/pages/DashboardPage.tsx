import React from "react";
import { Activity, GitPullRequest, Cpu, Terminal, ShieldCheck } from "lucide-react";
import { useTasks } from "@/hooks";

export function DashboardPage() {
  const { tasks, isLoading } = useTasks();

  // Calculate stats from real tasks
  const stats = {
    totalTasks: tasks.length,
    completedTasks: tasks.filter(t => t.status === "COMPLETED").length,
    failedTasks: tasks.filter(t => t.status === "FAILED").length,
    inProgressTasks: tasks.filter(t => !["COMPLETED", "FAILED", "NEW"].includes(t.status)).length,
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">System Overview</h2>
          <p className="text-slate-400">Monitoring autonomous development pipeline.</p>
        </div>
        <div className="flex gap-2">
          <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-medium flex items-center gap-2">
            <ShieldCheck className="w-3 h-3" /> All Guardrails Active
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: "Total Tasks", value: stats.totalTasks, icon: Activity, color: "text-blue-400" },
          { label: "Completed", value: stats.completedTasks, icon: GitPullRequest, color: "text-emerald-400" },
          { label: "In Progress", value: stats.inProgressTasks, icon: Cpu, color: "text-amber-400" },
          { label: "Failed", value: stats.failedTasks, icon: Terminal, color: "text-red-400" },
        ].map((stat, i) => (
          <div key={i} className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
            <div className="flex justify-between items-start mb-4">
              <div className={`p-2 bg-slate-800 rounded-lg ${stat.color}`}>
                <stat.icon className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-bold text-white mb-1">
              {isLoading ? "-" : stat.value}
            </div>
            <div className="text-sm text-slate-500">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Recent Tasks */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-4">Recent Tasks</h3>
        {isLoading ? (
          <div className="text-slate-500 text-center py-8">Loading tasks...</div>
        ) : tasks.length === 0 ? (
          <div className="text-slate-500 text-center py-8">No tasks found</div>
        ) : (
          <div className="space-y-3">
            {tasks.slice(0, 5).map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-800"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-blue-400 bg-blue-900/20 px-1.5 py-0.5 rounded">
                      {task.github_repo}
                    </span>
                    <span className="text-xs text-slate-500">
                      #{task.github_issue_number}
                    </span>
                  </div>
                  <div className="text-sm text-slate-200 font-medium truncate">
                    {task.github_issue_title}
                  </div>
                </div>
                <span
                  className={`text-xs uppercase font-bold px-2 py-1 rounded-full ${
                    task.status === "COMPLETED"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : task.status === "FAILED"
                      ? "bg-red-500/10 text-red-400"
                      : "bg-amber-500/10 text-amber-400"
                  }`}
                >
                  {task.status.replace(/_/g, " ")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default DashboardPage;
