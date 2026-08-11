/**
 * ENG-1671 - Integration test for the real Bun.serve fetch handler.
 *
 * auth.test.ts only proves authMiddleware() itself rejects/accepts requests
 * in isolation. It does NOT prove the WebSocket upgrade path in index.ts is
 * actually gated, because server.upgrade() bypasses handleRequest()/
 * authMiddleware() entirely once called. This file starts a real Bun.serve
 * instance using the exact fetch handler index.ts wires up (createFetchHandler),
 * and drives real HTTP/WS handshake requests at it.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { resetAuthWarningForTests } from "./core/auth";

// index.ts guards its unconditional `main()` startup call behind
// `process.env.NODE_ENV !== "test"` specifically so this test file can
// import createFetchHandler without triggering production side effects
// (DB connections, model config load, stale-task cleanup, port binding on
// the real PORT). Static imports are hoisted and evaluated before any
// module-body code runs, so NODE_ENV must be set BEFORE index.ts is
// imported — a dynamic import() inside an async IIFE achieves that.
process.env.NODE_ENV = process.env.NODE_ENV ?? "test";

// router.ts eagerly constructs `new Orchestrator()` at module top level, whose
// constructor eagerly constructs `new GitHubClient()`, which throws
// synchronously if GITHUB_TOKEN is unset — this is a pre-existing gap in the
// module's test-friendliness, unrelated to the WS auth fix under test here.
// Octokit's constructor does not validate the token over the network, so a
// placeholder value is safe: it only needs to satisfy the presence check at
// import time. Must be set before the dynamic import() below, same reasoning
// as the NODE_ENV assignment above.
process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? "test-placeholder-token";

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

let server: ReturnType<typeof Bun.serve>;
let baseUrl: string;
let createFetchHandler: typeof import("./index").createFetchHandler;
let releaseWsSlotOnce: typeof import("./index").releaseWsSlotOnce;
let rateLimiter: typeof import("./core/rate-limiter");

beforeAll(async () => {
  // Dynamic import defers evaluation of index.ts's module body (including
  // its `if (process.env.NODE_ENV !== "test") main();` guard) until after
  // the NODE_ENV assignment above has run. A static top-level import would
  // be hoisted and evaluated before that assignment, defeating the guard.
  ({ createFetchHandler, releaseWsSlotOnce } = await import("./index"));
  rateLimiter = await import("./core/rate-limiter");
  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: createFetchHandler() as any,
    websocket: {
      open() {},
      message() {},
      // Mirrors the real index.ts close handler: without this, the ENG-1670
      // concurrency slot acquired in the fetch handler would leak in tests,
      // because slot release lives in the production websocket.close handler
      // that this harness replaces.
      close(ws: any) {
        releaseWsSlotOnce(ws.data);
      },
    },
  });
  baseUrl = `ws://127.0.0.1:${server.port}`;
});

afterAll(() => {
  server.stop(true);
});

beforeEach(() => {
  resetAuthWarningForTests();
  setEnv({ MULTIPLAI_API_KEY: "secret-key-1" });
  // Connection slots are process-global module state; clear between tests so
  // WS-cap tests can't poison each other (or the auth tests above).
  rateLimiter.clearAllSseSlots();
});

afterEach(() => {
  restoreEnv();
});

describe("real Bun.serve fetch handler: /api/ws/tasks upgrade auth gate", () => {
  test("rejects WS upgrade with 401 when no token is supplied", async () => {
    // Bun's WebSocket client throws on non-101 responses without exposing
    // the status directly, so we drive the handshake manually via fetch's
    // upgrade semantics using a raw HTTP request instead.
    const res = await fetch(
      `http://127.0.0.1:${server.port}/api/ws/tasks`,
      {
        headers: {
          upgrade: "websocket",
          connection: "Upgrade",
          "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
          "sec-websocket-version": "13",
        },
      },
    );
    expect(res.status).toBe(401);
  });

  test("rejects WS upgrade with 401 when an invalid token is supplied", async () => {
    const res = await fetch(
      `http://127.0.0.1:${server.port}/api/ws/tasks?token=not-the-key`,
      {
        headers: {
          upgrade: "websocket",
          connection: "Upgrade",
          "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
          "sec-websocket-version": "13",
        },
      },
    );
    expect(res.status).toBe(401);
  });

  test("rejects WS upgrade with 503 when no key is configured (fail closed)", async () => {
    setEnv({ NODE_ENV: "production" });
    const res = await fetch(
      `http://127.0.0.1:${server.port}/api/ws/tasks?token=anything`,
      {
        headers: {
          upgrade: "websocket",
          connection: "Upgrade",
          "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
          "sec-websocket-version": "13",
        },
      },
    );
    expect(res.status).toBe(503);
  });

  test("completes the real WebSocket handshake with a valid ?token=", async () => {
    const ws = new WebSocket(`${baseUrl}/api/ws/tasks?token=secret-key-1`);
    const opened = await new Promise<boolean>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("WS open timed out")), 5000);
      ws.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve(true);
      });
      ws.addEventListener("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
    expect(opened).toBe(true);
    ws.close();
  });

  test("rejects the real WebSocket handshake without a token (client sees close/error, not open)", async () => {
    const ws = new WebSocket(`${baseUrl}/api/ws/tasks`);
    const result = await new Promise<"open" | "rejected">((resolve) => {
      const timeout = setTimeout(() => resolve("rejected"), 3000);
      ws.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve("open");
      });
      ws.addEventListener("error", () => {
        clearTimeout(timeout);
        resolve("rejected");
      });
      ws.addEventListener("close", () => {
        clearTimeout(timeout);
        resolve("rejected");
      });
    });
    expect(result).toBe("rejected");
  });
});

// ENG-1670: per-IP WebSocket concurrency cap on the real upgrade path.
describe("real Bun.serve fetch handler: /api/ws/tasks concurrency cap", () => {
  const WS_URL = () => `${baseUrl}/api/ws/tasks?token=secret-key-1`;

  function openWs(): Promise<WebSocket> {
    const ws = new WebSocket(WS_URL());
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("WS open timed out")),
        5000,
      );
      ws.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve(ws);
      });
      ws.addEventListener("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /** Raw handshake so we can observe the HTTP status of a rejection. */
  function rawHandshake(token?: string): Promise<Response> {
    const qs = token !== undefined ? `?token=${token}` : "";
    return fetch(`http://127.0.0.1:${server.port}/api/ws/tasks${qs}`, {
      headers: {
        upgrade: "websocket",
        connection: "Upgrade",
        "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
        "sec-websocket-version": "13",
      },
    });
  }

  async function waitForWsCount(ip: string, expected: number): Promise<void> {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (rateLimiter.getWsConnectionCount(ip) === expected) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(
      `getWsConnectionCount("${ip}") never reached ${expected} (still ${rateLimiter.getWsConnectionCount(ip)})`,
    );
  }

  test("rejects the connection over the per-IP cap with 429 and frees the slot on close", async () => {
    const sockets: WebSocket[] = [];
    try {
      for (let i = 0; i < rateLimiter.WS_MAX_CONCURRENT; i++) {
        sockets.push(await openWs());
      }
      await waitForWsCount("127.0.0.1", rateLimiter.WS_MAX_CONCURRENT);

      // Over-cap handshake must be refused with 429 + Retry-After,
      // not silently dropped and not a 5xx.
      const res = await rawHandshake("secret-key-1");
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("30");

      // Closing one connection must free exactly one slot...
      sockets.pop()!.close();
      await waitForWsCount("127.0.0.1", rateLimiter.WS_MAX_CONCURRENT - 1);

      // ...making room for a new connection to succeed again.
      sockets.push(await openWs());
      await waitForWsCount("127.0.0.1", rateLimiter.WS_MAX_CONCURRENT);
    } finally {
      for (const ws of sockets) ws.close();
    }
  });

  test("rejected auth (401) does not consume a concurrency slot", async () => {
    const res = await rawHandshake(); // no token
    expect(res.status).toBe(401);
    expect(rateLimiter.getWsConnectionCount("127.0.0.1")).toBe(0);
  });

  test("429 from the cap is returned only after auth (no unauthenticated slot probing)", async () => {
    const sockets: WebSocket[] = [];
    try {
      for (let i = 0; i < rateLimiter.WS_MAX_CONCURRENT; i++) {
        sockets.push(await openWs());
      }
      await waitForWsCount("127.0.0.1", rateLimiter.WS_MAX_CONCURRENT);
      // Even with the cap saturated, a bad token must see 401, not 429 —
      // auth runs first, so the limiter leaks nothing to unauthenticated
      // clients and rejected requests never touch the slot table.
      const res = await rawHandshake("not-the-key");
      expect(res.status).toBe(401);
      expect(rateLimiter.getWsConnectionCount("127.0.0.1")).toBe(
        rateLimiter.WS_MAX_CONCURRENT,
      );
    } finally {
      for (const ws of sockets) ws.close();
    }
  });
});
