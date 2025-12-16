import { useEffect, useState } from "react";
import {
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  Settings,
  RefreshCw,
} from "lucide-react";
import type { DashboardStats } from "@autodev/shared";
import {
  useDashboardCustomization,
  DashboardWidget,
  CustomizationPanel,
} from "../components/dashboard/DashboardCustomization";
import {
  RecentTasksWidget,
  ActiveJobsWidget,
  PendingReviewWidget,
} from "../components/dashboard/widgets";

const API_BASE = import.meta.env.VITE_API_URL || "";

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { config, isCustomizing, setIsCustomizing } =
    useDashboardCustomization();

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/stats`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  // Auto-refresh based on config
  useEffect(() => {
    if (!config.autoRefresh) return;

    const interval = setInterval(() => {
      setRefreshing(true);
      fetchStats();
    }, config.refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [config.autoRefresh, config.refreshInterval]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-slate-800 rounded" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-slate-800 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Tasks",
      value: stats?.total ?? 0,
      icon: Activity,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: "Completed",
      value: stats?.completed ?? 0,
      icon: CheckCircle,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Failed",
      value: stats?.failed ?? 0,
      icon: XCircle,
      color: "text-red-400",
      bg: "bg-red-500/10",
    },
    {
      label: "In Progress",
      value: stats?.in_progress ?? 0,
      icon: Clock,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
    },
  ];

  // Get visible widgets sorted by order
  const visibleWidgets = config.widgets
    .filter((w) => w.visible)
    .sort((a, b) => a.order - b.order);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={() => setIsCustomizing(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:bg-slate-800 transition-colors"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Customize</span>
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div
        className={`grid gap-4 ${config.compactMode ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"}`}
      >
        {/* Stats Summary Widget */}
        <DashboardWidget id="stats-summary">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map(({ label, value, icon: Icon, color, bg }) => (
              <div
                key={label}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-slate-400">{label}</span>
                  <div className={`p-2 rounded-lg ${bg}`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                </div>
                <div className="text-3xl font-bold text-white">{value}</div>
              </div>
            ))}
          </div>
        </DashboardWidget>

        {/* Success Rate Widget */}
        <DashboardWidget id="success-rate">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 h-full">
            <h3 className="text-lg font-semibold text-white mb-4">
              Success Rate
            </h3>
            <div className="flex items-center gap-4">
              <div className="flex-1 h-4 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${stats?.success_rate ?? 0}%` }}
                />
              </div>
              <span className="text-2xl font-bold text-emerald-400">
                {stats?.success_rate ?? 0}%
              </span>
            </div>
          </div>
        </DashboardWidget>

        {/* Recent Tasks Widget */}
        <DashboardWidget id="recent-tasks">
          <RecentTasksWidget />
        </DashboardWidget>

        {/* Active Jobs Widget */}
        <DashboardWidget id="active-jobs">
          <ActiveJobsWidget />
        </DashboardWidget>

        {/* Pending Review Widget */}
        <DashboardWidget id="pending-review">
          <PendingReviewWidget />
        </DashboardWidget>

        {/* Tasks Chart Placeholder */}
        <DashboardWidget id="tasks-chart">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 h-64 flex items-center justify-center">
            <p className="text-slate-500">Tasks over time chart coming soon</p>
          </div>
        </DashboardWidget>

        {/* Cost Chart Placeholder */}
        <DashboardWidget id="cost-chart">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 h-64 flex items-center justify-center">
            <p className="text-slate-500">Cost breakdown chart coming soon</p>
          </div>
        </DashboardWidget>

        {/* Model Comparison Placeholder */}
        <DashboardWidget id="model-comparison">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 h-64 flex items-center justify-center">
            <p className="text-slate-500">Model comparison chart coming soon</p>
          </div>
        </DashboardWidget>

        {/* Top Repos Placeholder */}
        <DashboardWidget id="top-repos">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 h-full flex items-center justify-center">
            <p className="text-slate-500">Top repositories coming soon</p>
          </div>
        </DashboardWidget>

        {/* Processing Time Placeholder */}
        <DashboardWidget id="processing-time">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 h-full flex items-center justify-center">
            <p className="text-slate-500">Processing time stats coming soon</p>
          </div>
        </DashboardWidget>
      </div>

      {/* Customization Panel */}
      {isCustomizing && (
        <CustomizationPanel onClose={() => setIsCustomizing(false)} />
      )}
    </div>
  );
}
