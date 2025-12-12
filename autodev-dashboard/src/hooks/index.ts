import { useEffect, useState } from "react";

export interface Task {
  id?: string;
  status?: string;
  state?: string;
  result?: string;
  success?: boolean;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  failedAt?: string;
  [key: string]: unknown;
}

export interface UseTasksResult {
  data: Task[];
  isLoading: boolean;
  error: string | null;
}

export function useTasks(): UseTasksResult {
  const [data, setData] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function run() {
      try {
        setIsLoading(true);
        setError(null);

        const res = await fetch("/api/tasks", { signal: controller.signal });
        if (!res.ok) {
          throw new Error(`Request failed: ${res.status}`);
        }

        const json = (await res.json()) as unknown;
        const tasks = Array.isArray(json) ? (json as Task[]) : [];
        setData(tasks);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setError(e?.message ? String(e.message) : "Failed to load tasks");
        setData([]);
      } finally {
        setIsLoading(false);
      }
    }

    void run();

    return () => {
      controller.abort();
    };
  }, []);

  return { data, isLoading, error };
}