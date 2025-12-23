import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Clock, Zap } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface TaskData {
  estimatedComplexity: string | null;
  status: string;
}

interface ComplexityStats {
  complexity: string;
  total: number;
  completed: number;
  successRate: number;
}

const COMPLEXITY_COLORS: Record<string, string> = {
  XS: "#10b981", // emerald
  S: "#3b82f6",  // blue
  M: "#f59e0b",  // amber
  L: "#f97316",  // orange
  XL: "#ef4444", // red
  Unknown: "#6b7280", // gray
};

const COMPLEXITY_ORDER = ["XS", "S", "M", "L", "XL", "Unknown"];

export function ProcessingTimeWidget() {
  const [data, setData] = useState<ComplexityStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/tasks?limit=500`);
        if (!res.ok) throw new Error("Failed to fetch tasks");
        const json = await res.json();
        const tasks: TaskData[] = json.tasks || [];

        // Group by complexity
        const byComplexity: Record<string, { total: number; completed: number }> = {};

        for (const task of tasks) {
          const complexity = task.estimatedComplexity || "Unknown";
          if (!byComplexity[complexity]) {
            byComplexity[complexity] = { total: 0, completed: 0 };
          }
          byComplexity[complexity].total++;
          if (task.status === "COMPLETED" || task.status === "PR_CREATED" || task.status === "WAITING_HUMAN") {
            byComplexity[complexity].completed++;
          }
        }

        // Convert to array and sort by complexity order
        const stats: ComplexityStats[] = Object.entries(byComplexity)
          .map(([complexity, { total, completed }]) => ({
            complexity,
            total,
            completed,
            successRate: total > 0 ? Math.round((completed / total) * 100) : 0,
          }))
          .sort((a, b) =>
            COMPLEXITY_ORDER.indexOf(a.complexity) - COMPLEXITY_ORDER.indexOf(b.complexity)
          );

        setData(stats);
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
        <p className="text-slate-500">No task data available</p>
      </div>
    );
  }

  const totalTasks = data.reduce((sum, d) => sum + d.total, 0);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-400" />
          <div>
            <h3 className="text-lg font-semibold text-white">Task Complexity</h3>
            <p className="text-sm text-slate-400">Distribution by size</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Pie Chart */}
        <div className="w-1/2">
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={data}
                dataKey="total"
                nameKey="complexity"
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={65}
                paddingAngle={2}
              >
                {data.map((entry) => (
                  <Cell
                    key={entry.complexity}
                    fill={COMPLEXITY_COLORS[entry.complexity] || COMPLEXITY_COLORS.Unknown}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1f2937",
                  border: "1px solid #374151",
                  borderRadius: "0.5rem",
                }}
                labelStyle={{ color: "#f3f4f6" }}
                formatter={(value: number, name: string) => [
                  `${value} tasks (${Math.round((value / totalTasks) * 100)}%)`,
                  name,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Stats Table */}
        <div className="w-1/2 space-y-2">
          {data.map((item) => (
            <div
              key={item.complexity}
              className="flex items-center justify-between text-sm"
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: COMPLEXITY_COLORS[item.complexity] }}
                />
                <span className="text-slate-300 font-medium">{item.complexity}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-slate-400">{item.total}</span>
                <span
                  className={`font-medium w-12 text-right ${
                    item.successRate >= 50
                      ? "text-emerald-400"
                      : item.successRate >= 25
                      ? "text-amber-400"
                      : "text-red-400"
                  }`}
                >
                  {item.successRate}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-slate-400">
          <Clock className="w-4 h-4" />
          <span>XS/S tasks have highest success rate</span>
        </div>
        <span className="text-slate-500">{totalTasks} total tasks</span>
      </div>
    </div>
  );
}
