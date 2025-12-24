/**
 * Mixture-of-Agents (MoA) Pattern
 *
 * Implements layered multi-model code generation inspired by AutoGen.
 * Multiple "proposer" models generate solutions in parallel, then an
 * "aggregator" model synthesizes the best solution.
 *
 * Benefits:
 * - Better solutions through diverse model perspectives
 * - Cost-effective: use cheap models as proposers, expensive as aggregator
 * - Resilient: one bad proposal doesn't fail the whole task
 *
 * @see https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/mixture-of-agents.html
 */

import { LLMClient } from "../integrations/llm";
import type { Task } from "./types";

// ============================================
// Types
// ============================================

export interface MoAConfig {
  /** Number of proposal layers (default: 2) */
  layers: number;
  /** Number of proposers per layer (default: 3) */
  proposersPerLayer: number;
  /** Models to use as proposers (rotated across layers) */
  proposerModels: string[];
  /** Model to use for aggregation (should be high-quality) */
  aggregatorModel: string;
  /** Maximum tokens for proposers */
  proposerMaxTokens: number;
  /** Maximum tokens for aggregator */
  aggregatorMaxTokens: number;
  /** Temperature for proposers (higher = more diverse) */
  proposerTemperature: number;
  /** Temperature for aggregator (lower = more focused) */
  aggregatorTemperature: number;
}

export interface ProposerResult {
  model: string;
  diff: string;
  reasoning?: string;
  confidence?: number;
  layerId: number;
  proposerId: number;
}

export interface MoAResult {
  /** Final aggregated diff */
  diff: string;
  /** All proposer results by layer */
  proposerResults: ProposerResult[][];
  /** Aggregation metadata */
  aggregation: {
    model: string;
    reasoning: string;
    selectedFrom: number;
  };
  /** Total tokens used */
  totalTokens: number;
  /** Estimated cost */
  estimatedCost: number;
}

// ============================================
// Default Configurations
// ============================================

/** Default MoA configuration - balanced quality and cost */
export const DEFAULT_MOA_CONFIG: MoAConfig = {
  layers: 2,
  proposersPerLayer: 3,
  proposerModels: [
    "deepseek/deepseek-chat",
    "x-ai/grok-code-fast-1",
    "claude-haiku-4-5-20251015",
  ],
  aggregatorModel: "claude-sonnet-4-5-20250929",
  proposerMaxTokens: 4096,
  aggregatorMaxTokens: 8192,
  proposerTemperature: 0.7,
  aggregatorTemperature: 0.3,
};

/** Lite MoA configuration - faster, cheaper, for simpler tasks */
export const MOA_LITE_CONFIG: MoAConfig = {
  layers: 1,
  proposersPerLayer: 2,
  proposerModels: ["deepseek/deepseek-chat", "x-ai/grok-code-fast-1"],
  aggregatorModel: "deepseek/deepseek-chat",
  proposerMaxTokens: 2048,
  aggregatorMaxTokens: 4096,
  proposerTemperature: 0.5,
  aggregatorTemperature: 0.2,
};

/** Heavy MoA configuration - maximum quality for complex tasks */
export const MOA_HEAVY_CONFIG: MoAConfig = {
  layers: 3,
  proposersPerLayer: 4,
  proposerModels: [
    "claude-sonnet-4-5-20250929",
    "deepseek/deepseek-r1",
    "x-ai/grok-3",
    "claude-haiku-4-5-20251015",
  ],
  aggregatorModel: "claude-opus-4-5-20251101",
  proposerMaxTokens: 8192,
  aggregatorMaxTokens: 16384,
  proposerTemperature: 0.8,
  aggregatorTemperature: 0.2,
};

// ============================================
// MixtureOfAgents Class
// ============================================

export class MixtureOfAgents {
  private llm: LLMClient;
  private config: MoAConfig;

  constructor(config: Partial<MoAConfig> = {}) {
    this.llm = new LLMClient();
    this.config = { ...DEFAULT_MOA_CONFIG, ...config };
  }

  /**
   * Run MoA for a coding task
   *
   * @param task - The task context
   * @param plan - Implementation plan steps
   * @param context - Additional context (file contents, etc.)
   * @returns Aggregated result with best diff
   */
  async run(
    task: Task,
    plan: string[],
    context: string,
  ): Promise<MoAResult> {
    const allProposerResults: ProposerResult[][] = [];
    let previousLayerResults: ProposerResult[] = [];
    let totalTokens = 0;

    // Run each layer
    for (let layerId = 0; layerId < this.config.layers; layerId++) {
      const layerResults = await this.runLayer(
        layerId,
        task,
        plan,
        context,
        previousLayerResults,
      );
      allProposerResults.push(layerResults);
      previousLayerResults = layerResults;

      // Estimate tokens (rough approximation)
      totalTokens += layerResults.length * this.config.proposerMaxTokens;
    }

    // Aggregate results
    const aggregation = await this.aggregate(
      task,
      plan,
      context,
      allProposerResults,
    );
    totalTokens += this.config.aggregatorMaxTokens;

    // Estimate cost (very rough)
    const estimatedCost = this.estimateCost(totalTokens);

    return {
      diff: aggregation.diff,
      proposerResults: allProposerResults,
      aggregation: {
        model: this.config.aggregatorModel,
        reasoning: aggregation.reasoning,
        selectedFrom: allProposerResults.flat().length,
      },
      totalTokens,
      estimatedCost,
    };
  }

  /**
   * Run a single layer of proposers
   */
  private async runLayer(
    layerId: number,
    task: Task,
    plan: string[],
    context: string,
    previousResults: ProposerResult[],
  ): Promise<ProposerResult[]> {
    const proposerPromises: Promise<ProposerResult>[] = [];

    for (let i = 0; i < this.config.proposersPerLayer; i++) {
      const model =
        this.config.proposerModels[i % this.config.proposerModels.length];
      proposerPromises.push(
        this.runProposer(layerId, i, model, task, plan, context, previousResults),
      );
    }

    // Run all proposers in parallel
    const results = await Promise.allSettled(proposerPromises);

    return results
      .filter((r): r is PromiseFulfilledResult<ProposerResult> => r.status === "fulfilled")
      .map((r) => r.value);
  }

  /**
   * Run a single proposer
   */
  private async runProposer(
    layerId: number,
    proposerId: number,
    model: string,
    task: Task,
    plan: string[],
    context: string,
    previousResults: ProposerResult[],
  ): Promise<ProposerResult> {
    const previousContext =
      previousResults.length > 0
        ? `\n\n## Previous Proposals (for reference)\n${previousResults
            .map(
              (r, i) =>
                `### Proposal ${i + 1} (${r.model})\n\`\`\`diff\n${r.diff}\n\`\`\``,
            )
            .join("\n\n")}`
        : "";

    const systemPrompt = `You are a code generation agent (Proposer ${proposerId + 1} in Layer ${layerId + 1}).
Your task is to generate a unified diff that implements the requested changes.

IMPORTANT:
- Generate ONLY a valid unified diff
- Be creative and consider different approaches
- If previous proposals exist, try to improve upon them or take a different approach
- Focus on correctness, readability, and best practices`;

    const userPrompt = `## Task
${task.githubIssueTitle}

${task.githubIssueBody}

## Implementation Plan
${plan.map((step, i) => `${i + 1}. ${step}`).join("\n")}

## Context
${context}
${previousContext}

Generate a unified diff that implements these changes. Output ONLY the diff, no explanations.`;

    try {
      const response = await this.llm.complete({
        model,
        maxTokens: this.config.proposerMaxTokens,
        temperature: this.config.proposerTemperature,
        systemPrompt,
        userPrompt,
      });

      // Extract diff from response
      const diff = this.extractDiff(response);

      return {
        model,
        diff,
        reasoning: undefined,
        confidence: undefined,
        layerId,
        proposerId,
      };
    } catch (error) {
      console.error(`Proposer ${proposerId} (${model}) failed:`, error);
      return {
        model,
        diff: "",
        reasoning: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        confidence: 0,
        layerId,
        proposerId,
      };
    }
  }

  /**
   * Aggregate all proposals into final result
   */
  private async aggregate(
    task: Task,
    plan: string[],
    context: string,
    allResults: ProposerResult[][],
  ): Promise<{ diff: string; reasoning: string }> {
    const allProposals = allResults.flat().filter((r) => r.diff.length > 0);

    if (allProposals.length === 0) {
      throw new Error("No valid proposals to aggregate");
    }

    if (allProposals.length === 1) {
      return { diff: allProposals[0].diff, reasoning: "Single proposal selected" };
    }

    const systemPrompt = `You are an expert code aggregator. Your task is to analyze multiple code proposals and synthesize the best solution.

You will receive several diff proposals from different models. Analyze each one for:
1. Correctness - Does it correctly implement the requirements?
2. Completeness - Does it handle all cases?
3. Code quality - Is it clean, readable, maintainable?
4. Best practices - Does it follow conventions?

Then synthesize the best parts of each proposal into a final, optimal diff.`;

    const userPrompt = `## Task
${task.githubIssueTitle}

${task.githubIssueBody}

## Implementation Plan
${plan.map((step, i) => `${i + 1}. ${step}`).join("\n")}

## Context
${context}

## Proposals
${allProposals
  .map(
    (p, i) =>
      `### Proposal ${i + 1} (${p.model}, Layer ${p.layerId + 1})
\`\`\`diff
${p.diff}
\`\`\``,
  )
  .join("\n\n")}

## Instructions
1. Analyze each proposal
2. Identify the best elements from each
3. Synthesize a final, optimal diff
4. Explain your reasoning

Respond in this format:
<reasoning>
Your analysis and reasoning here
</reasoning>

<diff>
Your final unified diff here
</diff>`;

    const response = await this.llm.complete({
      model: this.config.aggregatorModel,
      maxTokens: this.config.aggregatorMaxTokens,
      temperature: this.config.aggregatorTemperature,
      systemPrompt,
      userPrompt,
    });

    // Extract reasoning and diff
    const reasoningMatch = response.match(/<reasoning>([\s\S]*?)<\/reasoning>/);
    const diffMatch = response.match(/<diff>([\s\S]*?)<\/diff>/);

    const reasoning = reasoningMatch?.[1]?.trim() || "No reasoning provided";
    const diff = diffMatch?.[1]?.trim() || this.extractDiff(response);

    return { diff, reasoning };
  }

  /**
   * Extract diff from response text
   */
  private extractDiff(text: string): string {
    // Try to extract from diff code block
    const diffBlock = text.match(/```diff\n([\s\S]*?)```/);
    if (diffBlock) {
      return diffBlock[1].trim();
    }

    // Try to extract from generic code block
    const codeBlock = text.match(/```\n?([\s\S]*?)```/);
    if (codeBlock) {
      return codeBlock[1].trim();
    }

    // Look for diff markers
    if (text.includes("diff --git") || text.includes("---") && text.includes("+++")) {
      return text.trim();
    }

    return text.trim();
  }

  /**
   * Rough cost estimation
   */
  private estimateCost(totalTokens: number): number {
    // Very rough: $0.01 per 1000 tokens average
    return (totalTokens / 1000) * 0.01;
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a MoA instance with default config
 */
export function createMoA(config?: Partial<MoAConfig>): MixtureOfAgents {
  return new MixtureOfAgents(config);
}

/**
 * Create a lite MoA instance for simple tasks
 */
export function createMoALite(): MixtureOfAgents {
  return new MixtureOfAgents(MOA_LITE_CONFIG);
}

/**
 * Create a heavy MoA instance for complex tasks
 */
export function createMoAHeavy(): MixtureOfAgents {
  return new MixtureOfAgents(MOA_HEAVY_CONFIG);
}

/**
 * Choose MoA config based on task complexity
 */
export function getMoAConfigForComplexity(
  complexity: "XS" | "S" | "M" | "L" | "XL",
): MoAConfig {
  switch (complexity) {
    case "XS":
    case "S":
      return MOA_LITE_CONFIG;
    case "M":
      return DEFAULT_MOA_CONFIG;
    case "L":
    case "XL":
      return MOA_HEAVY_CONFIG;
    default:
      return DEFAULT_MOA_CONFIG;
  }
}
