import { useEffect, useState } from "react";
import { Activity, CheckCircle, XCircle, Clock } from "lucide-react";
import type { DashboardStats } from "@autodev/shared";

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats")
      .then((res) => res.json())
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

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

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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

      {/* Success Rate */}
      {stats && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Success Rate</h2>
          <div className="flex items-center gap-4">
            <div className="flex-1 h-4 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${stats.success_rate}%` }}
              />
            </div>
            <span className="text-2xl font-bold text-emerald-400">
              {stats.success_rate}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
