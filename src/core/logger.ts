import * as fs from "fs";
import * as path from "path";

/**
 * Structured Logger for MultiplAI
 *
 * Provides contextual logging with task ID and agent tracking.
 * Supports console and file output with consistent formatting.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

interface LoggerOptions {
  taskId: string;
  agent?: string;
  logToFile?: boolean;
  logDir?: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "\x1b[36m", // cyan
  info: "\x1b[32m", // green
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
};

const RESET = "\x1b[0m";

function getTimestamp(): string {
  return new Date().toISOString();
}

function formatLogMessage(
  level: LogLevel,
  taskId: string,
  agent: string,
  message: string,
  data?: Record<string, unknown>
): string {
  const timestamp = getTimestamp();
  const levelStr = level.toUpperCase().padEnd(5);
  const agentStr = agent.padEnd(12);
  const taskStr = taskId.substring(0, 8);

  let formatted = `[${timestamp}] [${levelStr}] [${taskStr}] [${agentStr}] ${message}`;

  if (data && Object.keys(data).length > 0) {
    formatted += ` ${JSON.stringify(data)}`;
  }

  return formatted;
}

function formatConsoleMessage(
  level: LogLevel,
  taskId: string,
  agent: string,
  message: string,
  data?: Record<string, unknown>
): string {
  const timestamp = getTimestamp();
  const color = LEVEL_COLORS[level];
  const levelStr = level.toUpperCase().padEnd(5);
  const agentStr = agent.padEnd(12);
  const taskStr = taskId.substring(0, 8);

  let formatted = `${color}[${timestamp}] [${levelStr}]${RESET} [${taskStr}] [${agentStr}] ${message}`;

  if (data && Object.keys(data).length > 0) {
    formatted += ` ${JSON.stringify(data)}`;
  }

  return formatted;
}

class TaskLogger implements Logger {
  private taskId: string;
  private agent: string;
  private logToFile: boolean;
  private logDir: string;
  private minLevel: LogLevel;

  constructor(options: LoggerOptions) {
    this.taskId = options.taskId;
    this.agent = options.agent || "system";
    this.logToFile = options.logToFile ?? process.env.LOG_TO_FILE === "true";
    this.logDir = options.logDir || path.join(process.cwd(), "logs");
    this.minLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

    if (this.logToFile) {
      this.ensureLogDir();
    }
  }

  private ensureLogDir(): void {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch {
      // Silently fail - don't break the flow
      this.logToFile = false;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel];
  }

  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    try {
      // Console output with colors
      const consoleMsg = formatConsoleMessage(
        level,
        this.taskId,
        this.agent,
        message,
        data
      );

      switch (level) {
        case "debug":
          console.debug(consoleMsg);
          break;
        case "info":
          console.info(consoleMsg);
          break;
        case "warn":
          console.warn(consoleMsg);
          break;
        case "error":
          console.error(consoleMsg);
          break;
      }

      // File output without colors
      if (this.logToFile) {
        const fileMsg = formatLogMessage(
          level,
          this.taskId,
          this.agent,
          message,
          data
        );
        const logFile = path.join(
          this.logDir,
          `${new Date().toISOString().split("T")[0]}.log`
        );

        fs.appendFileSync(logFile, fileMsg + "\n");
      }
    } catch {
      // Never let logging break the application flow
    }
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log("debug", message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log("info", message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log("warn", message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log("error", message, data);
  }
}

/**
 * Creates a contextual logger for a specific task and agent
 *
 * @param taskId - The task ID for context
 * @param agent - Optional agent name (defaults to "system")
 * @returns Logger instance with debug, info, warn, error methods
 *
 * @example
 * const logger = createTaskLogger("task-123", "orchestrator");
 * logger.info("Processing task");
 * logger.error("Task failed", { reason: "timeout" });
 */
export function createTaskLogger(taskId: string, agent?: string): Logger {
  return new TaskLogger({ taskId, agent });
}

/**
 * Creates a system-level logger (not tied to a specific task)
 *
 * @param agent - The agent/component name
 * @returns Logger instance
 */
export function createSystemLogger(agent: string): Logger {
  return new TaskLogger({ taskId: "system", agent });
}
