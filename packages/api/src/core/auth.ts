/**
 * API Authentication Middleware
 * ENG-1671 - Require Bearer token auth on /api/* endpoints
 *
 * Keys are configured via:
 *   - MULTIPLAI_API_KEYS: comma-separated list of accepted keys
 *   - MULTIPLAI_API_KEY: single accepted key (fallback)
 *
 * Behavior when no key is configured:
 *   - NODE_ENV=production: fail closed (503 "auth not configured")
 *   - otherwise: allow all requests, logging a single warning
 */

import { createHash, timingSafeEqual } from "node:crypto";

/** Paths under /api/ that never require authentication */
const PUBLIC_API_PATHS = new Set(["/api/health"]);

/** Paths that may authenticate via ?token= query param (SSE / WebSocket) */
const QUERY_TOKEN_PATHS = new Set(["/api/logs/stream", "/api/ws/tasks"]);

let warnedNoKeys = false;

/** For tests: reset the one-time "no keys configured" warning flag */
export function resetAuthWarningForTests(): void {
  warnedNoKeys = false;
}

/**
 * Read configured API keys from the environment.
 * MULTIPLAI_API_KEYS (CSV) takes precedence over MULTIPLAI_API_KEY.
 */
export function getConfiguredApiKeys(): string[] {
  const csv = process.env.MULTIPLAI_API_KEYS;
  if (csv && csv.trim().length > 0) {
    return csv
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
  }
  const single = process.env.MULTIPLAI_API_KEY;
  if (single && single.trim().length > 0) {
    return [single.trim()];
  }
  return [];
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Constant-time token comparison.
 * Both sides are hashed to fixed-length digests so timingSafeEqual
 * never throws on length mismatch and comparison time is uniform.
 */
export function isValidToken(token: string, keys?: string[]): boolean {
  const configured = keys ?? getConfiguredApiKeys();
  if (configured.length === 0) return false;

  const tokenDigest = sha256(token);
  let valid = false;
  for (const key of configured) {
    // Compare against every key to keep timing independent of match position
    if (timingSafeEqual(tokenDigest, sha256(key))) {
      valid = true;
    }
  }
  return valid;
}

/** Extract a bearer token from the Authorization header */
function extractBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function unauthorizedResponse(): Response {
  return Response.json(
    { error: "Unauthorized", message: "Valid Bearer token required" },
    {
      status: 401,
      headers: { "WWW-Authenticate": 'Bearer realm="multiplai-api"' },
    },
  );
}

function authNotConfiguredResponse(): Response {
  return Response.json(
    {
      error: "Service Unavailable",
      message: "auth not configured",
    },
    { status: 503 },
  );
}

/**
 * Authentication middleware for /api/* paths.
 * Returns null when the request is allowed, or a Response (401/503) otherwise.
 *
 * Case-sensitive prefix match on "/api/". URL#pathname already resolves
 * dot segments ("..", "."), so normalized paths are what we match against.
 */
export function authMiddleware(req: Request): Response | null {
  const url = new URL(req.url);
  const path = url.pathname;

  // Only guard /api/* (exact prefix, case-sensitive)
  if (path !== "/api" && !path.startsWith("/api/")) {
    return null;
  }

  // Public endpoints
  if (PUBLIC_API_PATHS.has(path)) {
    return null;
  }

  const keys = getConfiguredApiKeys();
  if (keys.length === 0) {
    if (process.env.NODE_ENV === "production") {
      // Fail closed: never serve authenticated surface without keys in prod
      return authNotConfiguredResponse();
    }
    if (!warnedNoKeys) {
      warnedNoKeys = true;
      console.warn(
        "[Auth] No MULTIPLAI_API_KEYS/MULTIPLAI_API_KEY configured — " +
          "allowing all /api requests (non-production only)",
      );
    }
    return null;
  }

  let token = extractBearerToken(req);

  // SSE / WebSocket clients cannot always set headers; accept ?token=
  if (!token && QUERY_TOKEN_PATHS.has(path)) {
    token = url.searchParams.get("token");
  }

  if (!token || !isValidToken(token, keys)) {
    return unauthorizedResponse();
  }

  return null;
}
