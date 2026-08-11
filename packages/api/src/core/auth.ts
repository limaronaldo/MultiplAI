/**
 * API Authentication Middleware
 * ENG-1671 - Require Bearer token auth on /api/* endpoints
 *
 * Keys are configured via:
 *   - MULTIPLAI_API_KEYS: comma-separated list of accepted keys
 *   - MULTIPLAI_API_KEY: single accepted key (fallback)
 *
 * Behavior when no key is configured:
 *   - Fail closed (503 "auth not configured") by default, in every
 *     environment. NODE_ENV is not a security boundary — it is commonly
 *     unset or misconfigured (typos, "prod" vs "production", containers
 *     that never set it) and a fail-open default keyed off it is a
 *     realistic full-auth-bypass path.
 *   - Fail open (allow all requests, logging a single warning) only when
 *     an explicit, distinct dev/test flag is set:
 *       - ALLOW_UNAUTHENTICATED=1, or
 *       - NODE_ENV=test
 *     Both must be set intentionally by the operator/test harness; neither
 *     is a value any production deploy should carry.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { validateTicket, type TicketPurpose } from "./ticket";

/** Paths under /api/ that never require authentication */
const PUBLIC_API_PATHS = new Set(["/api/health"]);

/**
 * Paths that may authenticate via a short-lived `?ticket=` query param, and
 * the single ticket purpose each accepts. SSE/WebSocket clients (EventSource,
 * the browser WebSocket API) cannot set an Authorization header, so they mint
 * a ticket via POST /api/auth/ticket (header-authed) and pass it here.
 */
const QUERY_TICKET_PATHS = new Map<string, TicketPurpose>([
  ["/api/logs/stream", "sse"],
  ["/api/ws/tasks", "ws"],
]);

/**
 * Whether the legacy `?token=<raw API key>` query-string auth from PR #425 is
 * still accepted on the stream paths. Default OFF: a raw, long-lived API key in
 * a URL leaks through logs/Referer/history. Set ALLOW_QUERY_TOKEN=1 only for a
 * transitional window while clients migrate to `?ticket=`.
 */
export function isRawQueryTokenAllowed(): boolean {
  return process.env.ALLOW_QUERY_TOKEN === "1";
}

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
    // Fail closed by default. Only fail open when an explicit dev/test
    // escape hatch is set — NODE_ENV alone is not trustworthy enough to
    // gate an auth bypass on (see module doc comment above).
    const explicitlyAllowUnauthenticated =
      process.env.ALLOW_UNAUTHENTICATED === "1" ||
      process.env.NODE_ENV === "test";

    if (!explicitlyAllowUnauthenticated) {
      return authNotConfiguredResponse();
    }

    if (!warnedNoKeys) {
      warnedNoKeys = true;
      console.warn(
        "[Auth] No MULTIPLAI_API_KEYS/MULTIPLAI_API_KEY configured — " +
          "allowing all /api requests (ALLOW_UNAUTHENTICATED=1 or NODE_ENV=test)",
      );
    }
    return null;
  }

  const token = extractBearerToken(req);

  // Header auth always wins and works on every /api/* path.
  if (token && isValidToken(token, keys)) {
    return null;
  }

  // SSE / WebSocket clients cannot set an Authorization header. On the stream
  // paths they authenticate with a short-lived, single-purpose `?ticket=`
  // (follow-up to PR #425): the ticket is HMAC-signed and expires in ~60s, so
  // a leaked URL is worthless almost immediately and cannot be replayed
  // against another route. The ticket is validated for the exact purpose bound
  // to this path (ws vs sse), so a ticket minted for one stream cannot be used
  // on the other.
  const ticketPurpose = QUERY_TICKET_PATHS.get(path);
  if (ticketPurpose) {
    const ticket = url.searchParams.get("ticket");
    if (ticket) {
      const result = validateTicket(ticket, ticketPurpose, { markUsed: true });
      if (result.valid) {
        return null;
      }
      // Fall through to 401 on an invalid/expired/replayed ticket.
    }

    // Legacy compat: `?token=<raw API key>` (PR #425) is only honored when the
    // operator explicitly opts in via ALLOW_QUERY_TOKEN=1 during migration.
    // Default OFF because a raw reusable API key in the URL leaks through
    // access logs, APM, Referer headers, and browser history.
    if (isRawQueryTokenAllowed()) {
      const rawToken = url.searchParams.get("token");
      if (rawToken && isValidToken(rawToken, keys)) {
        return null;
      }
    }
  }

  return unauthorizedResponse();
}
