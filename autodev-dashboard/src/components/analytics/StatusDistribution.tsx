import React from "react";
import type { TaskStatus } from "../../types/api";

interface StatusCount {
  status: TaskStatus;
  count: number;
  percentage: number;
}

interface StatusDistributionProps {
  data: StatusCount[];
}

const statusColors: Record<TaskStatus, string> = {
  NEW: "bg-slate-500",
  PLANNING: "bg-blue-500",
  PLANNING_DONE: "bg-blue-600",
  CODING: "bg-indigo-500",
  CODING_DONE: "bg-indigo-600",
  TESTING: "bg-yellow-500",
  TESTS_PASSED: "bg-green-500",
  TESTS_FAILED: "bg-red-500",
  FIXING: "bg-orange-500",
  REVIEWING: "bg-purple-500",
  REVIEW_APPROVED: "bg-green-600",
  REVIEW_REJECTED: "bg-red-600",
  PR_CREATED: "bg-emerald-500",
  WAITING_HUMAN: "bg-amber-500",
  COMPLETED: "bg-green-400",
  FAILED: "bg-red-400",
};

export function StatusDistribution({ data }: StatusDistributionProps) {
  if (!data.length) {
    return (
      <div className="bg-slate-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-slate-100 mb-4">Status Distribution</h3>
        <p className="text-slate-400 text-sm">No data available</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-slate-100 mb-4">Status Distribution</h3>

      {/* Stacked bar */}
      <div className="h-4 rounded-full overflow-hidden flex mb-4">
        {data.map(({ status, percentage }) => (
          <div
            key={status}
            className={`${statusColors[status]} transition-all duration-300`}
            style={{ width: `${percentage}%` }}
            title={`${status}: ${percentage}%`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-2">
        {data.map(({ status, count, percentage }) => (
          <div key={status} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-sm ${statusColors[status]}`} />
            <span className="text-slate-300 text-sm truncate">
              {status.replace(/_/g, " ")}
            </span>
            <span className="text-slate-500 text-xs ml-auto">
              {count} ({percentage}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default StatusDistribution;
