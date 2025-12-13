import { describe, expect, it } from "bun:test";
import {
  AttemptRecordSchema,
  ReflectionInputSchema,
  ReflectionOutputSchema,
} from "./types";

describe("agentic types schemas", () => {
  it("parses AttemptRecord with timestamp coercion", () => {
    const parsed = AttemptRecordSchema.parse({
      approach: "fix import",
      success: false,
      error: "oops",
      timestamp: "2025-01-01T00:00:00Z",
    });
    expect(parsed.timestamp).toBeInstanceOf(Date);
    expect(parsed.approach).toBe("fix import");
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe("oops");
  });

  it("validates reflection input/output shapes", () => {
    const input = ReflectionInputSchema.parse({
      originalIssue: "do thing",
      plan: ["step 1"],
      diff: "diff",
      testOutput: "tests",
      attemptNumber: 0,
      previousAttempts: [],
    });
    expect(input.plan.length).toBe(1);

    const output = ReflectionOutputSchema.parse({
      diagnosis: "bad import",
      rootCause: "code",
      recommendation: "fix",
      feedback: "update import",
      confidence: 0.8,
    });
    expect(output.confidence).toBeGreaterThan(0);
  });
});

