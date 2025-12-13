
import React, { useMemo } from "react";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
} from "recharts";

type TaskStatus =
  | "todo"
  | "backlog"
  | "new"
  | "in_progress"
  | "doing"
  | "active"
  | "blocked"
  | "on_hold"
  | "stuck"
  | "done"
  | "completed"
  | "closed"
  | "resolved";

type StatusCounts = Record<string, number>;

type StatusGroupKey = "todo" | "inProgress" | "blocked" | "done" | "other";

type GroupDefinition = {
  key: StatusGroupKey;
  label: string;
  color: string;
  statuses: readonly TaskStatus[];
};

const GROUPS: readonly GroupDefinition[] = [
  {
    key: "todo",
    label: "To do",
    color: "#64748b",
    statuses: ["todo", "backlog", "new"],
  },
  {
    key: "inProgress",
    label: "In progress",
    color: "#3b82f6",
    statuses: ["in_progress", "doing", "active"],
  },
  {
    key: "blocked",
    label: "Blocked",
    color: "#f97316",
    statuses: ["blocked", "on_hold", "stuck"],
  },
  {
    key: "done",
    label: "Done",
    color: "#22c55e",
    statuses: ["done", "completed", "closed", "resolved"],
  },
];

function normalizeStatusKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, "_");
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

type ChartDatum = {
  key: StatusGroupKey;
  name: string;
  value: number;
  color: string;
};

function DefaultTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;

  const item = payload[0];
  const name = typeof item?.name === "string" ? item.name : "";
  const value = toNumber(item?.value);

  return (
    <div
      style={{
        background: "white",
        border: "1px solid rgba(0, 0, 0, 0.08)",
        borderRadius: 8,
        padding: "8px 10px",
        boxShadow: "0 6px 18px rgba(0, 0, 0, 0.08)",
      }}
    >
      <div style={{ fontSize: 12, color: "rgba(0, 0, 0, 0.7)", marginBottom: 2 }}>{name}</div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{value.toLocaleString()} tasks</div>
    </div>
  );
}

export type StatusPieChartProps = {
  /**
   * Map of status -> count.
   * Keys are normalized (case-insensitive); spaces are treated as underscores.
   */
  statusCounts?: StatusCounts;
  loading?: boolean;
  error?: string | null;
  title?: string;
  className?: string;
  /** Height of the chart area (excluding title/legend). */
  height?: number;
};

export default function StatusPieChart({
  statusCounts,
  loading = false,
  error = null,
  title = "Status distribution",
  className,
  height = 240,
}: StatusPieChartProps) {
  const { chartData, total } = useMemo(() => {
    const normalized: Record<string, number> = {};
    for (const [rawKey, rawValue] of Object.entries(statusCounts ?? {})) {
      const key = normalizeStatusKey(rawKey);
      normalized[key] = (normalized[key] ?? 0) + toNumber(rawValue);
    }

    const groupKeysByStatus = new Map<string, StatusGroupKey>();
    for (const group of GROUPS) {
      for (const status of group.statuses) {
        groupKeysByStatus.set(status, group.key);
      }
    }

    const totalsByGroup: Record<StatusGroupKey, number> = {
      todo: 0,
      inProgress: 0,
      blocked: 0,
      done: 0,
      other: 0,
    };

    for (const [key, value] of Object.entries(normalized)) {
      const groupKey = groupKeysByStatus.get(key);
      if (groupKey) {
        totalsByGroup[groupKey] += value;
      } else {
        totalsByGroup.other += value;
      }
    }

    const data: ChartDatum[] = [
      ...GROUPS.map((g) => ({
        key: g.key,
        name: g.label,
        value: totalsByGroup[g.key],
        color: g.color,
      })),
      {
        key: "other",
        name: "Other",
        value: totalsByGroup.other,
        color: "#a855f7",
      },
    ].filter((d) => d.value > 0);

    const sum = data.reduce((acc, d) => acc + d.value, 0);
    return { chartData: data, total: sum };
  }, [statusCounts]);

  if (loading) {
    return (
      <div className={className} style={{ padding: 16, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{title}</div>
        <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(0,0,0,0.55)" }}>
          Loading status distribution…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={className} style={{ padding: 16, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{title}</div>
        <div style={{ color: "#b91c1c", fontSize: 13 }}>Failed to load status data: {error}</div>
      </div>
    );
  }

  if (!statusCounts || total === 0) {
    return (
      <div className={className} style={{ padding: 16, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{title}</div>
        <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(0,0,0,0.55)" }}>
          No status data available.
        </div>
      </div>
    );
  }

  return (
    <div className={className} style={{ padding: 16, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 12, color: "rgba(0,0,0,0.6)" }}>{total.toLocaleString()} total</div>
      </div>

      <div style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<DefaultTooltip />} />
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={2}
              stroke="rgba(0,0,0,0.08)"
              strokeWidth={1}
              isAnimationActive={false}
            >
              {chartData.map((entry) => (
                <Cell key={entry.key} fill={entry.color} />
              ))}
            </Pie>
            <Legend
              verticalAlign="bottom"
              align="center"
              iconType="circle"
              wrapperStyle={{ paddingTop: 12 }}
              formatter={(value) => <span style={{ color: "rgba(0,0,0,0.75)", fontSize: 12 }}>{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
import React, { useMemo } from 'react';
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

export type TaskStatus =
  | 'in_progress'
  | 'waiting'
  | 'completed'
  | 'failed'
  | (string & {});

type AnalyticsResult = {
  loading: boolean;
  error: string | null;
  statusCounts: Record<string, number> | null;
};

/**
 * Local stub implementation.
 *
 * In the full application this hook would typically be provided by the
 * dashboard's analytics layer. Since only this file is available in the
 * provided context, we keep a minimal hook here to ensure TS compilation.
 */
function useAnalytics(): AnalyticsResult {
  return {
    loading: false,
    error: null,
    statusCounts: null,
  };
}

const STATUS_COLORS: Record<string, string> = {
  // In Progress
  in_progress: '#3b82f6',
  'in progress': '#3b82f6',
  running: '#3b82f6',
  active: '#3b82f6',
  processing: '#3b82f6',

  // Waiting
  waiting: '#f59e0b',
  pending: '#f59e0b',
  queued: '#f59e0b',
  blocked: '#f59e0b',
  paused: '#f59e0b',
  on_hold: '#f59e0b',
  'on hold': '#f59e0b',

  // Completed
  completed: '#10b981',
  done: '#10b981',
  success: '#10b981',
  succeeded: '#10b981',
  finished: '#10b981',

  // Failed
  failed: '#ef4444',
  error: '#ef4444',
  cancelled: '#ef4444',
  canceled: '#ef4444',
  timeout: '#ef4444',
};

type StatusGroup = {
  name: 'In Progress' | 'Waiting' | 'Completed' | 'Failed';
  value: number;
  color: string;
};

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase();
}

function groupStatuses(statusCounts: Record<string, number> | null): StatusGroup[] {
  const inProgress = new Set(['in_progress', 'in progress', 'running', 'active', 'processing']);
  const waiting = new Set([
    'waiting',
    'pending',
    'queued',
    'blocked',
    'paused',
    'on_hold',
    'on hold',
  ]);
  const completed = new Set(['completed', 'done', 'success', 'succeeded', 'finished']);
  const failed = new Set(['failed', 'error', 'cancelled', 'canceled', 'timeout']);

  const grouped: Record<StatusGroup['name'], number> = {
    'In Progress': 0,
    Waiting: 0,
    Completed: 0,
    Failed: 0,
  };

  if (!statusCounts) {
    return [
      { name: 'In Progress', value: 0, color: STATUS_COLORS.in_progress },
      { name: 'Waiting', value: 0, color: STATUS_COLORS.waiting },
      { name: 'Completed', value: 0, color: STATUS_COLORS.completed },
      { name: 'Failed', value: 0, color: STATUS_COLORS.failed },
    ];
  }

  for (const [rawStatus, rawCount] of Object.entries(statusCounts)) {
    const count = Number.isFinite(rawCount) ? rawCount : 0;
    const status = normalizeStatus(rawStatus);

    if (inProgress.has(status)) {
      grouped['In Progress'] += count;
      continue;
    }

    if (waiting.has(status)) {
      grouped.Waiting += count;
      continue;
    }

    if (completed.has(status)) {
      grouped.Completed += count;
      continue;
    }

    if (failed.has(status)) {
      grouped.Failed += count;
      continue;
    }

    // Unknown statuses are treated as Waiting to keep the 4-group model.
    grouped.Waiting += count;
  }

  return [
    { name: 'In Progress', value: grouped['In Progress'], color: STATUS_COLORS.in_progress },
    { name: 'Waiting', value: grouped.Waiting, color: STATUS_COLORS.waiting },
    { name: 'Completed', value: grouped.Completed, color: STATUS_COLORS.completed },
    { name: 'Failed', value: grouped.Failed, color: STATUS_COLORS.failed },
  ];
}

export const StatusPieChart: React.FC = () => {
  const { loading, error, statusCounts } = useAnalytics();

  const data = useMemo(() => groupStatuses(statusCounts), [statusCounts]);
  const totalTasks = useMemo(
    () => data.reduce((sum, item) => sum + (Number.isFinite(item.value) ? item.value : 0), 0),
    [data]
  );

  if (loading) {
    return (
      <div
        style={{
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: 12,
          padding: 16,
          color: '#e2e8f0',
          minHeight: 320,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <style>{
          '@keyframes statusPieChartSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'
        }</style>
        <div
          role="status"
          aria-label="Loading"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '3px solid #334155',
            borderTopColor: '#60a5fa',
            animation: 'statusPieChartSpin 1s linear infinite',
          }}
        />
        <div style={{ fontSize: 12, color: '#94a3b8' }}>Loading status breakdown…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: 12,
          padding: 16,
          color: '#e2e8f0',
          minHeight: 320,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Status Breakdown</div>
        <div style={{ color: '#fca5a5', fontSize: 13 }}>Error: {error}</div>
      </div>
    );
  }

  if (totalTasks === 0) {
    return (
      <div
        style={{
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: 12,
          padding: 16,
          color: '#e2e8f0',
          minHeight: 320,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>Status Breakdown</div>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>No data to display</div>
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: 12,
        padding: 16,
        color: '#e2e8f0',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Status Breakdown</div>

      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              stroke="#0f172a"
              strokeWidth={2}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => [value, 'Tasks']}
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 8,
                color: '#e2e8f0',
                fontSize: 12,
              }}
              itemStyle={{ color: '#e2e8f0' }}
              labelStyle={{ color: '#cbd5e1' }}
            />
            <Legend
              verticalAlign="bottom"
              align="center"
              formatter={(value: string) => (
                <span style={{ color: '#cbd5e1', fontSize: 12 }}>{value}</span>
              )}
              wrapperStyle={{ paddingTop: 8 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>
        Total tasks: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{totalTasks}</span>
      </div>
    </div>
  );
};

export default StatusPieChart;
import React, { useMemo } from "react";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
} from "recharts";

export type TaskStatus =
  | "todo"
  | "backlog"
  | "new"
  | "in_progress"
  | "doing"
  | "active"
  | "blocked"
  | "on_hold"
  | "stuck"
  | "done"
  | "completed"
  | "closed"
  | "resolved";

type StatusGroupKey = "todo" | "inProgress" | "blocked" | "done" | "other";

type GroupDefinition = {
  key: Exclude<StatusGroupKey, "other">;
  label: string;
  color: string;
  statuses: readonly TaskStatus[];
};

const GROUPS: readonly GroupDefinition[] = [
  {
    key: "todo",
    label: "To do",
    color: "#64748b",
    statuses: ["todo", "backlog", "new"],
  },
  {
    key: "inProgress",
    label: "In progress",
    color: "#3b82f6",
    statuses: ["in_progress", "doing", "active"],
  },
  {
    key: "blocked",
    label: "Blocked",
    color: "#f97316",
    statuses: ["blocked", "on_hold", "stuck"],
  },
  {
    key: "done",
    label: "Done",
    color: "#22c55e",
    statuses: ["done", "completed", "closed", "resolved"],
  },
];

const OTHER_COLOR = "#a855f7";

type AnalyticsResult = {
  statusCounts?: Record<string, number>;
  isLoading: boolean;
  error: string | null;
};

/**
 * Local implementation to satisfy build/type-checking within this isolated change.
 * In the full application, this is expected to be replaced by the real analytics hook.
 */
function useAnalytics(): AnalyticsResult {
  return {
    statusCounts: undefined,
    isLoading: false,
    error: null,
  };
}

function normalizeStatusKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, "_");
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

type ChartDatum = {
  key: StatusGroupKey;
  name: string;
  value: number;
  color: string;
};

function StatusTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;

  const item = payload[0];
  const name = typeof item?.name === "string" ? item.name : "";
  const value = toFiniteNumber(item?.value);

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(0, 0, 0, 0.08)",
        borderRadius: 8,
        padding: "8px 10px",
        boxShadow: "0 6px 18px rgba(0, 0, 0, 0.08)",
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: "rgba(0, 0, 0, 0.7)",
          marginBottom: 2,
        }}
      >
        {name}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>
        {value.toLocaleString()} tasks
      </div>
    </div>
  );
}

export type StatusPieChartProps = {
  title?: string;
  className?: string;
  /** Height of the chart area (excluding title/legend). */
  height?: number;
};

export function StatusPieChart({
  title = "Status distribution",
  className,
  height = 240,
}: StatusPieChartProps) {
  const { statusCounts, isLoading, error } = useAnalytics();

  const { chartData, total } = useMemo(() => {
    const normalizedCounts: Record<string, number> = {};
    for (const [rawKey, rawValue] of Object.entries(statusCounts ?? {})) {
      const key = normalizeStatusKey(rawKey);
      normalizedCounts[key] = (normalizedCounts[key] ?? 0) + toFiniteNumber(rawValue);
    }

    const groupKeyByStatus = new Map<string, Exclude<StatusGroupKey, "other">>();
    for (const group of GROUPS) {
      for (const status of group.statuses) {
        groupKeyByStatus.set(status, group.key);
      }
    }

    const totalsByGroup: Record<StatusGroupKey, number> = {
      todo: 0,
      inProgress: 0,
      blocked: 0,
      done: 0,
      other: 0,
    };

    for (const [status, value] of Object.entries(normalizedCounts)) {
      const groupKey = groupKeyByStatus.get(status);
      if (groupKey) {
        totalsByGroup[groupKey] += value;
      } else {
        totalsByGroup.other += value;
      }
    }

    const data: ChartDatum[] = [
      ...GROUPS.map((group) => ({
        key: group.key,
        name: group.label,
        value: totalsByGroup[group.key],
        color: group.color,
      })),
      {
        key: "other",
        name: "Other",
        value: totalsByGroup.other,
        color: OTHER_COLOR,
      },
    ].filter((d) => d.value > 0);

    const sum = data.reduce((acc, d) => acc + d.value, 0);
    return { chartData: data, total: sum };
  }, [statusCounts]);

  if (isLoading) {
    return (
      <div
        className={className}
        style={{
          padding: 16,
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 12,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{title}</div>
        <div
          style={{
            height,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(0,0,0,0.55)",
          }}
        >
          Loading status distribution…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={className}
        style={{
          padding: 16,
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 12,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{title}</div>
        <div style={{ color: "#b91c1c", fontSize: 13 }}>
          Failed to load status data: {error}
        </div>
      </div>
    );
  }

  if (!statusCounts || total === 0) {
    return (
      <div
        className={className}
        style={{
          padding: 16,
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 12,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{title}</div>
        <div
          style={{
            height,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(0,0,0,0.55)",
          }}
        >
          No status data available.
        </div>
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        padding: 16,
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 10,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 12, color: "rgba(0,0,0,0.6)" }}>
          {total.toLocaleString()} total
        </div>
      </div>

      <div style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<StatusTooltip />} />
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={2}
              stroke="rgba(0,0,0,0.08)"
              strokeWidth={1}
              isAnimationActive={false}
            >
              {chartData.map((entry) => (
                <Cell key={entry.key} fill={entry.color} />
              ))}
            </Pie>
            <Legend
              verticalAlign="bottom"
              align="center"
              iconType="circle"
              wrapperStyle={{ paddingTop: 12 }}
              formatter={(value) => (
                <span style={{ color: "rgba(0,0,0,0.75)", fontSize: 12 }}>{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default StatusPieChart;
