import { useCallback, useEffect, useRef, useState } from "react";

export interface LogEntry {
  timestamp?: string;
  level?: string;
  message?: string;
  [key: string]: unknown;
}

export type ConnectionStatus = "connected" | "disconnected" | "reconnecting";

export interface UseLogStreamResult {
  logs: LogEntry[];
  connectionStatus: ConnectionStatus;
  clearLogs: () => void;
}

const MAX_LOG_ENTRIES = 500;
const SSE_ENDPOINT = "/api/logs/stream";

function safeParseLogEntry(data: string): LogEntry {
  try {
    const parsed: unknown = JSON.parse(data);
    if (parsed && typeof parsed === "object") {
      return parsed as LogEntry;
    }
    return { message: String(parsed) };
  } catch {
    return { message: data };
  }
}

export function useLogStream(): UseLogStreamResult {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    "disconnected",
  );

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const retryAttemptRef = useRef(0);
  const isMountedRef = useRef(false);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    const clearReconnectTimeout = () => {
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    const closeEventSource = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (!isMountedRef.current) return;
      if (reconnectTimeoutRef.current !== null) return;

      if (isMountedRef.current) {
        setConnectionStatus("reconnecting");
      }

      const attempt = retryAttemptRef.current;
      const baseDelayMs = 500;
      const maxDelayMs = 30_000;
      const delayMs = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));

      reconnectTimeoutRef.current = window.setTimeout(() => {
        reconnectTimeoutRef.current = null;
        connect();
      }, delayMs);

      retryAttemptRef.current = attempt + 1;
    };

    const connect = () => {
      if (!isMountedRef.current) return;

      clearReconnectTimeout();
      closeEventSource();

      let es: EventSource;
      try {
        es = new EventSource(SSE_ENDPOINT);
      } catch {
        scheduleReconnect();
        return;
      }

      eventSourceRef.current = es;

      es.onopen = () => {
        retryAttemptRef.current = 0;
        if (isMountedRef.current) {
          setConnectionStatus("connected");
        }
      };

      es.onmessage = (event) => {
        const entry = safeParseLogEntry(event.data);
        setLogs((prev) => {
          const next = [...prev, entry];
          if (next.length <= MAX_LOG_ENTRIES) return next;
          return next.slice(next.length - MAX_LOG_ENTRIES);
        });
      };

      es.onerror = () => {
        // EventSource will often attempt internal retries, but we enforce our own
        // reconnect loop to guarantee predictable status + backoff behavior.
        closeEventSource();
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      isMountedRef.current = false;
      clearReconnectTimeout();
      closeEventSource();
      setConnectionStatus("disconnected");
    };
  }, []);

  return {
    logs,
    connectionStatus,
    clearLogs,
  };
}