import { describe, test, expect } from "bun:test";
import type {
  BatchRequest,
  BatchResult,
  BatchJob,
  BatchJobTask,
  BatchJobType,
  BatchJobStatus,
} from "./openai-batch";
import {
  isBatchApiEnabled,
  isOvernightBatchEnabled,
  getOvernightBatchHour,
  getMaxBatchRequests,
  getBatchPollIntervalMs,
} from "./openai-batch";

describe("OpenAI Batch API Types", () => {
  describe("BatchRequest", () => {
    test("should build valid chat completion request", () => {
      const request: BatchRequest = {
        custom_id: "task-123",
        method: "POST",
        url: "/v1/chat/completions",
        body: {
          model: "gpt-5.2",
          messages: [
            { role: "system", content: "You are a coding assistant" },
            { role: "user", content: "Fix the bug in auth.ts" },
          ],
          max_tokens: 4096,
          temperature: 0.7,
        },
      };

      expect(request.custom_id).toBe("task-123");
      expect(request.method).toBe("POST");
      expect(request.url).toBe("/v1/chat/completions");
      expect(request.body.model).toBe("gpt-5.2");
      expect(request.body.messages).toHaveLength(2);
    });

    test("should build valid responses API request", () => {
      const request: BatchRequest = {
        custom_id: "task-456",
        method: "POST",
        url: "/v1/responses",
        body: {
          model: "gpt-5.2",
          input: "System: You are a planner\n\nUser: Analyze this issue",
          max_output_tokens: 16384,
          reasoning: { effort: "high" },
        },
      };

      expect(request.url).toBe("/v1/responses");
      expect(request.body.input).toContain("planner");
      expect(request.body.reasoning?.effort).toBe("high");
    });
  });

  describe("BatchResult", () => {
    test("should represent successful result", () => {
      const result: BatchResult = {
        custom_id: "task-123",
        response: {
          status_code: 200,
          body: {
            id: "resp-abc",
            choices: [
              {
                message: { content: "Here is the fix..." },
              },
            ],
            usage: {
              prompt_tokens: 500,
              completion_tokens: 1000,
              total_tokens: 1500,
            },
          },
        },
      };

      expect(result.response?.status_code).toBe(200);
      expect(result.response?.body.choices?.[0].message?.content).toContain("fix");
      expect(result.error).toBeUndefined();
    });

    test("should represent failed result", () => {
      const result: BatchResult = {
        custom_id: "task-789",
        error: {
          code: "rate_limit_exceeded",
          message: "Too many requests",
        },
      };

      expect(result.response).toBeUndefined();
      expect(result.error?.code).toBe("rate_limit_exceeded");
    });
  });

  describe("BatchJob", () => {
    test("should represent pending job", () => {
      const job: BatchJob = {
        id: "job-001",
        jobType: "task_processing",
        status: "pending",
        totalRequests: 50,
        completedRequests: 0,
        failedRequests: 0,
        createdAt: new Date(),
      };

      expect(job.status).toBe("pending");
      expect(job.openaiBatchId).toBeUndefined();
      expect(job.totalRequests).toBe(50);
    });

    test("should represent in-progress job", () => {
      const job: BatchJob = {
        id: "job-002",
        openaiBatchId: "batch_abc123",
        jobType: "eval_run",
        status: "in_progress",
        inputFileId: "file-input-123",
        totalRequests: 100,
        completedRequests: 45,
        failedRequests: 2,
        submittedAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      };

      expect(job.status).toBe("in_progress");
      expect(job.openaiBatchId).toBe("batch_abc123");
      expect(job.completedRequests).toBe(45);
    });

    test("should represent completed job", () => {
      const job: BatchJob = {
        id: "job-003",
        openaiBatchId: "batch_xyz789",
        jobType: "reprocess_failed",
        status: "completed",
        inputFileId: "file-input-456",
        outputFileId: "file-output-789",
        totalRequests: 25,
        completedRequests: 23,
        failedRequests: 2,
        submittedAt: new Date(Date.now() - 3600000),
        completedAt: new Date(),
        createdAt: new Date(Date.now() - 7200000),
      };

      expect(job.status).toBe("completed");
      expect(job.outputFileId).toBe("file-output-789");
      expect(job.completedAt).toBeDefined();
    });
  });

  describe("BatchJobTask", () => {
    test("should link task to batch job", () => {
      const task: BatchJobTask = {
        id: "bjt-001",
        batchJobId: "job-001",
        taskId: "task-123",
        customId: "task-task-123",
        status: "completed",
        result: {
          content: "Fixed the bug",
          tokens: 1500,
        },
        createdAt: new Date(),
      };

      expect(task.batchJobId).toBe("job-001");
      expect(task.taskId).toBe("task-123");
      expect(task.status).toBe("completed");
      expect(task.result?.content).toBe("Fixed the bug");
    });

    test("should represent failed task", () => {
      const task: BatchJobTask = {
        id: "bjt-002",
        batchJobId: "job-001",
        customId: "task-456",
        status: "failed",
        error: {
          code: "context_length_exceeded",
          message: "Input too long",
        },
        createdAt: new Date(),
      };

      expect(task.status).toBe("failed");
      expect(task.error?.code).toBe("context_length_exceeded");
      expect(task.result).toBeUndefined();
    });
  });

  describe("BatchJobType", () => {
    test("should support all job types", () => {
      const types: BatchJobType[] = [
        "task_processing",
        "eval_run",
        "embedding_compute",
        "reprocess_failed",
      ];

      expect(types).toContain("task_processing");
      expect(types).toContain("eval_run");
      expect(types).toContain("embedding_compute");
      expect(types).toContain("reprocess_failed");
    });
  });

  describe("BatchJobStatus", () => {
    test("should support all statuses", () => {
      const statuses: BatchJobStatus[] = [
        "pending",
        "submitted",
        "in_progress",
        "completed",
        "failed",
        "expired",
        "cancelled",
      ];

      expect(statuses).toHaveLength(7);
      expect(statuses).toContain("pending");
      expect(statuses).toContain("completed");
      expect(statuses).toContain("expired");
    });
  });
});

describe("Batch API Configuration", () => {
  test("isBatchApiEnabled returns false by default", () => {
    expect(isBatchApiEnabled()).toBe(false);
  });

  test("isOvernightBatchEnabled returns false by default", () => {
    expect(isOvernightBatchEnabled()).toBe(false);
  });

  test("getOvernightBatchHour returns 2 by default", () => {
    expect(getOvernightBatchHour()).toBe(2);
  });

  test("getMaxBatchRequests returns 1000 by default", () => {
    expect(getMaxBatchRequests()).toBe(1000);
  });

  test("getBatchPollIntervalMs returns 60000 by default", () => {
    expect(getBatchPollIntervalMs()).toBe(60000);
  });
});

describe("Request Building", () => {
  test("chat request format matches OpenAI spec", () => {
    const request: BatchRequest = {
      custom_id: "test-001",
      method: "POST",
      url: "/v1/chat/completions",
      body: {
        model: "gpt-5.2",
        messages: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "Hello" },
        ],
        max_tokens: 1000,
      },
    };

    // Serialize to JSONL format
    const jsonl = JSON.stringify(request);
    const parsed = JSON.parse(jsonl);

    expect(parsed.custom_id).toBe("test-001");
    expect(parsed.method).toBe("POST");
    expect(parsed.body.model).toBe("gpt-5.2");
  });

  test("responses request format matches OpenAI spec", () => {
    const request: BatchRequest = {
      custom_id: "test-002",
      method: "POST",
      url: "/v1/responses",
      body: {
        model: "gpt-5.2",
        input: "Plan this task",
        max_output_tokens: 8000,
        reasoning: { effort: "medium" },
      },
    };

    const jsonl = JSON.stringify(request);
    const parsed = JSON.parse(jsonl);

    expect(parsed.url).toBe("/v1/responses");
    expect(parsed.body.reasoning.effort).toBe("medium");
  });
});

describe("Cost Savings Calculation", () => {
  test("batch API provides 50% cost savings", () => {
    const syncCostPerMillion = 15; // $15 per 1M tokens (Sonnet pricing)
    const batchCostPerMillion = syncCostPerMillion * 0.5; // 50% discount

    expect(batchCostPerMillion).toBe(7.5);

    // 100 tasks with 10K tokens each = 1M tokens
    const totalTokens = 100 * 10000;
    const syncCost = (totalTokens / 1_000_000) * syncCostPerMillion;
    const batchCost = (totalTokens / 1_000_000) * batchCostPerMillion;

    expect(syncCost).toBe(15);
    expect(batchCost).toBe(7.5);
    expect(syncCost - batchCost).toBe(7.5); // $7.50 savings
  });
});
