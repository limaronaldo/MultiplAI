import { describe, test, expect, beforeEach, mock } from "bun:test";
import type {
  PromptVersion,
  OptimizationData,
  ABTest,
  DatasetExport,
  FailureMode,
} from "./types";
import { AGENT_GRADERS } from "./types";

// Mock the database module
const mockSql = mock(() => Promise.resolve([]));
mock.module("../../integrations/db", () => ({
  getDb: () => mockSql,
}));

describe("Prompt Optimization Types", () => {
  describe("FailureMode", () => {
    test("should include planner failure modes", () => {
      const plannerModes: FailureMode[] = [
        "wrong_files",
        "missing_acceptance_criteria",
        "wrong_complexity",
        "incomplete_plan",
      ];
      expect(plannerModes.every((m) => typeof m === "string")).toBe(true);
    });

    test("should include coder failure modes", () => {
      const coderModes: FailureMode[] = [
        "syntax_error",
        "incomplete_diff",
        "wrong_approach",
        "missing_imports",
      ];
      expect(coderModes.every((m) => typeof m === "string")).toBe(true);
    });

    test("should include fixer failure modes", () => {
      const fixerModes: FailureMode[] = [
        "same_error_repeated",
        "introduced_new_bug",
        "wrong_fix_location",
      ];
      expect(fixerModes.every((m) => typeof m === "string")).toBe(true);
    });

    test("should include reviewer failure modes", () => {
      const reviewerModes: FailureMode[] = [
        "false_positive",
        "false_negative",
        "unclear_feedback",
      ];
      expect(reviewerModes.every((m) => typeof m === "string")).toBe(true);
    });
  });

  describe("AGENT_GRADERS", () => {
    test("should have graders for planner", () => {
      expect(AGENT_GRADERS.planner).toBeDefined();
      expect(AGENT_GRADERS.planner.length).toBeGreaterThan(0);
      expect(AGENT_GRADERS.planner[0].type).toBe("string_check");
    });

    test("should have graders for coder", () => {
      expect(AGENT_GRADERS.coder).toBeDefined();
      expect(AGENT_GRADERS.coder.length).toBeGreaterThan(0);
      expect(AGENT_GRADERS.coder[0].type).toBe("text_similarity");
    });

    test("should have graders for fixer", () => {
      expect(AGENT_GRADERS.fixer).toBeDefined();
      expect(AGENT_GRADERS.fixer.length).toBeGreaterThan(0);
      expect(AGENT_GRADERS.fixer[0].type).toBe("label_model");
    });

    test("should have graders for reviewer", () => {
      expect(AGENT_GRADERS.reviewer).toBeDefined();
      expect(AGENT_GRADERS.reviewer.length).toBeGreaterThan(0);
      expect(AGENT_GRADERS.reviewer[0].type).toBe("score_model");
    });
  });
});

describe("PromptVersion", () => {
  test("should validate prompt version structure", () => {
    const version: PromptVersion = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      promptId: "planner",
      version: 1,
      content: "You are a planner agent...",
      createdAt: new Date(),
      isActive: true,
      tasksExecuted: 10,
      successRate: 85.5,
      avgTokens: 1500,
    };

    expect(version.promptId).toBe("planner");
    expect(version.version).toBe(1);
    expect(version.isActive).toBe(true);
  });
});

describe("OptimizationData", () => {
  test("should validate optimization data structure", () => {
    const data: OptimizationData = {
      id: "123e4567-e89b-12d3-a456-426614174001",
      promptId: "coder",
      taskId: "123e4567-e89b-12d3-a456-426614174002",
      inputVariables: {
        issue_title: "Fix login bug",
        plan: "1. Update auth.ts\n2. Add error handling",
      },
      output: "diff --git a/src/auth.ts...",
      rating: "good",
      failureMode: undefined,
      createdAt: new Date(),
    };

    expect(data.promptId).toBe("coder");
    expect(data.rating).toBe("good");
    expect(data.inputVariables.issue_title).toBe("Fix login bug");
  });

  test("should allow failure mode annotation", () => {
    const data: OptimizationData = {
      id: "123e4567-e89b-12d3-a456-426614174003",
      promptId: "coder",
      taskId: "123e4567-e89b-12d3-a456-426614174004",
      inputVariables: {},
      output: "invalid diff",
      rating: "bad",
      failureMode: "syntax_error",
      outputFeedback: "The diff has incorrect hunk headers",
      createdAt: new Date(),
    };

    expect(data.rating).toBe("bad");
    expect(data.failureMode).toBe("syntax_error");
    expect(data.outputFeedback).toContain("hunk headers");
  });
});

describe("ABTest", () => {
  test("should validate A/B test structure", () => {
    const test: ABTest = {
      id: "123e4567-e89b-12d3-a456-426614174005",
      promptId: "planner",
      versionA: 1,
      versionB: 2,
      trafficSplit: 0.5,
      status: "running",
      createdAt: new Date(),
    };

    expect(test.versionA).toBe(1);
    expect(test.versionB).toBe(2);
    expect(test.trafficSplit).toBe(0.5);
    expect(test.status).toBe("running");
  });

  test("should include stats when completed", () => {
    const test: ABTest = {
      id: "123e4567-e89b-12d3-a456-426614174006",
      promptId: "coder",
      versionA: 1,
      versionB: 2,
      trafficSplit: 0.5,
      status: "completed",
      versionAStats: {
        tasksExecuted: 50,
        successRate: 80,
        avgTokens: 1500,
      },
      versionBStats: {
        tasksExecuted: 50,
        successRate: 85,
        avgTokens: 1400,
      },
      winner: "B",
      createdAt: new Date(),
      completedAt: new Date(),
    };

    expect(test.status).toBe("completed");
    expect(test.winner).toBe("B");
    expect(test.versionBStats?.successRate).toBe(85);
  });
});

describe("DatasetExport", () => {
  test("should validate dataset export structure", () => {
    const dataset: DatasetExport = {
      promptId: "reviewer",
      version: 3,
      exportedAt: new Date(),
      totalRows: 100,
      rows: [
        {
          input: { diff: "--- a/file.ts\n+++ b/file.ts" },
          output: "APPROVED",
          rating: "good",
          testsPassed: true,
          prMerged: true,
        },
        {
          input: { diff: "malformed diff" },
          output: "APPROVED",
          rating: "bad",
          failureMode: "false_positive",
          testsPassed: false,
        },
      ],
    };

    expect(dataset.promptId).toBe("reviewer");
    expect(dataset.totalRows).toBe(100);
    expect(dataset.rows.length).toBe(2);
    expect(dataset.rows[1].failureMode).toBe("false_positive");
  });
});

describe("Grader Definitions", () => {
  test("string_check grader should have required fields", () => {
    const grader = AGENT_GRADERS.planner[0];
    expect(grader.type).toBe("string_check");
    if (grader.type === "string_check") {
      expect(grader.operation).toBe("contains");
      expect(grader.compare).toBeDefined();
      expect(grader.reference).toBeDefined();
    }
  });

  test("text_similarity grader should have threshold", () => {
    const grader = AGENT_GRADERS.coder[0];
    expect(grader.type).toBe("text_similarity");
    if (grader.type === "text_similarity") {
      expect(grader.threshold).toBeGreaterThan(0);
      expect(grader.threshold).toBeLessThanOrEqual(1);
    }
  });

  test("label_model grader should have labels", () => {
    const grader = AGENT_GRADERS.fixer[0];
    expect(grader.type).toBe("label_model");
    if (grader.type === "label_model") {
      expect(grader.labels.length).toBeGreaterThan(0);
      expect(grader.prompt).toBeDefined();
    }
  });

  test("score_model grader should have range", () => {
    const grader = AGENT_GRADERS.reviewer[0];
    expect(grader.type).toBe("score_model");
    if (grader.type === "score_model") {
      expect(grader.range).toHaveLength(2);
      expect(grader.range[0]).toBeLessThan(grader.range[1]);
    }
  });
});

describe("Configuration Helpers", () => {
  test("isPromptOptimizationEnabled returns false by default", async () => {
    const { isPromptOptimizationEnabled } = await import("./optimizer");
    // Default should be false
    expect(isPromptOptimizationEnabled()).toBe(false);
  });

  test("getMinSamplesForOptimization returns default value", async () => {
    const { getMinSamplesForOptimization } = await import("./optimizer");
    expect(getMinSamplesForOptimization()).toBe(50);
  });
});
