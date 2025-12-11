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
