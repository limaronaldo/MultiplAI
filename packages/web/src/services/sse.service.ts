export interface SSEEvent {
  type: "connected" | "event";
  id?: string;
  taskId?: string;
  eventType?: string;
  agent?: string;
  message?: string;
  timestamp?: string;
  level?: "info" | "warn" | "error" | "success";
  tokensUsed?: number;
  durationMs?: number;
}

export type SSEEventHandler = (event: SSEEvent) => void;

export class SSEService {
  private eventSource: EventSource | null = null;
  private handlers: Set<SSEEventHandler> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private taskId?: string;

  constructor() {
    // Bind methods for event listeners
    this.handleMessage = this.handleMessage.bind(this);
    this.handleError = this.handleError.bind(this);
    this.handleOpen = this.handleOpen.bind(this);
  }

  connect(taskId?: string) {
    // Disconnect existing connection if any
    this.disconnect();

    this.taskId = taskId;
    const url = taskId
      ? `/api/logs/stream?taskId=${encodeURIComponent(taskId)}`
      : "/api/logs/stream";

    try {
      this.eventSource = new EventSource(url);
      this.eventSource.onmessage = this.handleMessage;
      this.eventSource.onerror = this.handleError;
      this.eventSource.onopen = this.handleOpen;
    } catch (error) {
      console.error("[SSE] Failed to create EventSource:", error);
    }
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.reconnectAttempts = 0;
  }

  subscribe(handler: SSEEventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  private handleOpen() {
    console.log("[SSE] Connected");
    this.reconnectAttempts = 0;
  }

  private handleMessage(event: MessageEvent) {
    try {
      const data: SSEEvent = JSON.parse(event.data);
      this.notifyHandlers(data);
    } catch (error) {
      console.error("[SSE] Failed to parse event:", error);
    }
  }

  private handleError(event: Event) {
    console.error("[SSE] Connection error:", event);

    if (this.eventSource?.readyState === EventSource.CLOSED) {
      this.attemptReconnect();
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("[SSE] Max reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(
      `[SSE] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    setTimeout(() => {
      this.connect(this.taskId);
    }, delay);
  }

  private notifyHandlers(event: SSEEvent) {
    this.handlers.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        console.error("[SSE] Handler error:", error);
      }
    });
  }

  get isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }
}

// Singleton instance
export const sseService = new SSEService();
