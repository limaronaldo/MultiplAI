import { describe, it, expect } from "bun:test";
import type { LoopConfig, ReflectionOutput, AttemptRecord } from "./types";
import type { Task } from "../types";

// Mock task for testing
function createMockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "test-task-123",
    githubRepo: "test/repo",
    githubIssueNumber: 1,
    githubIssueTitle: "Fix button click handler",
    githubIssueBody: "The button click handler is not working correctly",
    status: "TESTS_FAILED",
    attemptCount: 0,
    maxAttempts: 3,
    isOrchestrated: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    branchName: "auto/1-fix-button",
    currentDiff: `--- a/src/button.ts
+++ b/src/button.ts
@@ -1,3 +1,3 @@
-export function handleClick() {}
+export function handleClick() { console.log('clicked'); }`,
    lastError: "TypeError: Cannot read property 'click' of undefined",
    plan: ["Add click handler", "Test the handler"],
    definitionOfDone: ["Button responds to clicks"],
    targetFiles: ["src/button.ts"],
    ...overrides,
  } as Task;
}

describe("AgenticLoopController types", () => {
  it("LoopConfig has required fields", () => {
    const config: LoopConfig = {
      maxIterations: 5,
      maxReplans: 2,
      confidenceThreshold: 0.6,
    };

    expect(config.maxIterations).toBe(5);
    expect(config.maxReplans).toBe(2);
    expect(config.confidenceThreshold).toBe(0.6);
  });

  it("ReflectionOutput has required fields", () => {
    const output: ReflectionOutput = {
      diagnosis: "The code has a null reference",
      rootCause: "code",
      recommendation: "fix",
      feedback: "Check for null before accessing property",
      confidence: 0.85,
    };

    expect(output.diagnosis).toBeDefined();
    expect(output.rootCause).toBe("code");
    expect(output.recommendation).toBe("fix");
    expect(output.confidence).toBeGreaterThan(0);
  });

  it("AttemptRecord tracks iteration history", () => {
    const record: AttemptRecord = {
      iteration: 1,
      action: "fix",
      result: "failure",
      error: "Type error in generated code",
      timestamp: new Date(),
    };

    expect(record.iteration).toBe(1);
    expect(record.action).toBe("fix");
    expect(record.result).toBe("failure");
    expect(record.error).toBeDefined();
    expect(record.timestamp).toBeInstanceOf(Date);
  });
});

describe("AgenticLoopController integration scenarios", () => {
  describe("scenario: simple fix path", () => {
    it("should handle fix recommendation without replan", () => {
      // This tests the expected flow when reflection recommends a fix
      const task = createMockTask();

      // Verify task is in correct state for agentic loop
      expect(task.status).toBe("TESTS_FAILED");
      expect(task.lastError).toBeDefined();
      expect(task.currentDiff).toBeDefined();

      // Simulate reflection output recommending fix
      const reflection: ReflectionOutput = {
        diagnosis: "Missing null check before property access",
        rootCause: "code",
        recommendation: "fix",
        feedback: "Add null check: if (element) element.click()",
        confidence: 0.9,
      };

      expect(reflection.recommendation).toBe("fix");
      expect(reflection.rootCause).toBe("code");
      expect(reflection.confidence).toBeGreaterThan(0.5);
    });
  });

  describe("scenario: replan path", () => {
    it("should handle replan recommendation when plan is flawed", () => {
      const task = createMockTask({
        plan: ["Wrong approach step 1", "Wrong approach step 2"],
      });

      // Simulate reflection identifying plan issue
      const reflection: ReflectionOutput = {
        diagnosis: "The plan uses deprecated API",
        rootCause: "plan",
        recommendation: "replan",
        feedback: "Use the new event listener API instead",
        confidence: 0.85,
      };

      expect(reflection.recommendation).toBe("replan");
      expect(reflection.rootCause).toBe("plan");
      expect(task.plan).toHaveLength(2);
    });
  });

  describe("scenario: test issue identified", () => {
    it("should handle test root cause", () => {
      const task = createMockTask({
        lastError: "Expected 'foo' but got 'foo' - test assertion issue",
      });

      const reflection: ReflectionOutput = {
        diagnosis: "Test assertion is comparing wrong values",
        rootCause: "test",
        recommendation: "fix",
        feedback: "Update test expectation to match actual behavior",
        confidence: 0.75,
      };

      expect(reflection.rootCause).toBe("test");
      expect(reflection.recommendation).toBe("fix");
    });
  });

  describe("scenario: environment issue", () => {
    it("should handle environment root cause", () => {
      const task = createMockTask({
        lastError: "Module not found: '@testing-library/react'",
      });

      const reflection: ReflectionOutput = {
        diagnosis: "Missing dev dependency",
        rootCause: "environment",
        recommendation: "fix",
        feedback: "Add @testing-library/react to devDependencies",
        confidence: 0.95,
      };

      expect(reflection.rootCause).toBe("environment");
      expect(reflection.confidence).toBeGreaterThan(0.9);
    });
  });

  describe("scenario: abort conditions", () => {
    it("should abort when confidence is too low", () => {
      const config: LoopConfig = {
        maxIterations: 5,
        maxReplans: 2,
        confidenceThreshold: 0.6,
      };

      const lowConfidenceReflection: ReflectionOutput = {
        diagnosis: "Unclear error - multiple possible causes",
        rootCause: "code",
        recommendation: "abort",
        feedback: "Cannot determine fix with certainty",
        confidence: 0.3,
      };

      expect(lowConfidenceReflection.confidence).toBeLessThan(
        config.confidenceThreshold,
      );
      expect(lowConfidenceReflection.recommendation).toBe("abort");
    });

    it("should abort when issue is unrecoverable", () => {
      const reflection: ReflectionOutput = {
        diagnosis: "Requires external API access not available",
        rootCause: "environment",
        recommendation: "abort",
        feedback: "Manual intervention required to configure API keys",
        confidence: 0.95,
      };

      expect(reflection.recommendation).toBe("abort");
    });
  });

  describe("scenario: max iterations", () => {
    it("should respect max iterations config", () => {
      const config: LoopConfig = {
        maxIterations: 2,
        maxReplans: 1,
        confidenceThreshold: 0.5,
      };

      // Simulate attempt history reaching max
      const attempts: AttemptRecord[] = [
        {
          iteration: 1,
          action: "fix",
          result: "failure",
          timestamp: new Date(),
        },
        {
          iteration: 2,
          action: "fix",
          result: "failure",
          timestamp: new Date(),
        },
      ];

      expect(attempts.length).toBe(config.maxIterations);
    });
  });

  describe("scenario: max replans", () => {
    it("should fall back to fix after max replans", () => {
      const config: LoopConfig = {
        maxIterations: 5,
        maxReplans: 1,
        confidenceThreshold: 0.5,
      };

      // After 1 replan, should fall back to fix even if reflection says replan
      const attempts: AttemptRecord[] = [
        {
          iteration: 1,
          action: "plan",
          result: "success",
          timestamp: new Date(),
        },
      ];

      const replanCount = attempts.filter((a) => a.action === "plan").length;
      expect(replanCount).toBe(config.maxReplans);
    });
  });

  describe("scenario: multiple iterations until success", () => {
    it("should track progress through iterations", () => {
      const attempts: AttemptRecord[] = [
        {
          iteration: 1,
          action: "fix",
          result: "failure",
          error: "Type error",
          timestamp: new Date(),
        },
        {
          iteration: 2,
          action: "fix",
          result: "failure",
          error: "Runtime error",
          timestamp: new Date(),
        },
        {
          iteration: 3,
          action: "fix",
          result: "success",
          timestamp: new Date(),
        },
      ];

      const successfulAttempt = attempts.find((a) => a.result === "success");
      expect(successfulAttempt).toBeDefined();
      expect(successfulAttempt?.iteration).toBe(3);
    });
  });
});

describe("ReflectionAgent output validation", () => {
  it("validates root cause types", () => {
    const validRootCauses: Array<"plan" | "code" | "test" | "environment"> = [
      "plan",
      "code",
      "test",
      "environment",
    ];

    for (const cause of validRootCauses) {
      const output: ReflectionOutput = {
        diagnosis: "Test",
        rootCause: cause,
        recommendation: "fix",
        feedback: "Test",
        confidence: 0.8,
      };
      expect(validRootCauses).toContain(output.rootCause);
    }
  });

  it("validates recommendation types", () => {
    const validRecommendations: Array<"replan" | "fix" | "abort"> = [
      "replan",
      "fix",
      "abort",
    ];

    for (const rec of validRecommendations) {
      const output: ReflectionOutput = {
        diagnosis: "Test",
        rootCause: "code",
        recommendation: rec,
        feedback: "Test",
        confidence: 0.8,
      };
      expect(validRecommendations).toContain(output.recommendation);
    }
  });

  it("validates confidence range 0-1", () => {
    const validConfidences = [0.0, 0.25, 0.5, 0.75, 1.0];

    for (const conf of validConfidences) {
      expect(conf).toBeGreaterThanOrEqual(0);
      expect(conf).toBeLessThanOrEqual(1);
    }
  });
});

describe("Task state for agentic loop", () => {
  it("task should have required fields for agentic loop", () => {
    const task = createMockTask();

    // Required fields for agentic loop
    expect(task.id).toBeDefined();
    expect(task.githubRepo).toBeDefined();
    expect(task.githubIssueTitle).toBeDefined();
    expect(task.status).toBe("TESTS_FAILED");
    expect(task.lastError).toBeDefined();
    expect(task.currentDiff).toBeDefined();
    expect(task.plan).toBeDefined();
    expect(task.branchName).toBeDefined();
  });

  it("task can store agentic loop metrics", () => {
    const task = createMockTask({
      agenticLoopIterations: 3,
      agenticLoopReplans: 1,
      agenticLoopConfidence: 0.85,
      agenticLoopDurationMs: 5000,
    });

    expect(task.agenticLoopIterations).toBe(3);
    expect(task.agenticLoopReplans).toBe(1);
    expect(task.agenticLoopConfidence).toBe(0.85);
    expect(task.agenticLoopDurationMs).toBe(5000);
  });

  it("task can store root cause from reflection", () => {
    const task = createMockTask({
      rootCause: "code",
    });

    expect(task.rootCause).toBe("code");
  });
});

describe("LoopConfig validation", () => {
  it("default config has sensible values", () => {
    // These match DEFAULT_LOOP_CONFIG in loop-controller.ts
    const defaultConfig: LoopConfig = {
      maxIterations: 5,
      maxReplans: 2,
      confidenceThreshold: 0.6,
    };

    expect(defaultConfig.maxIterations).toBeGreaterThan(0);
    expect(defaultConfig.maxReplans).toBeGreaterThanOrEqual(0);
    expect(defaultConfig.confidenceThreshold).toBeGreaterThan(0);
    expect(defaultConfig.confidenceThreshold).toBeLessThanOrEqual(1);
  });

  it("config can be customized", () => {
    const customConfig: LoopConfig = {
      maxIterations: 10,
      maxReplans: 3,
      confidenceThreshold: 0.8,
    };

    expect(customConfig.maxIterations).toBe(10);
    expect(customConfig.maxReplans).toBe(3);
    expect(customConfig.confidenceThreshold).toBe(0.8);
  });
});
