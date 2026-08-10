// ============================================================================
// Error sanitization for HTTP responses (ENG-1668)
// Prevents leaking internal details (paths, connection strings, stack traces,
// credentials) to API clients. Full errors must still be logged server-side
// via console.error at the call site.
// ============================================================================

const SENSITIVE_PATTERNS: RegExp[] = [
  // Absolute filesystem paths (macOS/Linux/Windows)
  /(?:\/(?:Users|home|var|etc|tmp|opt|private|srv)\/|[A-Za-z]:\\)/,
  // Connection strings / URLs with credentials
  /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\//i,
  /\/\/[^\s/]+:[^\s@]+@/,
  // Stack trace lines
  /\bat\s+.+\(.+:\d+:\d+\)/,
  /\.(?:ts|js|tsx|jsx|mjs|cjs):\d+:\d+/,
  // Secrets / tokens / keys
  /(?:api[_-]?key|secret|token|password|passwd|authorization|bearer)\s*[:=]/i,
  /\b(?:sk|pk|ghp|gho|ghs|xox[abps])_[A-Za-z0-9]{8,}/,
  // Env var dumps
  /\bprocess\.env\b/,
  // Internal hosts
  /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0|::1)\b/,
];

const MAX_DETAIL_LENGTH = 200;

/**
 * Produces a safe, generic error string for inclusion in HTTP response bodies.
 * - Uses only the first line of the error message
 * - Truncates to 200 chars
 * - Replaces the whole message with "Internal error" if it matches any
 *   sensitive pattern (paths, connection strings, stacks, credentials)
 */
export function sanitizeErrorForResponse(error: unknown): string {
  let message: string;
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "string") {
    message = error;
  } else {
    return "Internal error";
  }

  const firstLine = (message.split("\n")[0] ?? "").trim();
  if (!firstLine) return "Internal error";
  if (SENSITIVE_PATTERNS.some((p) => p.test(firstLine))) {
    return "Internal error";
  }
  return firstLine.length > MAX_DETAIL_LENGTH
    ? `${firstLine.slice(0, MAX_DETAIL_LENGTH)}…`
    : firstLine;
}
