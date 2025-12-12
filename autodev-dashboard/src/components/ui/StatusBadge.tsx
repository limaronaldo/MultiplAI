import React from "react";
import type { TaskStatus } from "@/types/api";

interface StatusBadgeProps {
  status: TaskStatus;
  size?: "sm" | "md" | "lg";
}

const statusConfig: Record<TaskStatus, { label: string; color: string; bgColor: string }> = {
  NEW: { label: "New", color: "text-blue-400", bgColor: "bg-blue-400/10" },
  PLANNING: { label: "Planning", color: "text-yellow-400", bgColor: "bg-yellow-400/10" },
  PLANNING_DONE: { label: "Planned", color: "text-yellow-500", bgColor: "bg-yellow-500/10" },
  CODING: { label: "Coding", color: "text-purple-400", bgColor: "bg-purple-400/10" },
  CODING_DONE: { label: "Coded", color: "text-purple-500", bgColor: "bg-purple-500/10" },
  TESTING: { label: "Testing", color: "text-cyan-400", bgColor: "bg-cyan-400/10" },
  TESTS_PASSED: { label: "Tests Passed", color: "text-green-400", bgColor: "bg-green-400/10" },
  TESTS_FAILED: { label: "Tests Failed", color: "text-red-400", bgColor: "bg-red-400/10" },
  FIXING: { label: "Fixing", color: "text-orange-400", bgColor: "bg-orange-400/10" },
  REVIEWING: { label: "Reviewing", color: "text-indigo-400", bgColor: "bg-indigo-400/10" },
  REVIEW_APPROVED: { label: "Approved", color: "text-green-500", bgColor: "bg-green-500/10" },
  REVIEW_REJECTED: { label: "Rejected", color: "text-red-500", bgColor: "bg-red-500/10" },
  PR_CREATED: { label: "PR Created", color: "text-emerald-400", bgColor: "bg-emerald-400/10" },
  WAITING_HUMAN: { label: "Waiting", color: "text-amber-400", bgColor: "bg-amber-400/10" },
  COMPLETED: { label: "Completed", color: "text-green-400", bgColor: "bg-green-400/10" },
  FAILED: { label: "Failed", color: "text-red-400", bgColor: "bg-red-400/10" },
};

const sizeClasses = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-sm",
  lg: "px-3 py-1.5 text-base",
};

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const config = statusConfig[status] || { label: status, color: "text-gray-400", bgColor: "bg-gray-400/10" };

  return (
    <span className={`inline-flex items-center font-medium rounded-full ${config.color} ${config.bgColor} ${sizeClasses[size]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.color.replace("text-", "bg-")} mr-1.5`} />
      {config.label}
    </span>
  );
}

export default StatusBadge;
