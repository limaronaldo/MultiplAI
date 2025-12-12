
import React, { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useTasks } from "../../hooks";

function getDayName(date: Date): string {
  // e.g. Mon, Tue, Wed
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
}

function toDateKey(date: Date): string {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getLastNDays(n: number): Date[] {
  const days: Date[] = [];
  const today = new Date();
  const base = new Date(today);
  base.setHours(0, 0, 0, 0);

  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    days.push(d);
  }

  return days;
}

interface DayData {
  date: string;
  day: string;
  completed: number;
  failed: number;
}

function getTaskStatus(task: unknown): "completed" | "failed" | null {
  const t = task as any;
  const raw = (t?.status ?? t?.state ?? t?.result)?.toString?.()?.toLowerCase?.();

  if (raw === "completed" || raw === "complete" || raw === "done" || raw === "success") {
    return "completed";
  }
  if (raw === "failed" || raw === "failure" || raw === "error") {
    return "failed";
  }

  // Some APIs may model success as a boolean.
  if (typeof t?.success === "boolean") {
    return t.success ? "completed" : "failed";
  }

  return null;
}

function getTaskDateForStatus(task: unknown, status: "completed" | "failed"): Date | null {
  const t = task as any;
  const rawDate =
    (status === "completed"
      ? t?.completedAt ?? t?.finishedAt ?? t?.completed_at
      : t?.failedAt ?? t?.failed_at) ??
    t?.updatedAt ??
    t?.updated_at ??
    t?.createdAt ??
    t?.created_at ??
    t?.timestamp;

  if (!rawDate) return null;

  const d = new Date(rawDate);
  if (Number.isNaN(d.getTime())) return null;

  return d;
}

function ActivityTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;

  const completed = payload.find((p: any) => p?.dataKey === "completed")?.value ?? 0;
  const failed = payload.find((p: any) => p?.dataKey === "failed")?.value ?? 0;

  return (
    <div className="rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 shadow-lg">
      <div className="mb-1 font-medium text-slate-100">{label}</div>
      <div className="flex items-center justify-between gap-6">
        <span className="text-slate-300">Completed</span>
        <span className="font-semibold" style={{ color: "#22c55e" }}>
          {completed}
        </span>
      </div>
      <div className="flex items-center justify-between gap-6">
        <span className="text-slate-300">Failed</span>
        <span className="font-semibold" style={{ color: "#ef4444" }}>
          {failed}
        </span>
      </div>
    </div>
  );
}

export function ActivityChart() {
  const { data: tasks, isLoading, error } = useTasks();

  const chartData = useMemo<DayData[]>(() => {
    const days = getLastNDays(7);
    const base: DayData[] = days.map((d) => ({
      date: toDateKey(d),
      day: getDayName(d),
      completed: 0,
      failed: 0,
    }));

    const byDate = new Map<string, DayData>();
    for (const d of base) byDate.set(d.date, d);

    const list = Array.isArray(tasks) ? tasks : [];
    for (const task of list) {
      const status = getTaskStatus(task);
      if (!status) continue;

      const date = getTaskDateForStatus(task, status);
      if (!date) continue;

      const key = toDateKey(date);
      const slot = byDate.get(key);
      if (!slot) continue;

      if (status === "completed") slot.completed += 1;
      if (status === "failed") slot.failed += 1;
    }

    return base;
  }, [tasks]);

  const errorMessage =
    typeof error === "string"
      ? error
      : (error as any)?.message
        ? String((error as any).message)
        : error
          ? "Failed to load activity"
          : null;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-200">Activity (Last 7 days)</h2>
      </div>

      {isLoading ? (
        <div className="h-[260px] w-full animate-pulse rounded-md border border-slate-800 bg-slate-950/30 p-4">
          <div className="mb-4 h-3 w-28 rounded bg-slate-800" />
          <div className="flex h-[200px] items-end gap-3">
            <div className="h-[40%] w-6 rounded bg-slate-800" />
            <div className="h-[55%] w-6 rounded bg-slate-800" />
            <div className="h-[30%] w-6 rounded bg-slate-800" />
            <div className="h-[70%] w-6 rounded bg-slate-800" />
            <div className="h-[45%] w-6 rounded bg-slate-800" />
            <div className="h-[60%] w-6 rounded bg-slate-800" />
            <div className="h-[35%] w-6 rounded bg-slate-800" />
          </div>
        </div>
      ) : errorMessage ? (
        <div className="rounded-md border border-slate-800 bg-slate-950/30 p-4">
          <p className="text-sm text-red-400">{errorMessage}</p>
        </div>
      ) : (
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={{ stroke: "#1f2937" }}
                tick={{ fill: "#cbd5e1", fontSize: 12 }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={{ stroke: "#1f2937" }}
                tick={{ fill: "#cbd5e1", fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
                content={<ActivityTooltip />}
              />
              <Bar dataKey="completed" stackId="a" fill="#22c55e" radius={[3, 3, 0, 0]} />
              <Bar dataKey="failed" stackId="a" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default ActivityChart;