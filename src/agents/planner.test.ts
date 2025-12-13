import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlannerAgent } from "./planner";
import { LLMClient } from "../integrations/llm";

// Mock the LLMClient
vi.mock("../integrations/llm", () => ({
  LLMClient: vi.fn().mockImplementation(() => ({
    complete: vi.fn().mockResolvedValue('{"definitionOfDone": ["Test DoD"], "plan": ["Test plan"], "targetFiles": ["test.ts"], "estimatedComplexity": "XS"}'),
  })),
}));

describe("PlannerAgent", () => {
  let planner: PlannerAgent;
  let mockLLM: any;

  beforeEach(() => {
    vi.clearAllMocks();
    planner = new PlannerAgent();
    mockLLM = new LLMClient();
  });

  it("should include previousFeedback and failedApproaches in prompt when provided", async () => {
    const input = {
      issueTitle: "Test Issue",
      issueBody: "Test body",
      repoContext: "Test context",
      previousFeedback: "Previous feedback",
      failedApproaches: ["Approach 1", "Approach 2"],
    };

    await planner.run(input);

    expect(mockLLM.complete).toHaveBeenCalledWith({
      model: expect.any(String),
      maxTokens: expect.any(Number),
      temperature: expect.any(Number),
      systemPrompt: expect.stringContaining("Previous attempt failed because: Previous feedback"),
      userPrompt: expect.any(String),
      reasoningEffort: undefined,
    });
    expect(mockLLM.complete).toHaveBeenCalledWith({
      model: expect.any(String),
      maxTokens: expect.any(Number),
      temperature: expect.any(Number),
      systemPrompt: expect.stringContaining("Avoid these approaches: Approach 1, Approach 2"),
      userPrompt: expect.any(String),
      reasoningEffort: undefined,
    });
  });

  it("should replace placeholders with empty strings when not provided", async () => {
    const input = {
      issueTitle: "Test Issue",
      issueBody: "Test body",
      repoContext: "Test context",
    };

    await planner.run(input);

    expect(mockLLM.complete).toHaveBeenCalledWith({
      model: expect.any(String),
      maxTokens: expect.any(Number),
      temperature: expect.any(Number),
      systemPrompt: expect.stringContaining("Previous attempt failed because: "),
      userPrompt: expect.any(String),
      reasoningEffort: undefined,
    });
    expect(mockLLM.complete).toHaveBeenCalledWith({
      model: expect.any(String),
      maxTokens: expect.any(Number),
      temperature: expect.any(Number),
      systemPrompt: expect.stringContaining("Avoid these approaches: "),
      userPrompt: expect.any(String),
      reasoningEffort: undefined,
    });
  });
});