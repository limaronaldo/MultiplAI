/**
 * OpenAI Flex Processing Client
 *
 * Provides 50% cost savings on non-urgent tasks by using OpenAI's Flex tier.
 * Flex processing has slower response times and may return 429 Resource Unavailable.
 *
 * Use cases:
 * - Eval runs
 * - Knowledge Graph sync
 * - Distillation data collection
 * - Re-processing failed tasks
 * - Pre-computing embeddings
 *
 * Issue #243
 */

import OpenAI from "openai";

export interface FlexCompletionParams {
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  userPrompt: string;
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh";
}

export interface FlexConfig {
  enabled: boolean;
  maxRetries: number;
  retryDelayMs: number;
  fallbackToStandard: boolean;
  timeoutMs: number;
}

export interface FlexMetrics {
  flexRequests: number;
  flexTokens: number;
  standardFallbacks: number;
  resourceUnavailableErrors: number;
  estimatedSavings: number; // USD saved vs standard
}

// Default configuration
const DEFAULT_FLEX_CONFIG: FlexConfig = {
  enabled: process.env.ENABLE_FLEX_PROCESSING !== "false",
  maxRetries: parseInt(process.env.FLEX_MAX_RETRIES || "3", 10),
  retryDelayMs: parseInt(process.env.FLEX_RETRY_DELAY_MS || "60000", 10),
  fallbackToStandard: process.env.FLEX_FALLBACK_TO_STANDARD !== "false",
  timeoutMs: parseInt(process.env.FLEX_TIMEOUT_MS || "900000", 10), // 15 min
};

// Track flex usage metrics
const metrics: FlexMetrics = {
  flexRequests: 0,
  flexTokens: 0,
  standardFallbacks: 0,
  resourceUnavailableErrors: 0,
  estimatedSavings: 0,
};

// Estimated cost per 1M tokens (input + output average)
const STANDARD_COST_PER_1M = 10; // $10 per 1M tokens (rough average)
const FLEX_COST_PER_1M = 5; // 50% discount

export class OpenAIFlexClient {
  private client: OpenAI;
  private config: FlexConfig;

  constructor(config: Partial<FlexConfig> = {}) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }

    this.config = { ...DEFAULT_FLEX_CONFIG, ...config };

    this.client = new OpenAI({
      apiKey,
      timeout: this.config.timeoutMs,
    });
  }

  /**
   * Complete a request using Flex processing tier.
   * Returns the completion text.
   */
  async complete(params: FlexCompletionParams): Promise<string> {
    if (!this.config.enabled) {
      throw new Error("Flex processing is disabled");
    }

    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await this.completeWithFlex(params);
        const duration = Date.now() - startTime;

        // Update metrics
        metrics.flexRequests++;
        metrics.flexTokens += result.tokens;
        metrics.estimatedSavings +=
          (result.tokens / 1_000_000) *
          (STANDARD_COST_PER_1M - FLEX_COST_PER_1M);

        console.log(
          `[Flex] ${params.model} | ${result.tokens} tokens | ${duration}ms | saved ~$${((result.tokens / 1_000_000) * 5).toFixed(4)}`,
        );

        return result.content;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check for resource unavailable (429)
        if (this.isResourceUnavailable(error)) {
          metrics.resourceUnavailableErrors++;

          if (attempt < this.config.maxRetries) {
            const delay = this.config.retryDelayMs * attempt;
            console.warn(
              `[Flex] Resource unavailable (attempt ${attempt}/${this.config.maxRetries}). Retrying in ${delay / 1000}s...`,
            );
            await this.sleep(delay);
            continue;
          }

          // Max retries exhausted - fall back to standard if enabled
          if (this.config.fallbackToStandard) {
            console.warn(
              `[Flex] Max retries exhausted. Falling back to standard processing.`,
            );
            metrics.standardFallbacks++;
            return this.completeWithStandard(params);
          }
        }

        // Other errors - don't retry
        throw lastError;
      }
    }

    throw lastError || new Error("Unknown error after flex retries");
  }

  /**
   * Complete using Flex tier (Responses API with service_tier: "flex")
   */
  private async completeWithFlex(
    params: FlexCompletionParams,
  ): Promise<{ content: string; tokens: number }> {
    const requestParams: any = {
      model: params.model,
      input: params.systemPrompt + "\n\n---\n\n" + params.userPrompt,
      max_output_tokens: params.maxTokens,
      service_tier: "flex", // Key parameter for 50% discount
    };

    // Add reasoning effort for supported models
    if (params.reasoningEffort && params.model.includes("gpt-5")) {
      requestParams.reasoning = { effort: params.reasoningEffort };
    }

    const response = await this.client.responses.create(requestParams);

    const content = (response as any).output_text;
    if (!content) {
      throw new Error("No content in flex response");
    }

    const tokens =
      (response.usage?.input_tokens || 0) +
      (response.usage?.output_tokens || 0);

    return { content, tokens };
  }

  /**
   * Fallback to standard processing (no flex tier)
   */
  private async completeWithStandard(
    params: FlexCompletionParams,
  ): Promise<string> {
    const requestParams: any = {
      model: params.model,
      input: params.systemPrompt + "\n\n---\n\n" + params.userPrompt,
      max_output_tokens: params.maxTokens,
      // No service_tier - uses default (standard)
    };

    if (params.reasoningEffort && params.model.includes("gpt-5")) {
      requestParams.reasoning = { effort: params.reasoningEffort };
    }

    const response = await this.client.responses.create(requestParams);

    const content = (response as any).output_text;
    if (!content) {
      throw new Error("No content in standard response");
    }

    return content;
  }

  /**
   * Check if error is a 429 Resource Unavailable
   */
  private isResourceUnavailable(error: unknown): boolean {
    if (error instanceof OpenAI.APIError) {
      return (
        error.status === 429 &&
        (error.code === "resource_unavailable" ||
          error.message.toLowerCase().includes("resource unavailable"))
      );
    }
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current flex usage metrics
   */
  static getMetrics(): FlexMetrics {
    return { ...metrics };
  }

  /**
   * Reset metrics (for testing)
   */
  static resetMetrics(): void {
    metrics.flexRequests = 0;
    metrics.flexTokens = 0;
    metrics.standardFallbacks = 0;
    metrics.resourceUnavailableErrors = 0;
    metrics.estimatedSavings = 0;
  }
}

// Lazy-loaded singleton
let flexClient: OpenAIFlexClient | null = null;

export function getFlexClient(): OpenAIFlexClient {
  if (!flexClient) {
    flexClient = new OpenAIFlexClient();
  }
  return flexClient;
}

/**
 * Check if flex processing is enabled
 */
export function isFlexEnabled(): boolean {
  return DEFAULT_FLEX_CONFIG.enabled;
}

/**
 * Operations eligible for flex processing
 */
export const FLEX_ELIGIBLE_OPERATIONS = [
  "evals",
  "kg_sync",
  "distillation",
  "embeddings",
  "reprocessing",
] as const;

export type FlexEligibleOperation = (typeof FLEX_ELIGIBLE_OPERATIONS)[number];

/**
 * Check if an operation is eligible for flex processing
 */
export function isFlexEligible(operation: string): boolean {
  const eligibleOps: readonly string[] =
    process.env.FLEX_ELIGIBLE_OPERATIONS?.split(",") ||
    FLEX_ELIGIBLE_OPERATIONS;
  return eligibleOps.includes(operation);
}
