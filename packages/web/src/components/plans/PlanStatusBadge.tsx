import React from "react";

type PlanStatus = "draft" | "in_progress" | "completed" | "archived";

interface PlanStatusBadgeProps {
  status: string;
  size?: "sm" | "md" | "lg";
}

const STATUS_CONFIG: Record<
  PlanStatus,
  { label: string; className: string }
> = {
  draft: {
    label: "Draft",
    className: "bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-300",
  },
  in_progress: {
    label: "In Progress",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  completed: {
    label: "Completed",
    className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  archived: {
    label: "Archived",
    className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  },
};

const SIZE_CLASSES = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-3 py-1 text-xs",
  lg: "px-4 py-1.5 text-sm",
};

export const PlanStatusBadge: React.FC<PlanStatusBadgeProps> = ({
  status,
  size = "md",
}) => {
  const config = STATUS_CONFIG[status as PlanStatus] || STATUS_CONFIG.draft;

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${config.className} ${SIZE_CLASSES[size]}`}
    >
      {config.label}
    </span>
  );
};
