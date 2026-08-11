/**
 * ENG-1671 - API authentication tests
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  authMiddleware,
  getConfiguredApiKeys,
  isValidToken,
  resetAuthWarningForTests,
} from "./auth";

const ORIGINAL_ENV = {
  MULTIPLAI_API_KEYS: process.env.MULTIPLAI_API_KEYS,
  MULTIPLAI_API_KEY: process.env.MULTIPLAI_API_KEY,
  NODE_ENV: process.env.NODE_ENV,
};

function setEnv(env: {
  MULTIPLAI_API_KEYS?: string;
  MULTIPLAI_API_KEY?: string;
  NODE_ENV?: string;
}) {
  delete process.env.MULTIPLAI_API_KEYS;
  delete process.env.MULTIPLAI_API_KEY;
  delete process.env.NODE_ENV;
  if (env.MULTIPLAI_API_KEYS !== undefined)
    process.env.MULTIPLAI_API_KEYS = env.MULTIPLAI_API_KEYS;
  if (env.MULTIPLAI_API_KEY !== undefined)
    process.env.MULTIPLAI_API_KEY = env.MULTIPLAI_API_KEY;
  if (env.NODE_ENV !== undefined) process.env.NODE_ENV = env.NODE_ENV;
}

function restoreEnv() {
  setEnv({});
  if (ORIGINAL_ENV.MULTIPLAI_API_KEYS !== undefined)
    process.env.MULTIPLAI_API_KEYS = ORIGINAL_ENV.MULTIPLAI_API_KEYS;
  if (ORIGINAL_ENV.MULTIPLAI_API_KEY !== undefined)
    process.env.MULTIPLAI_API_KEY = ORIGINAL_ENV.MULTIPLAI_API_KEY;
  if (ORIGINAL_ENV.NODE_ENV !== undefined)
    process.env.NODE_ENV = ORIGINAL_ENV.NODE_ENV;
}

function req(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, { headers });
}

beforeEach(() => {
  resetAuthWarningForTests();
  setEnv({ MULTIPLAI_API_KEY: "secret-key-1" });
});

afterEach(() => {
  restoreEnv();
});

describe("getConfiguredApiKeys", () => {
  test("reads single key from MULTIPLAI_API_KEY", () => {
    expect(getConfiguredApiKeys()).toEqual(["secret-key-1"]);
  });

  test("MULTIPLAI_API_KEYS CSV takes precedence and is trimmed", () => {
    setEnv({
      MULTIPLAI_API_KEYS: " k1 , k2 ,, k3 ",
      MULTIPLAI_API_KEY: "ignored",
    });
    expect(getConfiguredApiKeys()).toEqual(["k1", "k2", "k3"]);
  });

  test("empty when nothing configured", () => {
    setEnv({});
    expect(getConfiguredApiKeys()).toEqual([]);
  });
});

describe("isValidToken", () => {
  test("accepts a configured key", () => {
    expect(isValidToken("secret-key-1")).toBe(true);
  });

  test("rejects wrong key and different-length key", () => {
    expect(isValidToken("wrong")).toBe(false);
    expect(isValidToken("secret-key-1-longer-than-configured")).toBe(false);
  });

  test("rejects everything when no keys configured", () => {
    setEnv({});
    expect(isValidToken("anything")).toBe(false);
  });

  test("accepts any key from CSV list", () => {
    setEnv({ MULTIPLAI_API_KEYS: "alpha,beta" });
    expect(isValidToken("alpha")).toBe(true);
    expect(isValidToken("beta")).toBe(true);
    expect(isValidToken("gamma")).toBe(false);
  });
});

describe("authMiddleware", () => {
  test("401 without token on /api/*", () => {
    const res = authMiddleware(req("/api/tasks"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
    expect(res!.headers.get("WWW-Authenticate")).toContain("Bearer");
  });

  test("401 with invalid token", () => {
    const res = authMiddleware(
      req("/api/tasks", { authorization: "Bearer nope" }),
    );
    expect(res!.status).toBe(401);
  });

  test("allows valid Bearer token", () => {
    const res = authMiddleware(
      req("/api/tasks", { authorization: "Bearer secret-key-1" }),
    );
    expect(res).toBeNull();
  });

  test("Bearer scheme is case-insensitive", () => {
    const res = authMiddleware(
      req("/api/tasks", { authorization: "bearer secret-key-1" }),
    );
    expect(res).toBeNull();
  });

  test("/api/health is public", () => {
    expect(authMiddleware(req("/api/health"))).toBeNull();
  });

  test("non-/api paths untouched (webhooks, docs, openapi)", () => {
    expect(authMiddleware(req("/webhooks/github"))).toBeNull();
    expect(authMiddleware(req("/docs"))).toBeNull();
    expect(authMiddleware(req("/redoc"))).toBeNull();
    expect(authMiddleware(req("/openapi.json"))).toBeNull();
  });

  test("case-sensitive prefix: /API/tasks is not guarded", () => {
    expect(authMiddleware(req("/API/tasks"))).toBeNull();
  });

  test("dot segments are resolved before matching", () => {
    // URL API normalizes /api/../api/tasks -> /api/tasks
    const res = authMiddleware(req("/api/../api/tasks"));
    expect(res!.status).toBe(401);
  });

  test("503 in production when no key configured (fail closed)", () => {
    setEnv({ NODE_ENV: "production" });
    const res = authMiddleware(req("/api/tasks"));
    expect(res!.status).toBe(503);
  });

  test("allows when NODE_ENV=test and no key configured (explicit test escape hatch)", () => {
    setEnv({ NODE_ENV: "test" });
    expect(authMiddleware(req("/api/tasks"))).toBeNull();
  });

  test("allows when ALLOW_UNAUTHENTICATED=1 and no key configured (explicit dev escape hatch)", () => {
    setEnv({});
    process.env.ALLOW_UNAUTHENTICATED = "1";
    expect(authMiddleware(req("/api/tasks"))).toBeNull();
    delete process.env.ALLOW_UNAUTHENTICATED;
  });

  test("fails closed (503) for arbitrary/misconfigured NODE_ENV values when no key configured", () => {
    // Regression test for the HIGH fail-open bug: previously only
    // NODE_ENV === "production" failed closed, so unset/staging/typo'd
    // values fell through to fail-open. Now everything except the
    // explicit escape hatches (ALLOW_UNAUTHENTICATED=1, NODE_ENV=test)
    // must fail closed.
    for (const nodeEnv of [undefined, "staging", "prod", "Production", ""]) {
      setEnv(nodeEnv === undefined ? {} : { NODE_ENV: nodeEnv });
      const res = authMiddleware(req("/api/tasks"));
      expect(res).not.toBeNull();
      expect(res!.status).toBe(503);
    }
  });

  test("SSE accepts ?token= query param", () => {
    const res = authMiddleware(req("/api/logs/stream?token=secret-key-1"));
    expect(res).toBeNull();
  });

  test("SSE rejects bad ?token=", () => {
    const res = authMiddleware(req("/api/logs/stream?token=bad"));
    expect(res!.status).toBe(401);
  });

  test("authMiddleware accepts ?token= for WS path pattern (middleware-only; see index.test.ts for the real upgrade path)", () => {
    // NOTE: this only proves authMiddleware() itself accepts a valid
    // ?token= for /api/ws/tasks. It does NOT prove the WebSocket upgrade
    // is actually authenticated in production — index.ts's Bun.serve
    // fetch handler calls server.upgrade() for this path, which bypasses
    // handleRequest()/authMiddleware() entirely unless index.ts itself
    // invokes authMiddleware() first (see index.ts + index.test.ts).
    const res = authMiddleware(req("/api/ws/tasks?token=secret-key-1"));
    expect(res).toBeNull();
  });

  test("?token= is NOT accepted on regular API paths", () => {
    const res = authMiddleware(req("/api/tasks?token=secret-key-1"));
    expect(res!.status).toBe(401);
  });

  test("rejects Authorization header with scheme but no token", () => {
    const res = authMiddleware(req("/api/tasks", { authorization: "Bearer" }));
    expect(res!.status).toBe(401);
  });

  test("rejects Authorization header with scheme and only whitespace", () => {
    const res = authMiddleware(
      req("/api/tasks", { authorization: "Bearer    " }),
    );
    expect(res!.status).toBe(401);
  });

  test("rejects non-Bearer Authorization scheme", () => {
    const res = authMiddleware(
      req("/api/tasks", { authorization: "Basic secret-key-1" }),
    );
    expect(res!.status).toBe(401);
  });
});
