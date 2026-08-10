import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { addCorsHeaders, corsHeadersFor } from "./cors";

const ORIGINAL_ALLOWED = process.env.ALLOWED_ORIGINS;

function makeReq(origin?: string): Request {
  return new Request("http://localhost/api/tasks", {
    headers: origin ? { origin } : {},
  });
}

describe("ENG-1666 CORS conformance", () => {
  beforeEach(() => {
    delete process.env.ALLOWED_ORIGINS;
  });

  afterAll(() => {
    if (ORIGINAL_ALLOWED === undefined) {
      delete process.env.ALLOWED_ORIGINS;
    } else {
      process.env.ALLOWED_ORIGINS = ORIGINAL_ALLOWED;
    }
  });

  describe("corsHeadersFor", () => {
    it("never emits wildcard by default", () => {
      const headers = corsHeadersFor(makeReq("https://evil.example.com"));
      expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
    });

    it("echoes origin when in the allowlist", () => {
      process.env.ALLOWED_ORIGINS =
        "https://app.example.com,https://admin.example.com";
      const headers = corsHeadersFor(makeReq("https://app.example.com"));
      expect(headers["Access-Control-Allow-Origin"]).toBe(
        "https://app.example.com",
      );
    });

    it("omits Allow-Origin for origins not in the allowlist", () => {
      process.env.ALLOWED_ORIGINS = "https://app.example.com";
      const headers = corsHeadersFor(makeReq("https://evil.example.com"));
      expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
    });

    it("trims whitespace in the comma-separated list", () => {
      process.env.ALLOWED_ORIGINS =
        " https://app.example.com , https://admin.example.com ";
      const headers = corsHeadersFor(makeReq("https://admin.example.com"));
      expect(headers["Access-Control-Allow-Origin"]).toBe(
        "https://admin.example.com",
      );
    });

    it("supports explicit wildcard opt-in", () => {
      process.env.ALLOWED_ORIGINS = "*";
      const headers = corsHeadersFor(makeReq("https://anything.example.com"));
      expect(headers["Access-Control-Allow-Origin"]).toBe("*");
    });

    it("omits Allow-Origin for requests without Origin header", () => {
      process.env.ALLOWED_ORIGINS = "https://app.example.com";
      const headers = corsHeadersFor(makeReq());
      expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
    });

    it("always includes Vary: Origin and method/header allowances", () => {
      const headers = corsHeadersFor(makeReq("https://app.example.com"));
      expect(headers.Vary).toBe("Origin");
      expect(headers["Access-Control-Allow-Methods"]).toContain("OPTIONS");
      expect(headers["Access-Control-Allow-Headers"]).toContain(
        "Authorization",
      );
    });
  });

  describe("addCorsHeaders", () => {
    it("adds CORS headers to a response preserving status and body", async () => {
      process.env.ALLOWED_ORIGINS = "https://app.example.com";
      const res = addCorsHeaders(
        Response.json({ ok: true }, { status: 201 }),
        makeReq("https://app.example.com"),
      );
      expect(res.status).toBe(201);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://app.example.com",
      );
      expect(res.headers.get("Vary")).toBe("Origin");
      expect(await res.json()).toEqual({ ok: true });
    });

    it("does not add Allow-Origin for untrusted origins", () => {
      process.env.ALLOWED_ORIGINS = "https://app.example.com";
      const res = addCorsHeaders(
        Response.json({ ok: true }),
        makeReq("https://evil.example.com"),
      );
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });
  });
});
