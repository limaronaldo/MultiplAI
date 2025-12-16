/**
 * SafetyHandler Tests
 * Issue #344 - Tests for safety check handling
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { SafetyHandler } from "./safety-handler";
import type { CUASafetyCheck } from "./types";

describe("SafetyHandler", () => {
  let handler: SafetyHandler;

  beforeEach(() => {
    handler = new SafetyHandler(["localhost", "example.com", "myapp.test"]);
  });

  describe("handle", () => {
    it("should proceed when no safety checks", async () => {
      const result = await handler.handle(undefined, "http://localhost:3000");

      expect(result.proceed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("should proceed with empty safety checks array", async () => {
      const result = await handler.handle([], "http://localhost:3000");

      expect(result.proceed).toBe(true);
    });

    it("should block malicious_instructions", async () => {
      const checks: CUASafetyCheck[] = [
        {
          id: "check-1",
          code: "malicious_instructions",
          message: "Detected attempt to access system files",
        },
      ];

      const result = await handler.handle(checks, "http://localhost:3000");

      expect(result.proceed).toBe(false);
      expect(result.reason).toContain("malicious_instructions");
    });

    it("should block sensitive_domain", async () => {
      const checks: CUASafetyCheck[] = [
        {
          id: "check-1",
          code: "sensitive_domain",
          message: "Attempting to access banking site",
        },
      ];

      const result = await handler.handle(checks, "http://bank.com");

      expect(result.proceed).toBe(false);
      expect(result.reason).toContain("sensitive_domain");
    });

    it("should acknowledge irrelevant_domain for allowed URL", async () => {
      const checks: CUASafetyCheck[] = [
        {
          id: "check-1",
          code: "irrelevant_domain",
          message: "URL does not match expected domain",
        },
      ];

      const result = await handler.handle(checks, "http://localhost:3000");

      expect(result.proceed).toBe(true);
      expect(result.acknowledged).toHaveLength(1);
      expect(result.acknowledged?.[0].code).toBe("irrelevant_domain");
    });

    it("should block irrelevant_domain for disallowed URL", async () => {
      const checks: CUASafetyCheck[] = [
        {
          id: "check-1",
          code: "irrelevant_domain",
          message: "URL does not match expected domain",
        },
      ];

      const result = await handler.handle(checks, "http://malicious-site.com");

      expect(result.proceed).toBe(false);
      expect(result.reason).toContain("irrelevant_domain");
    });

    it("should handle multiple safety checks", async () => {
      const checks: CUASafetyCheck[] = [
        {
          id: "check-1",
          code: "irrelevant_domain",
          message: "URL check",
        },
        {
          id: "check-2",
          code: "irrelevant_domain",
          message: "Another URL check",
        },
      ];

      const result = await handler.handle(checks, "http://example.com/page");

      expect(result.proceed).toBe(true);
      expect(result.acknowledged).toHaveLength(2);
    });

    it("should block if any check is blocked", async () => {
      const checks: CUASafetyCheck[] = [
        {
          id: "check-1",
          code: "irrelevant_domain",
          message: "URL check",
        },
        {
          id: "check-2",
          code: "malicious_instructions",
          message: "Bad stuff",
        },
      ];

      const result = await handler.handle(checks, "http://localhost:3000");

      expect(result.proceed).toBe(false);
      expect(result.reason).toContain("malicious_instructions");
    });
  });

  describe("URL allowlist", () => {
    it("should allow exact domain match", async () => {
      const checks: CUASafetyCheck[] = [
        { id: "1", code: "irrelevant_domain", message: "test" },
      ];

      const result = await handler.handle(checks, "http://example.com");

      expect(result.proceed).toBe(true);
    });

    it("should allow subdomain match", async () => {
      const checks: CUASafetyCheck[] = [
        { id: "1", code: "irrelevant_domain", message: "test" },
      ];

      const result = await handler.handle(checks, "http://api.example.com");

      expect(result.proceed).toBe(true);
    });

    it("should allow localhost with port", async () => {
      const checks: CUASafetyCheck[] = [
        { id: "1", code: "irrelevant_domain", message: "test" },
      ];

      const result = await handler.handle(checks, "http://localhost:8080/path");

      expect(result.proceed).toBe(true);
    });

    it("should block non-matching domain", async () => {
      const checks: CUASafetyCheck[] = [
        { id: "1", code: "irrelevant_domain", message: "test" },
      ];

      const result = await handler.handle(checks, "http://evil.com");

      expect(result.proceed).toBe(false);
    });

    it("should handle invalid URLs gracefully", async () => {
      const checks: CUASafetyCheck[] = [
        { id: "1", code: "irrelevant_domain", message: "test" },
      ];

      const result = await handler.handle(checks, "not-a-valid-url");

      expect(result.proceed).toBe(false);
    });
  });

  describe("addAllowedUrls", () => {
    it("should add new URLs to allowlist", async () => {
      handler.addAllowedUrls(["newdomain.com"]);

      const checks: CUASafetyCheck[] = [
        { id: "1", code: "irrelevant_domain", message: "test" },
      ];

      const result = await handler.handle(checks, "http://newdomain.com");

      expect(result.proceed).toBe(true);
    });

    it("should not add duplicate URLs", () => {
      const initialCount = handler.getAllowedUrls().length;

      handler.addAllowedUrls(["localhost"]);

      expect(handler.getAllowedUrls().length).toBe(initialCount);
    });
  });

  describe("getAllowedUrls", () => {
    it("should return copy of allowlist", () => {
      const urls = handler.getAllowedUrls();

      expect(urls).toContain("localhost");
      expect(urls).toContain("example.com");

      // Modifying returned array should not affect internal state
      urls.push("hacker.com");
      expect(handler.getAllowedUrls()).not.toContain("hacker.com");
    });
  });

  describe("case insensitivity", () => {
    it("should match URLs case-insensitively", async () => {
      const checks: CUASafetyCheck[] = [
        { id: "1", code: "irrelevant_domain", message: "test" },
      ];

      const result = await handler.handle(checks, "http://EXAMPLE.COM/PAGE");

      expect(result.proceed).toBe(true);
    });
  });
});
