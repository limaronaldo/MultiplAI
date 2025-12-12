import { useMemo } from "react";
import { useTasks } from "./useTasks";
import type { TaskStatus } from "../types/api";

export interface Analytics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  prsCreated: number;
  successRate: number;
  avgAttempts: number;
  statusCounts: Record<TaskStatus, number>;
}

export interface UseAnalyticsResult extends Analytics {
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook to compute analytics from task data
 * Derives all metrics from the tasks list
 */
export function useAnalytics(): UseAnalyticsResult {
  const { tasks, isLoading, error } = useTasks(false);

  const analytics = useMemo<Analytics>(() => {
    const totalTasks = tasks.length;

    const statusCounts = tasks.reduce(
      (acc, task) => {
        acc[task.status] = (acc[task.status] ?? 0) + 1;
        return acc;
      },
      {} as Record<TaskStatus, number>,
    );

    const completedTasks = statusCounts["COMPLETED" as TaskStatus] ?? 0;
    const failedTasks = statusCounts["FAILED" as TaskStatus] ?? 0;

    const prsCreated = tasks.reduce(
      (count, task) => (task.pr_url ? count + 1 : count),
      0,
    );

    const finishedTasks = completedTasks + failedTasks;
    const successRate =
      finishedTasks > 0
        ? Math.round((completedTasks / finishedTasks) * 100)
        : 0;

    const avgAttemptsRaw =
      totalTasks > 0
        ? tasks.reduce((sum, task) => sum + task.attempt_count, 0) / totalTasks
        : 0;

    const avgAttempts = Math.round(avgAttemptsRaw * 10) / 10;

    return {
      totalTasks,
      completedTasks,
      failedTasks,
      prsCreated,
      successRate,
      avgAttempts,
      statusCounts,
    };
  }, [tasks]);

  return { ...analytics, isLoading, error };
}
