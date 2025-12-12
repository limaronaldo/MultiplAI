import { useState, useEffect, useCallback } from "react";
import { apiClient, ApiClientError } from "../services/apiClient";
import { POLLING_INTERVAL } from "../config/api";
import type { Job, JobCreateRequest } from "../types/api";

interface UseJobsResult {
  jobs: Job[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createJob: (request: JobCreateRequest) => Promise<Job | null>;
}

/**
 * Hook to fetch and manage jobs list
 * @param enablePolling - If true, poll for updates
 */
export function useJobs(enablePolling = true): UseJobsResult {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      setError(null);
      // Note: Backend doesn't have a list jobs endpoint yet
      // This is a placeholder that will work when added
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api"}/jobs`,
      );
      if (response.ok) {
        const data = await response.json();
        setJobs(Array.isArray(data) ? data : []);
      }
    } catch {
      // Silently fail - endpoint may not exist yet
      setJobs([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();

    if (enablePolling) {
      const interval = setInterval(fetchJobs, POLLING_INTERVAL.TASKS);
      return () => clearInterval(interval);
    }
  }, [fetchJobs, enablePolling]);

  const createJob = useCallback(
    async (request: JobCreateRequest): Promise<Job | null> => {
      try {
        setError(null);
        const response = await apiClient.createJob(request);
        // Refetch to get the new job in the list
        await fetchJobs();
        return response as Job;
      } catch (err) {
        const message =
          err instanceof ApiClientError ? err.message : "Failed to create job";
        setError(message);
        return null;
      }
    },
    [fetchJobs],
  );

  return { jobs, isLoading, error, refetch: fetchJobs, createJob };
}

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
