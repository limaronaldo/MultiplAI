import { useMemo } from "react";
import { useTasks } from "./useTasks";
import type { Task, TaskStatus } from "../types/api";

interface StatusCount {
  status: TaskStatus;
  count: number;
  percentage: number;
}

interface ActivityData {
  date: string;
  tasks: number;
  prs: number;
}

interface AnalyticsData {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  prsCreated: number;
  successRate: number;
  avgAttempts: number;
  statusDistribution: StatusCount[];
  activityByDay: ActivityData[];
  recentActivity: Task[];
}

interface UseAnalyticsResult {
  data: AnalyticsData | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook to compute analytics from task data
 * Derives all metrics from the tasks list
 */
export function useAnalytics(): UseAnalyticsResult {
  const { tasks, isLoading, error } = useTasks();

  const data = useMemo<AnalyticsData | null>(() => {
    if (!tasks.length) return null;

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === "COMPLETED").length;
    const failedTasks = tasks.filter(t => t.status === "FAILED").length;
    const prsCreated = tasks.filter(t => t.pr_url).length;

    // Success rate (completed / (completed + failed))
    const finishedTasks = completedTasks + failedTasks;
    const successRate = finishedTasks > 0
      ? Math.round((completedTasks / finishedTasks) * 100)
      : 0;

    // Average attempts for completed tasks
    const completedTasksWithAttempts = tasks.filter(t => t.status === "COMPLETED");
    const avgAttempts = completedTasksWithAttempts.length > 0
      ? completedTasksWithAttempts.reduce((sum, t) => sum + t.attempt_count, 0) / completedTasksWithAttempts.length
      : 0;

    // Status distribution
    const statusCounts = new Map<TaskStatus, number>();
    tasks.forEach(t => {
      statusCounts.set(t.status, (statusCounts.get(t.status) || 0) + 1);
    });

    const statusDistribution: StatusCount[] = Array.from(statusCounts.entries())
      .map(([status, count]) => ({
        status,
        count,
        percentage: Math.round((count / totalTasks) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    // Activity by day (last 7 days)
    const activityMap = new Map<string, { tasks: number; prs: number }>();
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      activityMap.set(dateStr, { tasks: 0, prs: 0 });
    }

    tasks.forEach(t => {
      const dateStr = t.created_at.split("T")[0];
      if (activityMap.has(dateStr)) {
        const entry = activityMap.get(dateStr)!;
        entry.tasks++;
        if (t.pr_url) entry.prs++;
      }
    });

    const activityByDay: ActivityData[] = Array.from(activityMap.entries())
      .map(([date, data]) => ({ date, ...data }));

    // Recent activity (last 10 tasks by updated_at)
    const recentActivity = [...tasks]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 10);

    return {
      totalTasks,
      completedTasks,
      failedTasks,
      prsCreated,
      successRate,
      avgAttempts: Math.round(avgAttempts * 10) / 10,
      statusDistribution,
      activityByDay,
      recentActivity,
    };
  }, [tasks]);

  return { data, isLoading, error };
}
