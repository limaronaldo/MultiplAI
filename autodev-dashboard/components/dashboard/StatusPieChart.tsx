import React from "react";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";

export interface StatusPieChartDatum {
  status: TaskStatus;
  count: number;
}

export interface StatusPieChartProps {
  data: StatusPieChartDatum[];
}

// NOTE: These are intended to match the status badge colors.
// If TaskStatusBadge uses different exact shades, update these constants.
const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: "#6B7280",
  in_progress: "#3B82F6",
  blocked: "#EF4444",
  done: "#10B981",
};

const FALLBACK_COLORS = ["#6366F1", "#EC4899", "#F59E0B", "#14B8A6"]; 

function formatStatusLabel(status: TaskStatus): string {
  switch (status) {
    case "todo":
      return "To Do";
    case "in_progress":
      return "In Progress";
    case "blocked":
      return "Blocked";
    case "done":
      return "Done";
    default:
      return status;
  }
}

type LegendEntry = {
  color?: string;
  value?: string;
  payload?: StatusPieChartDatum;
};

function StatusLegend({ payload }: { payload?: LegendEntry[] }) {
  if (!payload || payload.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
      {payload.map((entry, index) => {
        const datum = entry.payload;
        if (!datum) {
          return null;
        }

        const color =
          entry.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];

        return (
          <li key={`${datum.status}-${index}`} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: color }}
            />
            <span className="text-gray-700">
              {formatStatusLabel(datum.status)}
              <span className="text-gray-500">{` (${datum.count})`}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

type TooltipPayload = {
  name?: TaskStatus;
  value?: number;
  payload?: StatusPieChartDatum;
};

function StatusTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const item = payload[0];
  const status = item.payload?.status ?? item.name;
  const count = item.payload?.count ?? item.value;

  if (!status || typeof count !== "number") {
    return null;
  }

  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm">
      <div className="font-medium text-gray-900">{formatStatusLabel(status)}</div>
      <div className="text-gray-600">Count: {count}</div>
    </div>
  );
}

export function StatusPieChart({ data }: StatusPieChartProps) {
  const filtered = (data ?? []).filter((d) => d.count > 0);

  if (filtered.length === 0) {
    return (
      <div className="flex h-[280px] w-full items-center justify-center text-sm text-gray-500">
        No status data available
      </div>
    );
  }

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={filtered}
            dataKey="count"
            nameKey="status"
            cx="50%"
            cy="50%"
            outerRadius="80%"
            stroke="#ffffff"
            strokeWidth={1}
          >
            {filtered.map((entry, index) => {
              const color =
                STATUS_COLORS[entry.status] ??
                FALLBACK_COLORS[index % FALLBACK_COLORS.length];
              return <Cell key={`${entry.status}-${index}`} fill={color} />;
            })}
          </Pie>
          <Tooltip content={<StatusTooltip />} />
          <Legend verticalAlign="bottom" align="center" content={<StatusLegend />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export default StatusPieChart;