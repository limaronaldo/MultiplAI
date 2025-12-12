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

"use client";

import * as React from "react";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export interface StatusPieChartDatum {
  status: string;
  count: number;
}

export interface StatusPieChartProps {
  data: StatusPieChartDatum[];
}

// These colors are intended to mirror the status badge colors.
// If the badge palette changes, update these mappings accordingly.
const STATUS_COLOR_MAP: Record<string, string> = {
  // Common task lifecycle
  todo: "#6B7280", // gray-500
  "to do": "#6B7280",
  pending: "#6B7280",
  queued: "#6B7280",
  backlog: "#6B7280",

  "in_progress": "#3B82F6", // blue-500
  "in progress": "#3B82F6",
  running: "#3B82F6",

  done: "#10B981", // emerald-500
  completed: "#10B981",
  success: "#10B981",
  succeeded: "#10B981",

  blocked: "#EF4444", // red-500
  failed: "#EF4444",
  error: "#EF4444",

  cancelled: "#9CA3AF", // gray-400
  canceled: "#9CA3AF",
};

function normalizeStatusKey(status: string): string {
  return status.trim().toLowerCase().replace(/-/g, " ").replace(/_/g, " ");
}

function formatStatusLabel(status: string): string {
  const normalized = normalizeStatusKey(status);
  return normalized.replace(/\b\w/g, (c) => c.toUpperCase());
}

function getStatusColor(status: string): string {
  const normalized = normalizeStatusKey(status);
  return STATUS_COLOR_MAP[normalized] ?? "#64748B"; // slate-500 fallback
}

function aggregateData(data: StatusPieChartDatum[]): StatusPieChartDatum[] {
  const byStatus = new Map<string, number>();

  for (const datum of data) {
    const status = datum.status;
    const count = Number.isFinite(datum.count) ? datum.count : 0;
    byStatus.set(status, (byStatus.get(status) ?? 0) + count);
  }

  // Order known statuses first for consistent legend/pie ordering.
  const preferredOrder = [
    "Todo",
    "In Progress",
    "Done",
    "Blocked",
    "Cancelled",
  ];

  const entries = Array.from(byStatus.entries()).map(([status, count]) => ({
    status,
    count,
  }));

  const rank = (status: string): number => {
    const label = formatStatusLabel(status);
    const idx = preferredOrder.indexOf(label);
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
  };

  entries.sort((a, b) => {
    const ra = rank(a.status);
    const rb = rank(b.status);
    if (ra !== rb) return ra - rb;
    return formatStatusLabel(a.status).localeCompare(formatStatusLabel(b.status));
  });

  return entries;
}

export function StatusPieChart({ data }: StatusPieChartProps) {
  const pieData = React.useMemo(() => aggregateData(data), [data]);
  const total = React.useMemo(
    () => pieData.reduce((sum, d) => sum + (Number.isFinite(d.count) ? d.count : 0), 0),
    [pieData]
  );

  // Fixed height with responsive width. This pattern works well inside grid layouts.
  const containerStyle: React.CSSProperties = {
    width: "100%",
    height: 280,
  };

  if (pieData.length === 0 || total === 0) {
    return (
      <div style={containerStyle} aria-label="Status distribution chart">
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#6B7280",
            fontSize: 14,
          }}
        >
          No status data
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle} aria-label="Status distribution chart">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={pieData}
            dataKey="count"
            nameKey="status"
            cx="50%"
            cy="50%"
            outerRadius="80%"
            stroke="#FFFFFF"
            strokeWidth={2}
          >
            {pieData.map((entry) => (
              <Cell key={entry.status} fill={getStatusColor(entry.status)} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: unknown) => [value as number, "Count"]}
            labelFormatter={(label: unknown) => formatStatusLabel(String(label))}
          />
          <Legend
            verticalAlign="bottom"
            formatter={(value: unknown, entry: unknown) => {
              const status = String(value);
              const payload = (entry as { payload?: { count?: number } } | undefined)?.payload;
              const count = payload?.count ?? 0;
              return `${formatStatusLabel(status)} (${count})`;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
export default StatusPieChart;