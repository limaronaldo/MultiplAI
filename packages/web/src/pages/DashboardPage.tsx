import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  ArrowRight,
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  GitPullRequest,
  ExternalLink,
} from "lucide-react";
import { useDashboardStore } from "@/stores";

interface RecentTask {
  id: string;
  githubIssueTitle: string;
  githubRepo: string;
  status: string;
  prUrl?: string;
  updatedAt: string;
}

const API_BASE = import.meta.env.VITE_API_URL || "";

const statusConfig: Record<
  string,
  { icon: typeof Clock; color: string; label: string }
> = {
  COMPLETED: { icon: CheckCircle, color: "text-emerald-400", label: "Done" },
  FAILED: { icon: XCircle, color: "text-red-400", label: "Failed" },
  WAITING_HUMAN: {
    icon: GitPullRequest,
    color: "text-amber-400",
    label: "PR Ready",
  },
  NEW: { icon: Clock, color: "text-slate-400", label: "Queued" },
  PLANNING: { icon: Zap, color: "text-blue-400", label: "Planning" },
  CODING: { icon: Zap, color: "text-blue-400", label: "Coding" },
  TESTING: { icon: Zap, color: "text-blue-400", label: "Testing" },
};

export const DashboardPage = observer(function DashboardPage() {
  const navigate = useNavigate();
  const dashboardStore = useDashboardStore();
  const [recentTasks, setRecentTasks] = useState<RecentTask[]>([]);

  useEffect(() => {
    dashboardStore.refresh();

    // Fetch recent tasks
    fetch(`${API_BASE}/api/tasks?limit=5`)
      .then((res) => res.json())
      .then((data) => setRecentTasks(data.tasks || []))
      .catch(() => {});
  }, [dashboardStore]);

  const { statCards } = dashboardStore;
  const total = statCards.find((s) => s.label === "Total Tasks")?.value || 0;
  const completed = statCards.find((s) => s.label === "Completed")?.value || 0;
  const inProgress =
    statCards.find((s) => s.label === "In Progress")?.value || 0;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero Section */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-16">
        <div className="text-center max-w-2xl mx-auto">
          <h1 className="text-4xl font-bold text-white mb-4">
            What would you like to build?
          </h1>
          <p className="text-lg text-slate-400 mb-8">
            Describe a feature or bug fix, and AutoDev will implement it for
            you.
          </p>

          {/* Main Action Button */}
          <button
            onClick={() => navigate("/plans")}
            className="inline-flex items-center gap-3 px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white text-lg font-medium rounded-xl transition-all hover:scale-105 shadow-lg shadow-blue-600/25"
          >
            <Plus className="w-6 h-6" />
            Create New Task
          </button>

          {/* Quick Stats */}
          <div className="flex items-center justify-center gap-8 mt-12 text-sm">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{total}</div>
              <div className="text-slate-500">Total Tasks</div>
            </div>
            <div className="w-px h-10 bg-slate-800" />
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-400">
                {completed}
              </div>
              <div className="text-slate-500">Completed</div>
            </div>
            <div className="w-px h-10 bg-slate-800" />
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">
                {inProgress}
              </div>
              <div className="text-slate-500">In Progress</div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="border-t border-slate-800 bg-slate-900/50">
        <div className="max-w-4xl mx-auto px-8 py-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">
              Recent Activity
            </h2>
            <Link
              to="/tasks"
              className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {recentTasks.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <p>No tasks yet. Create your first task to get started!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentTasks.map((task) => {
                const config = statusConfig[task.status] || statusConfig.NEW;
                const Icon = config.icon;
                const isActive = ![
                  "COMPLETED",
                  "FAILED",
                  "WAITING_HUMAN",
                ].includes(task.status);

                return (
                  <Link
                    key={task.id}
                    to={`/tasks/${task.id}`}
                    className="flex items-center gap-4 p-4 rounded-xl bg-slate-800/50 hover:bg-slate-800 transition-colors group"
                  >
                    <div
                      className={`p-2 rounded-lg bg-slate-800 group-hover:bg-slate-700`}
                    >
                      <Icon
                        className={`w-5 h-5 ${config.color} ${isActive ? "animate-pulse" : ""}`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">
                        {task.githubIssueTitle}
                      </p>
                      <p className="text-sm text-slate-500">
                        {task.githubRepo}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm ${config.color}`}>
                        {config.label}
                      </span>
                      {task.prUrl && (
                        <a
                          href={task.prUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
