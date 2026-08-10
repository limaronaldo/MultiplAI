/**
 * Rate Limiter Tests
 * Issue #336 - Tests for rate limiting behavior
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  checkRateLimit,
  createRateLimitResponse,
  createRateLimitHeaders,
  getClientIp,
  getConfigForPath,
  rateLimitMiddleware,
  clearAllRateLimits,
  getRateLimitStats,
  RATE_LIMIT_CONFIGS,
} from "./rate-limiter";

describe("Rate Limiter", () => {
  beforeEach(() => {
    clearAllRateLimits();
  });

  describe("checkRateLimit", () => {
    it("should allow requests within limit", () => {
      const config = { maxRequests: 5, windowMs: 60000, keyPrefix: "test:" };

      for (let i = 0; i < 5; i++) {
        const result = checkRateLimit("user1", config);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4 - i);
      }
    });

    it("should block requests exceeding limit", () => {
      const config = { maxRequests: 3, windowMs: 60000, keyPrefix: "test:" };

      // Use up the limit
      for (let i = 0; i < 3; i++) {
        checkRateLimit("user2", config);
      }

      // Next request should be blocked
      const result = checkRateLimit("user2", config);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("should track different keys separately", () => {
      const config = { maxRequests: 2, windowMs: 60000, keyPrefix: "test:" };

      checkRateLimit("userA", config);
      checkRateLimit("userA", config);

      // userA is now at limit
      const resultA = checkRateLimit("userA", config);
      expect(resultA.allowed).toBe(false);

      // userB should still have full quota
      const resultB = checkRateLimit("userB", config);
      expect(resultB.allowed).toBe(true);
      expect(resultB.remaining).toBe(1);
    });

    it("should return reset time in the future", () => {
      const config = { maxRequests: 5, windowMs: 60000, keyPrefix: "test:" };

      const result = checkRateLimit("user3", config);

      expect(result.resetAt.getTime()).toBeGreaterThan(Date.now());
      expect(result.resetAt.getTime()).toBeLessThanOrEqual(Date.now() + 60000);
    });
  });

  describe("createRateLimitHeaders", () => {
    it("should create proper headers", () => {
      const result = {
        allowed: true,
        remaining: 5,
        resetAt: new Date(Date.now() + 30000),
        limit: 10,
      };

      const headers = createRateLimitHeaders(result);

      expect(headers.get("X-RateLimit-Limit")).toBe("10");
      expect(headers.get("X-RateLimit-Remaining")).toBe("5");
      expect(headers.get("X-RateLimit-Reset")).toBeDefined();
    });

    it("should include Retry-After when blocked", () => {
      const result = {
        allowed: false,
        remaining: 0,
        resetAt: new Date(Date.now() + 30000),
        limit: 10,
      };

      const headers = createRateLimitHeaders(result);

      expect(headers.get("Retry-After")).toBeDefined();
      const retryAfter = parseInt(headers.get("Retry-After") || "0");
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(30);
    });
  });

  describe("createRateLimitResponse", () => {
    it("should return 429 status", () => {
      const result = {
        allowed: false,
        remaining: 0,
        resetAt: new Date(Date.now() + 30000),
        limit: 10,
      };

      const response = createRateLimitResponse(result);

      expect(response.status).toBe(429);
    });

    it("should include rate limit info in body", async () => {
      const result = {
        allowed: false,
        remaining: 0,
        resetAt: new Date(Date.now() + 30000),
        limit: 10,
      };

      const response = createRateLimitResponse(result);
      const body = await response.json();

      expect(body.error).toBe("Too Many Requests");
      expect(body.limit).toBe(10);
      expect(body.retryAfter).toBeGreaterThan(0);
    });
  });

  describe("getClientIp", () => {
    it("should extract IP from x-forwarded-for", () => {
      const req = new Request("http://localhost", {
        headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
      });

      expect(getClientIp(req)).toBe("1.2.3.4");
    });

    it("should extract IP from x-real-ip", () => {
      const req = new Request("http://localhost", {
        headers: { "x-real-ip": "10.0.0.1" },
      });

      expect(getClientIp(req)).toBe("10.0.0.1");
    });

    it("should extract IP from fly-client-ip", () => {
      const req = new Request("http://localhost", {
        headers: { "fly-client-ip": "192.168.1.1" },
      });

      expect(getClientIp(req)).toBe("192.168.1.1");
    });

    it("should return unknown when no IP header", () => {
      const req = new Request("http://localhost");

      expect(getClientIp(req)).toBe("unknown");
    });
  });

  describe("getConfigForPath", () => {
    it("should return webhook config for webhook paths", () => {
      const config = getConfigForPath("/webhooks/github");

      expect(config).toBe(RATE_LIMIT_CONFIGS.webhook);
    });

    it("should return heavy config for processing paths", () => {
      const config1 = getConfigForPath("/api/tasks/123/process");
      const config2 = getConfigForPath("/api/jobs");
      const config3 = getConfigForPath("/api/batch/submit");

      expect(config1).toBe(RATE_LIMIT_CONFIGS.heavy);
      expect(config2).toBe(RATE_LIMIT_CONFIGS.heavy);
      expect(config3).toBe(RATE_LIMIT_CONFIGS.heavy);
    });

    it("should return api config for regular API paths", () => {
      const config = getConfigForPath("/api/tasks");

      expect(config).toBe(RATE_LIMIT_CONFIGS.api);
    });

    it("should return default config for other paths", () => {
      const config = getConfigForPath("/some/random/path");

      expect(config).toBe(RATE_LIMIT_CONFIGS.default);
    });
  });

  describe("rateLimitMiddleware", () => {
    it("should return null for health endpoint", () => {
      const req = new Request("http://localhost/api/health");

      const result = rateLimitMiddleware(req);

      expect(result).toBeNull();
    });

    it("should return null for root endpoint", () => {
      const req = new Request("http://localhost/");

      const result = rateLimitMiddleware(req);

      expect(result).toBeNull();
    });

    it("should return null when within limit", () => {
      const req = new Request("http://localhost/api/tasks", {
        headers: { "x-forwarded-for": "test-ip-1" },
      });

      const result = rateLimitMiddleware(req);

      expect(result).toBeNull();
    });

    it("should return 429 response when limit exceeded", () => {
      // Exhaust the limit
      for (let i = 0; i < 65; i++) {
        const req = new Request("http://localhost/api/tasks", {
          headers: { "x-forwarded-for": "test-ip-2" },
        });
        rateLimitMiddleware(req);
      }

      const req = new Request("http://localhost/api/tasks", {
        headers: { "x-forwarded-for": "test-ip-2" },
      });
      const result = rateLimitMiddleware(req);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(429);
    });
  });

  describe("getRateLimitStats", () => {
    it("should return empty stats initially", () => {
      const stats = getRateLimitStats();

      expect(stats.totalKeys).toBe(0);
      expect(Object.keys(stats.byPrefix)).toHaveLength(0);
    });

    it("should track keys by prefix", () => {
      checkRateLimit("user1", { maxRequests: 10, windowMs: 60000, keyPrefix: "api:" });
      checkRateLimit("user2", { maxRequests: 10, windowMs: 60000, keyPrefix: "api:" });
      checkRateLimit("user1", { maxRequests: 10, windowMs: 60000, keyPrefix: "webhook:" });

      const stats = getRateLimitStats();

      expect(stats.totalKeys).toBe(3);
      expect(stats.byPrefix["api:"]).toBe(2);
      expect(stats.byPrefix["webhook:"]).toBe(1);
    });
  });
});

// ============================================
// ENG-1670: conformance tests
// ============================================

import {
  getConfigForRequest,
  acquireSseSlot,
  releaseSseSlot,
  getSseConnectionCount,
  clearAllSseSlots,
  createSseLimitResponse,
  SSE_MAX_CONCURRENT,
} from "./rate-limiter";

describe("ENG-1670 conformance", () => {
  beforeEach(() => {
    clearAllRateLimits();
    clearAllSseSlots();
  });

  describe("limits per category", () => {
    it("webhook limit defaults to 30 req/min", () => {
      expect(RATE_LIMIT_CONFIGS.webhook.maxRequests).toBe(30);
      expect(RATE_LIMIT_CONFIGS.webhook.windowMs).toBe(60000);
    });

    it("api read limit defaults to 60 req/min", () => {
      expect(RATE_LIMIT_CONFIGS.api.maxRequests).toBe(60);
      expect(RATE_LIMIT_CONFIGS.api.windowMs).toBe(60000);
    });

    it("api write limit defaults to 20 req/min", () => {
      expect(RATE_LIMIT_CONFIGS.write.maxRequests).toBe(20);
      expect(RATE_LIMIT_CONFIGS.write.windowMs).toBe(60000);
    });
  });

  describe("getConfigForRequest (method-aware)", () => {
    it("GET /api/* uses read config", () => {
      expect(getConfigForRequest("/api/tasks", "GET")).toBe(RATE_LIMIT_CONFIGS.api);
    });

    it("POST/PUT/PATCH/DELETE /api/* use write config", () => {
      expect(getConfigForRequest("/api/tasks/123/reject", "POST")).toBe(RATE_LIMIT_CONFIGS.write);
      expect(getConfigForRequest("/api/tasks/123", "PUT")).toBe(RATE_LIMIT_CONFIGS.write);
      expect(getConfigForRequest("/api/tasks/123", "PATCH")).toBe(RATE_LIMIT_CONFIGS.write);
      expect(getConfigForRequest("/api/tasks/123", "DELETE")).toBe(RATE_LIMIT_CONFIGS.write);
    });

    it("heavy paths take precedence over write config", () => {
      expect(getConfigForRequest("/api/tasks/123/process", "POST")).toBe(RATE_LIMIT_CONFIGS.heavy);
      expect(getConfigForRequest("/api/jobs", "POST")).toBe(RATE_LIMIT_CONFIGS.heavy);
    });

    it("webhooks use webhook config regardless of method", () => {
      expect(getConfigForRequest("/webhooks/github", "POST")).toBe(RATE_LIMIT_CONFIGS.webhook);
    });

    it("getConfigForPath stays backwards-compatible (read semantics)", () => {
      expect(getConfigForPath("/api/tasks")).toBe(RATE_LIMIT_CONFIGS.api);
    });
  });

  describe("write limiting via middleware", () => {
    it("blocks POST /api/* after 20 requests with 429 + Retry-After", () => {
      const mkReq = () =>
        new Request("http://localhost/api/tasks/1/reject", {
          method: "POST",
          headers: { "x-forwarded-for": "10.9.9.9" },
        });

      for (let i = 0; i < 20; i++) {
        expect(rateLimitMiddleware(mkReq())).toBeNull();
      }
      const blocked = rateLimitMiddleware(mkReq());
      expect(blocked).not.toBeNull();
      expect(blocked!.status).toBe(429);
      expect(blocked!.headers.get("Retry-After")).not.toBeNull();
    });

    it("GET on same path from same IP still allowed up to 60", () => {
      const mkGet = () =>
        new Request("http://localhost/api/tasks", {
          method: "GET",
          headers: { "x-forwarded-for": "10.9.9.10" },
        });
      for (let i = 0; i < 60; i++) {
        expect(rateLimitMiddleware(mkGet())).toBeNull();
      }
      const blocked = rateLimitMiddleware(mkGet());
      expect(blocked).not.toBeNull();
      expect(blocked!.status).toBe(429);
    });
  });

  describe("SSE concurrent connection limiting", () => {
    it("allows up to SSE_MAX_CONCURRENT slots per IP", () => {
      for (let i = 0; i < SSE_MAX_CONCURRENT; i++) {
        expect(acquireSseSlot("1.2.3.4")).toBe(true);
      }
      expect(getSseConnectionCount("1.2.3.4")).toBe(SSE_MAX_CONCURRENT);
      expect(acquireSseSlot("1.2.3.4")).toBe(false);
    });

    it("defaults to 5 concurrent connections", () => {
      expect(SSE_MAX_CONCURRENT).toBe(5);
    });

    it("tracks IPs independently", () => {
      for (let i = 0; i < SSE_MAX_CONCURRENT; i++) acquireSseSlot("1.1.1.1");
      expect(acquireSseSlot("2.2.2.2")).toBe(true);
    });

    it("release frees a slot", () => {
      for (let i = 0; i < SSE_MAX_CONCURRENT; i++) acquireSseSlot("3.3.3.3");
      expect(acquireSseSlot("3.3.3.3")).toBe(false);
      releaseSseSlot("3.3.3.3");
      expect(acquireSseSlot("3.3.3.3")).toBe(true);
    });

    it("release below zero is safe", () => {
      releaseSseSlot("9.9.9.9");
      expect(getSseConnectionCount("9.9.9.9")).toBe(0);
    });

    it("SSE limit response is 429 with Retry-After", () => {
      const res = createSseLimitResponse();
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("30");
    });
  });
});
