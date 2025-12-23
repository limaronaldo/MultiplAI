import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import {
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  Settings,
  RefreshCw,
} from "lucide-react";
import {
  useDashboardCustomization,
  DashboardWidget,
  CustomizationPanel,
} from "../components/dashboard/DashboardCustomization";
import {
  RecentTasksWidget,
  ActiveJobsWidget,
  PendingReviewWidget,
  TasksChartWidget,
  CostChartWidget,
  TopReposWidget,
  ProcessingTimeWidget,
} from "../components/dashboard/widgets";
import { LiveActivityFeed } from "../components/live";
import { useDashboardStore } from "@/stores";

const iconMap = {
  "Total Tasks": Activity,
  Completed: CheckCircle,
  Failed: XCircle,
  "In Progress": Clock,
};

export const DashboardPageMobX = observer(function DashboardPageMobX() {
  const dashboardStore = useDashboardStore();
  const { config, isCustomizing, setIsCustomizing } =
    useDashboardCustomization();

  // Setup auto-refresh based on config
  useEffect(() => {
    if (config.autoRefresh) {
      dashboardStore.startAutoRefresh(config.refreshInterval);
    } else {
      dashboardStore.stopAutoRefresh();
    }

    return () => {
      dashboardStore.stopAutoRefresh();
    };
  }, [config.autoRefresh, config.refreshInterval, dashboardStore]);

  const { loading, refreshing, statCards, successRate } = dashboardStore;

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

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => dashboardStore.refresh()}
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
            {statCards.map(({ label, value, color, bg }) => {
              const Icon = iconMap[label as keyof typeof iconMap] || Activity;
              return (
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
              );
            })}
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
                  style={{ width: `${successRate}%` }}
                />
              </div>
              <span className="text-2xl font-bold text-emerald-400">
                {successRate}%
              </span>
            </div>
          </div>
        </DashboardWidget>

        {/* Live Activity Feed */}
        <DashboardWidget id="live-activity">
          <LiveActivityFeed maxEvents={5} showClear={true} />
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

        {/* Tasks Chart */}
        <DashboardWidget id="tasks-chart">
          <TasksChartWidget />
        </DashboardWidget>

        {/* Cost Chart */}
        <DashboardWidget id="cost-chart">
          <CostChartWidget />
        </DashboardWidget>

        {/* Model Comparison Placeholder */}
        <DashboardWidget id="model-comparison">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 h-64 flex items-center justify-center">
            <p className="text-slate-500">Model comparison chart coming soon</p>
          </div>
        </DashboardWidget>

        {/* Top Repos Widget */}
        <DashboardWidget id="top-repos">
          <TopReposWidget />
        </DashboardWidget>

        {/* Task Complexity Widget */}
        <DashboardWidget id="processing-time">
          <ProcessingTimeWidget />
        </DashboardWidget>
      </div>

      {/* Customization Panel */}
      {isCustomizing && (
        <CustomizationPanel onClose={() => setIsCustomizing(false)} />
      )}
    </div>
  );
});
