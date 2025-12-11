/**
 * API Client for AutoDev Dashboard
 * Provides typed functions for communicating with the AutoDev backend API
 */

import { API_BASE_URL, REQUEST_TIMEOUT } from '../config';
import {
  HealthResponse,
  Task,
  TaskListResponse,
  TaskProcessResponse,
  Job,
  JobCreateRequest,
  JobCreateResponse,
  PendingReview,
  PendingReviewsResponse,
} from '../types/api';

/**
 * Custom error class for API client errors
 */
export class ApiClientError extends Error {
  public readonly statusCode: number | undefined;
  public readonly originalError: Error | undefined;

  constructor(
    message: string,
    statusCode?: number,
    originalError?: Error
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
    this.originalError = originalError;

    // Maintains proper stack trace for where error was thrown (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiClientError);
    }
  }
}

/**
 * Fetch with timeout support using AbortController
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout: number = REQUEST_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiClientError(
        `Request timeout after ${timeout}ms`,
        undefined,
        error
      );
    }
    throw new ApiClientError(
      'Network error occurred',
      undefined,
      error instanceof Error ? error : undefined
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Handle HTTP response and parse JSON
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = `HTTP error ${response.status}`;
    try {
      const errorBody = await response.json();
      if (errorBody.error) {
        errorMessage = errorBody.error;
      } else if (errorBody.message) {
        errorMessage = errorBody.message;
      }
    } catch {
      // Failed to parse error body, use default message
    }
    throw new ApiClientError(errorMessage, response.status);
  }

  try {
    return await response.json();
  } catch (error) {
    throw new ApiClientError(
      'Failed to parse response JSON',
      response.status,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Default request headers
 */
const defaultHeaders: HeadersInit = {
  'Content-Type': 'application/json',
};

/**
 * API Client with all endpoint methods
 */
export const apiClient = {
  /** Check API health status */
  async getHealth(): Promise<HealthResponse> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/health`);
    return handleResponse<HealthResponse>(response);
  },

  /** Get list of all tasks */
  async getTasks(): Promise<TaskListResponse> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/tasks`);
    return handleResponse<TaskListResponse>(response);
  },

  /** Get a specific task by ID */
  async getTask(taskId: string): Promise<Task> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/tasks/${taskId}`);
    return handleResponse<Task>(response);
  },

  /** Process a task (trigger AI processing) */
  async processTask(taskId: string): Promise<TaskProcessResponse> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/tasks/${taskId}/process`, {
      method: 'POST',
      headers: defaultHeaders,
    });
    return handleResponse<TaskProcessResponse>(response);
  },

  /** Create a new job */
  async createJob(request: JobCreateRequest): Promise<JobCreateResponse> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/jobs`, {
      method: 'POST',
      headers: defaultHeaders,
      body: JSON.stringify(request),
    });
    return handleResponse<JobCreateResponse>(response);
  },

  /** Get a specific job by ID */
  async getJob(jobId: string): Promise<Job> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/jobs/${jobId}`);
    return handleResponse<Job>(response);
  },

  /** Start a job */
  async startJob(jobId: string): Promise<Job> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/jobs/${jobId}/start`, {
      method: 'POST',
      headers: defaultHeaders,
    });