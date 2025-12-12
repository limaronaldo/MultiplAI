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
