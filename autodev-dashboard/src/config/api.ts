// API Configuration

// Base URL for API requests - uses environment variable or defaults to localhost
export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8080";

// Request timeout in milliseconds
export const REQUEST_TIMEOUT = 10000;

// Polling intervals for real-time updates (in milliseconds)
export const POLLING_INTERVAL = {
  TASKS: 10000, // Task list polling
  TASK_DETAIL: 5000, // Single task detail polling
  JOB: 3000, // Job status polling (faster for running jobs)
  HEALTH: 30000, // Health check polling
};
