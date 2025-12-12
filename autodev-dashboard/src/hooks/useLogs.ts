import { useState, useEffect, useCallback, useRef } from "react";
import { API_BASE_URL } from "../config/api";

export type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  taskId?: string;
  metadata?: Record<string, unknown>;
}

interface UseLogsOptions {
  maxEntries?: number;
  autoScroll?: boolean;
  filterLevel?: LogLevel | null;
  filterComponent?: string | null;
}

interface UseLogsResult {
  logs: LogEntry[];
  isConnected: boolean;
  error: string | null;
  clearLogs: () => void;
  pauseStream: () => void;
  resumeStream: () => void;
  isPaused: boolean;
}

/**
 * Hook to subscribe to real-time logs via SSE
 * Falls back to polling if SSE is not available
 */
export function useLogs(options: UseLogsOptions = {}): UseLogsResult {
  const {
    maxEntries = 500,
    filterLevel = null,
    filterComponent = null,
  } = options;

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const pausedRef = useRef(false);

  // Add log entry with filtering and max limit
  const addLog = useCallback((entry: LogEntry) => {
    if (pausedRef.current) return;

    // Apply filters
    if (filterLevel && entry.level !== filterLevel) return;
    if (filterComponent && entry.component !== filterComponent) return;

    setLogs(prev => {
      const newLogs = [...prev, entry];
      // Keep only last maxEntries
      if (newLogs.length > maxEntries) {
        return newLogs.slice(-maxEntries);
      }
      return newLogs;
    });
  }, [filterLevel, filterComponent, maxEntries]);

  // Connect to SSE endpoint
  useEffect(() => {
    const connectSSE = () => {
      try {
        const eventSource = new EventSource(`${API_BASE_URL}/logs/stream`);
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
          setIsConnected(true);
          setError(null);
        };

        eventSource.onmessage = (event) => {
          try {
            const entry = JSON.parse(event.data) as LogEntry;
            addLog(entry);
          } catch {
            console.error("Failed to parse log entry:", event.data);
          }
        };

        eventSource.onerror = () => {
          setIsConnected(false);
          setError("Connection lost. Reconnecting...");
          eventSource.close();
          // Reconnect after 3 seconds
          setTimeout(connectSSE, 3000);
        };
      } catch {
        setError("Failed to connect to log stream");
        setIsConnected(false);
      }
    };

    connectSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [addLog]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const pauseStream = useCallback(() => {
    pausedRef.current = true;
    setIsPaused(true);
  }, []);

  const resumeStream = useCallback(() => {
    pausedRef.current = false;
    setIsPaused(false);
  }, []);

  return {
    logs,
    isConnected,
    error,
    clearLogs,
    pauseStream,
    resumeStream,
    isPaused,
  };
}

/**
 * Format log timestamp for display
 */
export function formatLogTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * Get color class for log level
 */
export function getLogLevelColor(level: LogLevel): string {
  switch (level) {
    case "ERROR":
      return "text-red-400";
    case "WARN":
      return "text-yellow-400";
    case "INFO":
      return "text-blue-400";
    case "DEBUG":
      return "text-slate-400";
    default:
      return "text-slate-300";
  }
}
