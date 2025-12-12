import React from "react";
import { ShieldCheck } from "lucide-react";
import { useAnalytics } from "@/hooks";
import { KPICards } from "@/components/dashboard/KPICards";
import { StatusDistribution } from "@/components/analytics/StatusDistribution";
import { ActivityChart } from "@/components/analytics/ActivityChart";

export function DashboardPage() {
  const { data, isLoading } = useAnalytics();

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">
            System Overview
          </h2>
          <p className="text-slate-400">
            Monitoring autonomous development pipeline.
          </p>
        </div>
        <div className="flex gap-2">
          <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-medium flex items-center gap-2">
            <ShieldCheck className="w-3 h-3" /> All Guardrails Active
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <KPICards />

      {/* Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {data ? (
          <>
            <StatusDistribution data={data.statusDistribution} />
            <ActivityChart data={data.activityByDay} />
          </>
        ) : isLoading ? (
          <>
            <div className="bg-slate-800 rounded-lg p-6 animate-pulse h-64" />
            <div className="bg-slate-800 rounded-lg p-6 animate-pulse h-64" />
          </>
        ) : (
          <>
            <StatusDistribution data={[]} />
            <ActivityChart data={[]} />
          </>
        )}
      </div>

      {/* Recent Activity */}
      {data && data.recentActivity.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
          <h3 className="text-lg font-semibold text-white mb-4">
            Recent Activity
          </h3>
          <div className="space-y-3">
            {data.recentActivity.slice(0, 5).map((task) => (
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
        </div>
      )}
    </div>
  );
}

export default DashboardPage;
