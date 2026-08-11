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

beforeAll(async () => {
  // Dynamic import defers evaluation of index.ts's module body (including
  // its `if (process.env.NODE_ENV !== "test") main();` guard) until after
  // the NODE_ENV assignment above has run. A static top-level import would
  // be hoisted and evaluated before that assignment, defeating the guard.
  ({ createFetchHandler } = await import("./index"));
  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: createFetchHandler() as any,
    websocket: {
      open() {},
      message() {},
      close() {},
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
