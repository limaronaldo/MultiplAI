/**
 * Retry utilities with exponential backoff
 *
 * Provides configurable retry logic for external API calls and webhook processing.
 */

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Base delay in ms (default: 1000) */
  baseDelayMs: number;
  /** Maximum delay in ms (default: 30000) */
  maxDelayMs: number;
  /** Jitter factor 0-1 to randomize delays (default: 0.1) */
  jitterFactor: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier: number;
  /** Optional function to determine if error is retryable */
  isRetryable?: (error: unknown) => boolean;
  /** Optional callback on each retry */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.1,
  backoffMultiplier: 2,
};

/**
 * Calculate delay for a given attempt with exponential backoff and jitter
 */
export function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig,
): number {
  const exponentialDelay =
    config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Add jitter
  const jitter = cappedDelay * config.jitterFactor * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(cappedDelay + jitter));
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Default retryable error checker
 * Retries on network errors, timeouts, and 5xx errors
 */
export function isDefaultRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Network errors
    if (
      message.includes("econnreset") ||
      message.includes("econnrefused") ||
      message.includes("etimedout") ||
      message.includes("socket hang up") ||
      message.includes("network") ||
      message.includes("timeout")
    ) {
      return true;
    }

    // Check for HTTP status in error
    if ("status" in error) {
      const status = (error as any).status;
      // Retry on 5xx, 429 (rate limit), 408 (timeout)
      if (status >= 500 || status === 429 || status === 408) {
        return true;
      }
    }
  }

  return false;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: unknown;
  attempts: number;
  totalDelayMs: number;
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
): Promise<RetryResult<T>> {
  const fullConfig: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
    isRetryable: config.isRetryable ?? isDefaultRetryable,
  };

  let lastError: unknown;
  let totalDelayMs = 0;

  for (let attempt = 0; attempt <= fullConfig.maxRetries; attempt++) {
    try {
      const data = await fn();
      return {
        success: true,
        data,
        attempts: attempt + 1,
        totalDelayMs,
      };
    } catch (error) {
      lastError = error;

      // Check if we should retry
      const isLastAttempt = attempt >= fullConfig.maxRetries;
      const shouldRetry = !isLastAttempt && fullConfig.isRetryable!(error);

      if (!shouldRetry) {
        break;
      }

      // Calculate and apply delay
      const delayMs = calculateBackoffDelay(attempt, fullConfig);
      totalDelayMs += delayMs;

      // Notify about retry
      fullConfig.onRetry?.(attempt + 1, error, delayMs);

      console.log(
        `[Retry] Attempt ${attempt + 1}/${fullConfig.maxRetries + 1} failed, ` +
          `retrying in ${delayMs}ms...`,
      );

      await sleep(delayMs);
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: fullConfig.maxRetries + 1,
    totalDelayMs,
  };
}

/**
 * Wrap a function to automatically retry on failure
 */
export function createRetryWrapper<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  config: Partial<RetryConfig> = {},
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    const result = await withRetry(() => fn(...args), config);
    if (result.success) {
      return result.data!;
    }
    throw result.error;
  };
}

/**
 * GitHub-specific retry configuration
 * More aggressive retries for rate limiting
 */
export const GITHUB_RETRY_CONFIG: Partial<RetryConfig> = {
  maxRetries: 5,
  baseDelayMs: 2000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
  isRetryable: (error: unknown) => {
    if (isDefaultRetryable(error)) return true;

    // GitHub-specific: retry on rate limit
    if (error instanceof Error && "status" in error) {
      const status = (error as any).status;
      if (status === 403) {
        const message = error.message.toLowerCase();
        if (message.includes("rate limit") || message.includes("abuse")) {
          return true;
        }
      }
    }

    return false;
  },
  onRetry: (attempt, error, delayMs) => {
    console.log(
      `[GitHub Retry] Attempt ${attempt} failed: ${error instanceof Error ? error.message : "Unknown error"}. ` +
        `Waiting ${delayMs}ms before retry...`,
    );
  },
};

/**
 * LLM-specific retry configuration
 * Handles rate limits and overloaded errors
 */
export const LLM_RETRY_CONFIG: Partial<RetryConfig> = {
  maxRetries: 3,
  baseDelayMs: 5000,
  maxDelayMs: 120000,
  backoffMultiplier: 3,
  isRetryable: (error: unknown) => {
    if (isDefaultRetryable(error)) return true;

    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      // Anthropic/OpenAI specific errors
      if (
        message.includes("overloaded") ||
        message.includes("rate limit") ||
        message.includes("capacity") ||
        message.includes("too many requests")
      ) {
        return true;
      }
    }

    return false;
  },
};
