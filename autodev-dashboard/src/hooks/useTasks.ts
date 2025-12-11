import { useState, useEffect, useCallback } from "react";
import { apiClient, ApiClientError } from "../services/apiClient";
import { POLLING_INTERVAL } from "../config/api";
import type { Task } from "../types/api";

interface UseTasksResult {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch and poll task list
 * @param enablePolling - If true, refetch every 10 seconds
 */
export function useTasks(enablePolling = true): UseTasksResult {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      setError(null);
      const data = await apiClient.getTasks();
      setTasks(data);
    } catch (err) {
      const message = err instanceof ApiClientError
        ? err.message
        : "Failed to fetch tasks";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();

    if (enablePolling) {
      const interval = setInterval(fetchTasks, POLLING_INTERVAL.TASKS);
      return () => clearInterval(interval);
    }
  }, [fetchTasks, enablePolling]);

  return { tasks, isLoading, error, refetch: fetchTasks };
}

interface UseTaskResult {
  task: Task | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch a single task by ID
 * @param taskId - The task ID to fetch
 * @param enablePolling - If true, refetch every 5 seconds
 */
export function useTask(taskId: string | null, enablePolling = false): UseTaskResult {
  const [task, setTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTask = useCallback(async () => {
    if (!taskId) {
      setTask(null);
      setIsLoading(false);
      return;
    }

    try {
      setError(null);
      const data = await apiClient.getTask(taskId);
      setTask(data);
    } catch (err) {
      const message = err instanceof ApiClientError
        ? err.message
        : "Failed to fetch task";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchTask();

    if (enablePolling && taskId) {
      const interval = setInterval(fetchTask, POLLING_INTERVAL.TASK_DETAIL);
      return () => clearInterval(interval);
    }
  }, [fetchTask, enablePolling, taskId]);

  return { task, isLoading, error, refetch: fetchTask };
}
