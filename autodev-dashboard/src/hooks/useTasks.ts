
interface UseJobResult {
  job: Job | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  startJob: () => Promise<void>;
  cancelJob: () => Promise<void>;
}

/**
 * Hook to fetch and manage a single job
 * @param jobId - The job ID to fetch
 * @param enablePolling - If true, poll while job is running
 */
export function useJob(
  jobId: string | null,
  enablePolling = true,
): UseJobResult {
  const [job, setJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJob = useCallback(async () => {
    if (!jobId) {
      setJob(null);
      setIsLoading(false);
      return;
    }

    try {
      setError(null);
      const data = await apiClient.getJob(jobId);
      setJob(data);
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.message : "Failed to fetch job";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [jobId]);

  // Poll only when job is running
  useEffect(() => {
    fetchJob();

    if (enablePolling && job?.status === "running") {
      const interval = setInterval(fetchJob, POLLING_INTERVAL.JOB);
      return () => clearInterval(interval);
    }
  }, [fetchJob, enablePolling, job?.status]);

  const startJob = useCallback(async () => {
    if (!jobId) return;
    try {
      await apiClient.startJob(jobId);
      await fetchJob(); // Refetch to get updated status
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.message : "Failed to start job";
      setError(message);
    }
  }, [jobId, fetchJob]);

  const cancelJob = useCallback(async () => {
    if (!jobId) return;
    try {
      await apiClient.cancelJob(jobId);
      await fetchJob(); // Refetch to get updated status
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.message : "Failed to cancel job";
      setError(message);
    }
  }, [jobId, fetchJob]);

  return { job, isLoading, error, refetch: fetchJob, startJob, cancelJob };
}
import { useState, useEffect, useCallback } from "react";
import { apiClient, ApiClientError } from "../services/apiClient";
import { POLLING_INTERVAL } from "../config/api";

interface UseHealthResult {
  isConnected: boolean;
  isLoading: boolean;
  lastChecked: Date | null;
  error: string | null;
}

/**
 * Hook to check backend health status
 * Updates every 30 seconds
 */
export function useHealth(): UseHealthResult {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkHealth = useCallback(async () => {
    try {
      setError(null);
      const health = await apiClient.getHealth();
      setIsConnected(health.status === "ok");
      setLastChecked(new Date());
    } catch (err) {
      setIsConnected(false);
      const message = err instanceof ApiClientError
        ? err.message
        : "Backend unreachable";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, POLLING_INTERVAL.HEALTH);
    return () => clearInterval(interval);
  }, [checkHealth]);

  return { isConnected, isLoading, lastChecked, error };
}
export { useJob } from "./useJobs";