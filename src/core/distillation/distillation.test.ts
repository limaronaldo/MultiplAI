import { describe, test, expect } from "bun:test";
import type {
  DistillationExample,
  TrainingJob,
  EvalResults,
  QualityFilter,
  FineTuningExample,
} from "./types";
import {
  DEFAULT_QUALITY_FILTER,
  DISTILLATION_TARGETS,
} from "./types";
import {
  isDistillationEnabled,
  getMinExamplesForTraining,
  getQualityThreshold,
  isAutoCollectEnabled,
} from "./trainer";

describe("Distillation Types", () => {
  describe("DistillationExample", () => {
    test("should represent a complete example", () => {
      const example: DistillationExample = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        taskId: "123e4567-e89b-12d3-a456-426614174001",
        issueTitle: "Fix login bug",
        issueBody: "Users cannot log in with special characters",
        targetFiles: ["src/auth.ts", "src/utils/validate.ts"],
        fileContents: {
          "src/auth.ts": "export function login() { ... }",
        },
        plan: "1. Update validation\n2. Add escape handling",
        diff: "diff --git a/src/auth.ts b/src/auth.ts\n...",
        commitMessage: "fix: handle special chars in login",
        sourceModel: "claude-opus-4-5-20251101",
        complexity: "XS",
        effort: "low",
        tokensUsed: 1500,
        testsPassed: true,
        reviewApproved: true,
        prMerged: true,
        humanEditsRequired: 0,
        includedInTraining: false,
        createdAt: new Date(),
      };

      expect(example.issueTitle).toBe("Fix login bug");
      expect(example.targetFiles).toHaveLength(2);
      expect(example.testsPassed).toBe(true);
      expect(example.prMerged).toBe(true);
    });

    test("should allow minimal example", () => {
      const example: DistillationExample = {
        id: "123e4567-e89b-12d3-a456-426614174002",
        taskId: "123e4567-e89b-12d3-a456-426614174003",
        issueTitle: "Quick fix",
        targetFiles: [],
        diff: "--- a/file.ts\n+++ b/file.ts",
        sourceModel: "gpt-5.2",
        testsPassed: true,
        reviewApproved: true,
        prMerged: true,
        humanEditsRequired: 0,
        includedInTraining: false,
        createdAt: new Date(),
      };

      expect(example.issueBody).toBeUndefined();
      expect(example.plan).toBeUndefined();
      expect(example.complexity).toBeUndefined();
    });
  });

  describe("TrainingJob", () => {
    test("should represent pending job", () => {
      const job: TrainingJob = {
        id: "job-001",
        baseModel: "gpt-4o-mini",
        status: "pending",
        exampleCount: 0,
        deployed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(job.status).toBe("pending");
      expect(job.fineTunedModelId).toBeUndefined();
    });

    test("should represent completed job", () => {
      const job: TrainingJob = {
        id: "job-002",
        baseModel: "gpt-4o-mini",
        targetComplexity: "XS",
        targetEffort: "low",
        trainingFileId: "file-train-123",
        validationFileId: "file-val-456",
        openaiJobId: "ftjob-abc",
        status: "completed",
        exampleCount: 75,
        fineTunedModelId: "ft:gpt-4o-mini:org::abc123",
        evalResults: {
          baselineScore: 0.9,
          fineTunedScore: 0.88,
          passRate: 0.88,
          avgTokens: 800,
        },
        deployed: true,
        deployedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(job.status).toBe("completed");
      expect(job.fineTunedModelId).toContain("ft:gpt-4o-mini");
      expect(job.deployed).toBe(true);
      expect(job.evalResults?.passRate).toBe(0.88);
    });
  });

  describe("EvalResults", () => {
    test("should calculate reductions", () => {
      const results: EvalResults = {
        passRate: 0.85,
        avgTokens: 800,
        avgLatencyMs: 2000,
        baselinePassRate: 0.9,
        tokenReduction: 0.84, // 84% fewer tokens
        latencyReduction: 0.8, // 80% faster
        costReduction: 0.95, // 95% cheaper
        examples: [
          { exampleId: "ex-1", passed: true, tokensUsed: 750, latencyMs: 1800 },
          { exampleId: "ex-2", passed: true, tokensUsed: 850, latencyMs: 2200 },
          { exampleId: "ex-3", passed: false, tokensUsed: 800, latencyMs: 2000, error: "Invalid diff" },
        ],
      };

      expect(results.passRate).toBe(0.85);
      expect(results.tokenReduction).toBeGreaterThan(0.8);
      expect(results.costReduction).toBeGreaterThan(0.9);
      expect(results.examples).toHaveLength(3);
    });
  });

  describe("QualityFilter", () => {
    test("default filter should require high quality", () => {
      expect(DEFAULT_QUALITY_FILTER.requireTestsPassed).toBe(true);
      expect(DEFAULT_QUALITY_FILTER.requireReviewApproved).toBe(true);
      expect(DEFAULT_QUALITY_FILTER.requirePrMerged).toBe(true);
      expect(DEFAULT_QUALITY_FILTER.maxHumanEdits).toBe(5);
      expect(DEFAULT_QUALITY_FILTER.maxTokens).toBe(10000);
    });

    test("should allow custom filter", () => {
      const filter: QualityFilter = {
        requireTestsPassed: true,
        requireReviewApproved: false,
        requirePrMerged: true,
        maxHumanEdits: 10,
        maxTokens: 20000,
        complexities: ["XS", "S"],
        efforts: ["low", "medium"],
      };

      expect(filter.requireReviewApproved).toBe(false);
      expect(filter.complexities).toContain("XS");
      expect(filter.efforts).toContain("medium");
    });
  });

  describe("FineTuningExample", () => {
    test("should have correct message format", () => {
      const example: FineTuningExample = {
        messages: [
          { role: "system", content: "You are a code generator." },
          { role: "user", content: "Fix the bug in auth.ts" },
          { role: "assistant", content: "diff --git a/src/auth.ts..." },
        ],
      };

      expect(example.messages).toHaveLength(3);
      expect(example.messages[0].role).toBe("system");
      expect(example.messages[1].role).toBe("user");
      expect(example.messages[2].role).toBe("assistant");
    });
  });

  describe("DISTILLATION_TARGETS", () => {
    test("should have predefined targets", () => {
      expect(DISTILLATION_TARGETS.length).toBeGreaterThan(0);

      const opusTarget = DISTILLATION_TARGETS.find(t =>
        t.sourceModel.includes("opus")
      );
      expect(opusTarget).toBeDefined();
      expect(opusTarget?.targetModel).toBe("gpt-4o-mini");
      expect(opusTarget?.minExamples).toBe(50);
    });

    test("should include gpt-5.2 target", () => {
      const gpt52Target = DISTILLATION_TARGETS.find(t =>
        t.sourceModel.includes("gpt-5.2")
      );
      expect(gpt52Target).toBeDefined();
      expect(gpt52Target?.useCase).toContain("Simple");
    });
  });
});

describe("Configuration Helpers", () => {
  test("isDistillationEnabled returns false by default", () => {
    expect(isDistillationEnabled()).toBe(false);
  });

  test("getMinExamplesForTraining returns 50 by default", () => {
    expect(getMinExamplesForTraining()).toBe(50);
  });

  test("getQualityThreshold returns 0.9 by default", () => {
    expect(getQualityThreshold()).toBe(0.9);
  });

  test("isAutoCollectEnabled returns false by default", () => {
    expect(isAutoCollectEnabled()).toBe(false);
  });
});

describe("Cost Savings Calculation", () => {
  test("distillation provides significant cost savings", () => {
    // Opus pricing: $15/1M input, $75/1M output
    // Fine-tuned gpt-4o-mini: $0.3/1M input, $1.2/1M output

    const opusCostPer1K = (15 + 75) / 1000; // $0.09 per 1K tokens
    const miniCostPer1K = (0.3 + 1.2) / 1000; // $0.0015 per 1K tokens

    const costReduction = 1 - (miniCostPer1K / opusCostPer1K);

    expect(costReduction).toBeGreaterThan(0.95); // >95% cost reduction
  });

  test("latency improvement with smaller models", () => {
    // Typical latency: Opus ~10s, gpt-4o-mini ~1s
    const opusLatencyMs = 10000;
    const miniLatencyMs = 1000;

    const latencyReduction = 1 - (miniLatencyMs / opusLatencyMs);

    expect(latencyReduction).toBe(0.9); // 90% faster
  });
});

describe("Training Workflow", () => {
  test("training job status transitions", () => {
    const statuses = [
      "pending",
      "collecting",
      "uploading",
      "training",
      "evaluating",
      "completed",
    ];

    // Verify valid progression
    for (let i = 0; i < statuses.length - 1; i++) {
      expect(statuses[i + 1]).not.toBe(statuses[i]);
    }
  });

  test("failed job can retry", () => {
    const job: TrainingJob = {
      id: "job-failed",
      baseModel: "gpt-4o-mini",
      status: "failed",
      error: "Insufficient examples",
      exampleCount: 25,
      deployed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(job.status).toBe("failed");
    expect(job.error).toContain("Insufficient");
    expect(job.exampleCount).toBeLessThan(50);
  });
});
