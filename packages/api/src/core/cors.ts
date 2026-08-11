// ============================================
// CORS — restrito a origens confiáveis (ENG-1666)
// ============================================
//
// ALLOWED_ORIGINS: lista comma-separated de origens confiáveis.
//   Ex.: ALLOWED_ORIGINS="https://app.example.com,https://admin.example.com"
// "*" pode ser incluído explicitamente para opt-in de wildcard (não recomendado).
// Sem match (ou sem ALLOWED_ORIGINS configurado), nenhum
// Access-Control-Allow-Origin é emitido — secure by default.

function getAllowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

export function corsHeadersFor(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
  const origin = req.headers.get("origin");
  if (!origin) return headers;
  const allowed = getAllowedOrigins();
  if (allowed.includes("*")) {
    headers["Access-Control-Allow-Origin"] = "*";
  } else if (allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export function addCorsHeaders(response: Response, req: Request): Response {
  const newHeaders = new Headers(response.headers);
  // Remove any pre-existing/stale CORS headers so an upstream
  // Access-Control-Allow-Origin can never leak or be emitted twice.
  // corsHeadersFor is re-applied below with the values for the evaluated origin;
  // when the origin is not allowed, ACAO stays absent (secure by default).
  newHeaders.delete("Access-Control-Allow-Origin");
  newHeaders.delete("Access-Control-Allow-Credentials");
  const corsHeaders = corsHeadersFor(req);
  for (const [key, value] of Object.entries(corsHeaders)) {
    newHeaders.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
