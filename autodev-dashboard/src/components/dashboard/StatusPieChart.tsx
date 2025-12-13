import React from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { useAnalytics } from "../../hooks";
import type { TaskStatus } from "../../types/api";

// Colors for each status
const STATUS_COLORS: Record<TaskStatus, string> = {
  NEW: "#64748b", // slate
  PLANNING: "#f59e0b", // amber
  PLANNING_DONE: "#f59e0b",
  CODING: "#3b82f6", // blue
  CODING_DONE: "#3b82f6",
  TESTING: "#8b5cf6", // violet
  TESTS_PASSED: "#10b981", // emerald
  TESTS_FAILED: "#ef4444", // red
  FIXING: "#f97316", // orange
  REVIEWING: "#6366f1", // indigo
  REVIEW_APPROVED: "#10b981",
  REVIEW_REJECTED: "#ef4444",
  PR_CREATED: "#a855f7", // purple
  WAITING_HUMAN: "#ec4899", // pink
  COMPLETED: "#22c55e", // green
  FAILED: "#dc2626", // red
};

// Group statuses for cleaner chart display
const STATUS_GROUPS: Record<string, { statuses: TaskStatus[]; color: string }> =
  {
    "In Progress": {
      statuses: [
        "NEW",
        "PLANNING",
        "PLANNING_DONE",
        "CODING",
        "CODING_DONE",
        "TESTING",
        "FIXING",
        "REVIEWING",
      ],
      color: "#3b82f6",
    },
    Waiting: {
      statuses: ["WAITING_HUMAN", "PR_CREATED"],
      color: "#a855f7",
    },
    Completed: {
      statuses: ["COMPLETED", "TESTS_PASSED", "REVIEW_APPROVED"],
      color: "#22c55e",
    },
    Failed: {
      statuses: ["FAILED", "TESTS_FAILED", "REVIEW_REJECTED"],
      color: "#ef4444",
    },
  };

interface ChartDataItem {
  name: string;
  value: number;
  color: string;
  [key: string]: string | number;
}

/**
 * Group status distribution into simplified categories
 */
function groupStatuses(
  statusDistribution: { status: TaskStatus; count: number }[],
): ChartDataItem[] {
  // Convert array to map for easier lookup
  const statusCounts = new Map<TaskStatus, number>();
  statusDistribution.forEach(({ status, count }) => {
    statusCounts.set(status, count);
  });

  return Object.entries(STATUS_GROUPS)
    .map(([name, { statuses, color }]) => ({
      name,
      value: statuses.reduce((sum, s) => sum + (statusCounts.get(s) || 0), 0),
      color,
    }))
    .filter((g) => g.value > 0);
}

export function StatusPieChart() {
  const { data, isLoading, error } = useAnalytics();

  if (isLoading) {
    return (
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl h-[300px] flex items-center justify-center">
        <div className="w-32 h-32 border-4 border-slate-800 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl h-[300px] flex items-center justify-center text-red-400">
        Failed to load chart
      </div>
    );
  }

  if (!data || data.statusDistribution.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl h-[300px] flex items-center justify-center text-slate-500">
        No data to display
      </div>
    );
  }

  const chartData = groupStatuses(data.statusDistribution);

  if (chartData.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl h-[300px] flex items-center justify-center text-slate-500">
        No data to display
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
      <h3 className="text-lg font-semibold text-white mb-4">
        Task Distribution
      </h3>
      <div className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "8px",
                color: "#fff",
              }}
              formatter={(value: number) => [`${value} tasks`, ""]}
            />
            <Legend
              verticalAlign="bottom"
              height={36}
              formatter={(value) => (
                <span className="text-slate-300 text-sm">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="text-center text-sm text-slate-500 mt-2">
        {data.totalTasks} total tasks
      </div>
    </div>
  );
}

export default StatusPieChart;
