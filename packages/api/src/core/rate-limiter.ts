/**
 * Rate Limiter Middleware
 * Issue #336 - Protects API endpoints from abuse
 */

export interface RateLimitConfig {
  /** Maximum requests per window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Key prefix for storage */
  keyPrefix?: string;
  /** Skip rate limiting for specific paths */
  skipPaths?: string[];
  /** Custom key extractor (default: IP address) */
  keyExtractor?: (req: Request) => string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  limit: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store (for single instance deployments)
const store = new Map<string, RateLimitEntry>();

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  }
}, 60000); // Every minute

/**
 * Default configuration by endpoint type
 */
export const RATE_LIMIT_CONFIGS = {
  /** Webhook endpoints - higher limits */
  webhook: {
    maxRequests: parseInt(process.env.RATE_LIMIT_WEBHOOK_MAX || "100", 10),
    windowMs: parseInt(process.env.RATE_LIMIT_WEBHOOK_WINDOW || "60000", 10),
    keyPrefix: "webhook:",
  },
  /** API query endpoints - moderate limits */
  api: {
    maxRequests: parseInt(process.env.RATE_LIMIT_API_MAX || "60", 10),
    windowMs: parseInt(process.env.RATE_LIMIT_API_WINDOW || "60000", 10),
    keyPrefix: "api:",
  },
  /** Heavy operations (jobs, processing) - lower limits */
  heavy: {
    maxRequests: parseInt(process.env.RATE_LIMIT_HEAVY_MAX || "10", 10),
    windowMs: parseInt(process.env.RATE_LIMIT_HEAVY_WINDOW || "60000", 10),
    keyPrefix: "heavy:",
  },
  /** Default fallback */
  default: {
    maxRequests: parseInt(process.env.RATE_LIMIT_DEFAULT_MAX || "30", 10),
    windowMs: parseInt(process.env.RATE_LIMIT_DEFAULT_WINDOW || "60000", 10),
    keyPrefix: "default:",
  },
};

/**
 * Extract client IP from request
 */
export function getClientIp(req: Request): string {
  // Check common proxy headers
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Fly.io specific header
  const flyClientIp = req.headers.get("fly-client-ip");
  if (flyClientIp) {
    return flyClientIp;
  }

  // Fallback to unknown
  return "unknown";
}

/**
 * Check rate limit for a given key
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const fullKey = `${config.keyPrefix || ""}${key}`;

  let entry = store.get(fullKey);

  // Create new entry or reset if window expired
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 0,
      resetAt: now + config.windowMs,
    };
  }

  // Increment count
  entry.count++;
  store.set(fullKey, entry);

  const allowed = entry.count <= config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - entry.count);

  return {
    allowed,
    remaining,
    resetAt: new Date(entry.resetAt),
    limit: config.maxRequests,
  };
}

/**
 * Create rate limit response headers
 */
export function createRateLimitHeaders(result: RateLimitResult): Headers {
  const headers = new Headers();
  headers.set("X-RateLimit-Limit", result.limit.toString());
  headers.set("X-RateLimit-Remaining", result.remaining.toString());
  headers.set("X-RateLimit-Reset", Math.floor(result.resetAt.getTime() / 1000).toString());

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt.getTime() - Date.now()) / 1000);
    headers.set("Retry-After", retryAfter.toString());
  }

  return headers;
}

/**
 * Create 429 Too Many Requests response
 */
export function createRateLimitResponse(result: RateLimitResult): Response {
  const headers = createRateLimitHeaders(result);
  headers.set("Content-Type", "application/json");

  const retryAfter = Math.ceil((result.resetAt.getTime() - Date.now()) / 1000);

  return new Response(
    JSON.stringify({
      error: "Too Many Requests",
      message: `Rate limit exceeded. Please retry after ${retryAfter} seconds.`,
      retryAfter,
      limit: result.limit,
      resetAt: result.resetAt.toISOString(),
    }),
    {
      status: 429,
      headers,
    }
  );
}

/**
 * Determine rate limit config based on request path
 */
export function getConfigForPath(path: string): RateLimitConfig {
  // Webhook endpoints
  if (path.startsWith("/webhooks/")) {
    return RATE_LIMIT_CONFIGS.webhook;
  }

  // Heavy operations
  if (
    path.includes("/process") ||
    path.includes("/run") ||
    path.startsWith("/api/jobs") ||
    path.startsWith("/api/batch")
  ) {
    return RATE_LIMIT_CONFIGS.heavy;
  }

  // API endpoints
  if (path.startsWith("/api/")) {
    return RATE_LIMIT_CONFIGS.api;
  }

  // Default
  return RATE_LIMIT_CONFIGS.default;
}

/**
 * Paths to skip rate limiting
 */
const SKIP_PATHS = [
  "/",
  "/api/health",
  "/api/logs/stream", // SSE endpoint
  "/api/ws/tasks", // WebSocket endpoint
];

/**
 * Rate limiting middleware
 * Returns null if allowed, Response if rate limited
 */
export function rateLimitMiddleware(req: Request): Response | null {
  // Check if rate limiting is disabled
  if (process.env.RATE_LIMIT_ENABLED === "false") {
    return null;
  }

  const url = new URL(req.url);
  const path = url.pathname;

  // Skip certain paths
  if (SKIP_PATHS.some((p) => path === p || path.startsWith(p + "/"))) {
    return null;
  }

  // Get appropriate config
  const config = getConfigForPath(path);

  // Get client identifier
  const clientIp = getClientIp(req);
  const key = `${clientIp}:${path}`;

  // Check rate limit
  const result = checkRateLimit(key, config);

  if (!result.allowed) {
    console.warn(
      `[RateLimit] Exceeded for ${clientIp} on ${path} (${result.limit} req/${config.windowMs}ms)`
    );
    return createRateLimitResponse(result);
  }

  return null;
}

/**
 * Add rate limit headers to a response
 */
export function addRateLimitHeaders(
  response: Response,
  req: Request
): Response {
  const url = new URL(req.url);
  const path = url.pathname;
  const config = getConfigForPath(path);
  const clientIp = getClientIp(req);
  const key = `${clientIp}:${path}`;

  // Get current state without incrementing
  const fullKey = `${config.keyPrefix || ""}${key}`;
  const entry = store.get(fullKey);

  if (entry) {
    const remaining = Math.max(0, config.maxRequests - entry.count);
    const headers = new Headers(response.headers);
    headers.set("X-RateLimit-Limit", config.maxRequests.toString());
    headers.set("X-RateLimit-Remaining", remaining.toString());
    headers.set("X-RateLimit-Reset", Math.floor(entry.resetAt / 1000).toString());

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  return response;
}

/**
 * Reset rate limit for a key (for testing)
 */
export function resetRateLimit(key: string): void {
  store.delete(key);
}

/**
 * Clear all rate limits (for testing)
 */
export function clearAllRateLimits(): void {
  store.clear();
}

/**
 * Get current rate limit stats
 */
export function getRateLimitStats(): {
  totalKeys: number;
  byPrefix: Record<string, number>;
} {
  const byPrefix: Record<string, number> = {};

  for (const key of store.keys()) {
    const prefix = key.split(":")[0] + ":";
    byPrefix[prefix] = (byPrefix[prefix] || 0) + 1;
  }

  return {
    totalKeys: store.size,
    byPrefix,
  };
}
