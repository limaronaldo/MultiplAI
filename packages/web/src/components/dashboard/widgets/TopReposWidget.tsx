import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { GitBranch, ExternalLink } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface RepoStats {
  repo: string;
  total: number;
  completed: number;
  successRate: number;
}

interface StatsResponse {
  topRepos: RepoStats[];
}

export function TopReposWidget() {
  const [data, setData] = useState<RepoStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/stats`);
        if (!res.ok) throw new Error("Failed to fetch stats");
        const json: StatsResponse = await res.json();
        setData(json.topRepos || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 h-64 animate-pulse">
        <div className="h-4 w-32 bg-slate-800 rounded mb-4" />
        <div className="h-48 bg-slate-800 rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 h-64 flex items-center justify-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 h-64 flex items-center justify-center">
        <p className="text-slate-500">No repository data available</p>
      </div>
    );
  }

  // Prepare chart data with short repo names
  const chartData = data.map((r) => ({
    ...r,
    name: r.repo.split("/")[1] || r.repo,
    failed: r.total - r.completed,
  }));

  // Color based on success rate
  const getBarColor = (successRate: number) => {
    if (successRate >= 50) return "#10b981"; // emerald
    if (successRate >= 25) return "#f59e0b"; // amber
    return "#ef4444"; // red
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-blue-400" />
          <div>
            <h3 className="text-lg font-semibold text-white">Top Repositories</h3>
            <p className="text-sm text-slate-400">Task distribution by repo</p>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
        >
          <XAxis type="number" stroke="#6b7280" tick={{ fill: "#9ca3af", fontSize: 12 }} />
          <YAxis
            type="category"
            dataKey="name"
            stroke="#6b7280"
            tick={{ fill: "#9ca3af", fontSize: 12 }}
            width={100}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1f2937",
              border: "1px solid #374151",
              borderRadius: "0.5rem",
            }}
            labelStyle={{ color: "#f3f4f6" }}
            formatter={(value: number, name: string) => [
              value,
              name === "completed" ? "Completed" : "Failed",
            ]}
          />
          <Bar dataKey="completed" stackId="a" name="completed" radius={[0, 0, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getBarColor(entry.successRate)} />
            ))}
          </Bar>
          <Bar dataKey="failed" stackId="a" name="failed" fill="#374151" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {/* Legend / Stats */}
      <div className="mt-4 space-y-2">
        {data.slice(0, 3).map((repo) => (
          <div
            key={repo.repo}
            className="flex items-center justify-between text-sm"
          >
            <a
              href={`https://github.com/${repo.repo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-300 hover:text-blue-400 flex items-center gap-1 truncate max-w-[60%]"
            >
              {repo.repo.split("/")[1]}
              <ExternalLink className="w-3 h-3" />
            </a>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">{repo.total} tasks</span>
              <span
                className={`font-medium ${
                  repo.successRate >= 50
                    ? "text-emerald-400"
                    : repo.successRate >= 25
                    ? "text-amber-400"
                    : "text-red-400"
                }`}
              >
                {repo.successRate}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
