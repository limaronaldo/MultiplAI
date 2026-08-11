import { describe, expect, it } from "bun:test";
import { sanitizeErrorForResponse } from "./errors";

describe("sanitizeErrorForResponse (ENG-1668)", () => {
  it("returns first line of a safe Error message", () => {
    expect(sanitizeErrorForResponse(new Error("Task not found"))).toBe(
      "Task not found",
    );
  });

  it("accepts plain strings", () => {
    expect(sanitizeErrorForResponse("Invalid payload")).toBe("Invalid payload");
  });

  it("returns generic message for non-Error/non-string values", () => {
    expect(sanitizeErrorForResponse({ foo: 1 })).toBe("Internal error");
    expect(sanitizeErrorForResponse(undefined)).toBe("Internal error");
    expect(sanitizeErrorForResponse(null)).toBe("Internal error");
    expect(sanitizeErrorForResponse(42)).toBe("Internal error");
  });

  it("returns generic message for empty messages", () => {
    expect(sanitizeErrorForResponse(new Error(""))).toBe("Internal error");
    expect(sanitizeErrorForResponse("   ")).toBe("Internal error");
  });

  it("drops everything after the first line (stack-ish bodies)", () => {
    expect(
      sanitizeErrorForResponse(new Error("Boom\n  at handler (/app/x.ts:1:1)")),
    ).toBe("Boom");
  });

  it("redacts filesystem paths", () => {
    expect(
      sanitizeErrorForResponse(
        new Error("ENOENT: /Users/ronaldo/secret/file.json missing"),
      ),
    ).toBe("Internal error");
    expect(
      sanitizeErrorForResponse(new Error("Cannot read C:\\Windows\\env")),
    ).toBe("Internal error");
  });

  it("redacts container WORKDIR paths (e.g. /app) not on an enumerated allowlist", () => {
    expect(
      sanitizeErrorForResponse(
        new Error("ENOENT: /app/packages/api/.env not found"),
      ),
    ).toBe("Internal error");
    expect(
      sanitizeErrorForResponse(
        new Error(
          "Cannot find module '/app/node_modules/some-pkg/index.js'",
        ),
      ),
    ).toBe("Internal error");
  });

  it("redacts arbitrary Windows drive paths", () => {
    expect(
      sanitizeErrorForResponse(
        new Error(
          "EBUSY: resource busy or locked, open 'D:\\builds\\app\\secrets.json'",
        ),
      ),
    ).toBe("Internal error");
  });

  it("redacts connection strings", () => {
    expect(
      sanitizeErrorForResponse(
        new Error("connect failed postgres://user:pass@db:5432/app"),
      ),
    ).toBe("Internal error");
    expect(
      sanitizeErrorForResponse(new Error("redis://cache failed")),
    ).toBe("Internal error");
  });

  it("redacts credentials in URLs", () => {
    expect(
      sanitizeErrorForResponse(new Error("fetch https://a:b@example.com")),
    ).toBe("Internal error");
  });

  it("redacts stack trace fragments on the first line", () => {
    expect(
      sanitizeErrorForResponse(
        new Error("failed at run (/app/src/router.ts:12:5)"),
      ),
    ).toBe("Internal error");
    expect(sanitizeErrorForResponse(new Error("router.ts:44:10 threw"))).toBe(
      "Internal error",
    );
  });

  it("redacts secrets and tokens", () => {
    expect(
      sanitizeErrorForResponse(new Error("bad api_key: abc123")),
    ).toBe("Internal error");
    expect(
      sanitizeErrorForResponse(new Error("token sk_live1234567890 rejected")),
    ).toBe("Internal error");
    expect(
      sanitizeErrorForResponse(new Error("Authorization: Bearer x")),
    ).toBe("Internal error");
  });

  it("redacts credential-looking phrases with words between the noun and colon", () => {
    // Reviewer repro (PR #428): "API key provided:" — the colon is not
    // immediately after "key", so a naive `key\s*[:=]` pattern misses it.
    expect(
      sanitizeErrorForResponse(
        new Error(
          "Incorrect API key provided: sk-proj-abcdefghijklmnopqrstuvwxyz",
        ),
      ),
    ).toBe("Internal error");
  });

  it("redacts hyphenated vendor-prefixed tokens (e.g. sk-proj-...)", () => {
    expect(
      sanitizeErrorForResponse(
        new Error("upstream rejected sk-proj-abcdefghijklmnop"),
      ),
    ).toBe("Internal error");
  });

  it("redacts env and internal hosts", () => {
    expect(
      sanitizeErrorForResponse(new Error("process.env.SECRET is undefined")),
    ).toBe("Internal error");
    expect(
      sanitizeErrorForResponse(new Error("ECONNREFUSED 127.0.0.1:5432")),
    ).toBe("Internal error");
  });

  it("truncates long messages to 200 chars", () => {
    const long = "x".repeat(300);
    const result = sanitizeErrorForResponse(new Error(long));
    expect(result.length).toBe(201); // 200 + ellipsis
    expect(result.endsWith("…")).toBe(true);
  });
});
