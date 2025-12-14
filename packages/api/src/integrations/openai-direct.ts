import OpenAI from "openai";
import type { AgentTool } from "../core/tool-generator";

interface CompletionParams {
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  userPrompt: string;
  // GPT-5.2 Responses API: pass previous_response_id to reuse reasoning context
  previousResponseId?: string;
  // GPT-5.2 reasoning effort: "none" | "low" | "medium" | "high" | "xhigh"
  // Default is "high", use "xhigh" for Fixer agent
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh";
}

interface ToolCompletionParams {
  model: string;
  maxTokens: number;
  systemPrompt: string;
  userPrompt: string;
  tool: AgentTool;
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh";
}

interface CompletionResult {
  content: string;
  tokens: number;
  // Return response ID for context reuse in subsequent calls
  responseId?: string;
}

// Models that use the responses API (GPT-5.2 and Codex models)
// GPT-5.2 works best with Responses API for CoT passing
const RESPONSES_API_MODELS = [
  // GPT-5.2 base models
  "gpt-5.2",
  "gpt-5.2-instant",
  "gpt-5.2-2025-12-11",
  "gpt-5.2-pro",
  // GPT-5.1 Codex base models
  "gpt-5.1-codex",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex-mini",
];

/**
 * Parse a model ID that may include a reasoning effort suffix.
 *
 * Examples:
 * - "gpt-5.2-high" -> { baseModel: "gpt-5.2", reasoningEffort: "high" }
 * - "gpt-5.1-codex-max-xhigh" -> { baseModel: "gpt-5.1-codex-max", reasoningEffort: "xhigh" }
 * - "gpt-5.1-codex-mini-medium" -> { baseModel: "gpt-5.1-codex-mini", reasoningEffort: "medium" }
 * - "gpt-5.2" -> { baseModel: "gpt-5.2", reasoningEffort: undefined }
 */
function parseModelId(modelId: string): {
  baseModel: string;
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh";
} {
  const effortLevels = ["none", "low", "medium", "high", "xhigh"] as const;

  // Check if model ID ends with a reasoning effort suffix
  for (const effort of effortLevels) {
    if (modelId.endsWith(`-${effort}`)) {
      const baseModel = modelId.slice(0, -(effort.length + 1)); // Remove "-effort" suffix
      return { baseModel, reasoningEffort: effort };
    }
  }

  // No suffix found, return as-is
  return { baseModel: modelId };
}

// Models that require max_completion_tokens instead of max_tokens
const REASONING_MODELS = [
  "gpt-5.2",
  "gpt-5.2-instant",
  "gpt-5.2-2025-12-11",
  "gpt-5.1-2025-11-13",
  "gpt-5.1",
  "o4-mini",
  "o4",
  "o3",
  "o3-mini",
  "o1",
  "o1-mini",
  "o1-preview",
];

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

// Errors that should trigger a retry
const RETRYABLE_ERRORS = [
  "No content in responses API response",
  "No content in chat response",
  "rate_limit",
  "timeout",
  "ECONNRESET",
  "ETIMEDOUT",
  "socket hang up",
];

function isRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return RETRYABLE_ERRORS.some((e) =>
    message.toLowerCase().includes(e.toLowerCase()),
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OpenAIDirectClient {
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }

    this.client = new OpenAI({ apiKey });
  }

  private isResponsesModel(model: string): boolean {
    // Parse the model ID to get the base model (without reasoning effort suffix)
    const { baseModel } = parseModelId(model);
    return RESPONSES_API_MODELS.some(
      (m) => baseModel === m || baseModel.includes(m),
    );
  }

  private isReasoningModel(model: string): boolean {
    return REASONING_MODELS.some((m) => model.includes(m));
  }

  /**
   * Complete a prompt and return the content.
   * For backward compatibility, returns just the string content.
   */
  async complete(params: CompletionParams): Promise<string> {
    const result = await this.completeWithResult(params);
    return result.content;
  }

  /**
   * Complete a prompt and return full result including response ID.
   * Use this when you need to chain requests with previous_response_id.
   *
   * GPT-5.2 Best Practice: Pass previousResponseId to reuse reasoning context
   * between turns. This improves intelligence, reduces tokens, and lowers latency.
   */
  async completeWithResult(
    params: CompletionParams,
  ): Promise<CompletionResult> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        let result: CompletionResult;

        // Parse model ID to extract base model and reasoning effort
        const { baseModel, reasoningEffort: parsedEffort } = parseModelId(
          params.model,
        );
        const effectiveEffort = parsedEffort || params.reasoningEffort;

        if (this.isResponsesModel(params.model)) {
          // Use responses API for GPT-5.2 and Codex models
          result = await this.completeWithResponses(params);
        } else {
          // Use chat completions API for other models
          result = await this.completeWithChat(params);
        }

        const duration = Date.now() - startTime;
        let logMsg = `[LLM] OpenAI/${baseModel}`;
        if (effectiveEffort) {
          logMsg += ` (effort: ${effectiveEffort})`;
        }
        logMsg += ` | ${result.tokens} tokens | ${duration}ms`;
        if (result.responseId) {
          logMsg += ` | response_id: ${result.responseId.slice(0, 20)}...`;
        }
        console.log(logMsg);

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (isRetryableError(error) && attempt < MAX_RETRIES) {
          const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          console.warn(
            `[LLM] OpenAI/${params.model} attempt ${attempt}/${MAX_RETRIES} failed: ${lastError.message}. Retrying in ${delay}ms...`,
          );
          await sleep(delay);
        } else {
          console.error("[LLM] OpenAI Error:", error);
          throw error;
        }
      }
    }

    // Should never reach here, but TypeScript needs it
    throw lastError || new Error("Unknown error after retries");
  }

  private async completeWithChat(
    params: CompletionParams,
  ): Promise<CompletionResult> {
    const isReasoning = this.isReasoningModel(params.model);

    const requestParams: any = {
      model: params.model,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userPrompt },
      ],
    };

    // Reasoning models use max_completion_tokens, others use max_tokens
    if (isReasoning) {
      requestParams.max_completion_tokens = params.maxTokens;
      // Reasoning models don't support temperature
    } else {
      requestParams.max_tokens = params.maxTokens;
      requestParams.temperature = params.temperature;
    }

    const response = await this.client.chat.completions.create(requestParams);

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content in chat response");
    }

    const tokensUsed =
      (response.usage?.prompt_tokens || 0) +
      (response.usage?.completion_tokens || 0);

    return { content, tokens: tokensUsed };
  }

  private isGPT52Model(model: string): boolean {
    return model.startsWith("gpt-5.2");
  }

  private isCodexModel(model: string): boolean {
    return model.includes("codex");
  }

  private async completeWithResponses(
    params: CompletionParams,
  ): Promise<CompletionResult> {
    // Parse model ID to extract base model and reasoning effort from suffix
    // e.g., "gpt-5.1-codex-max-high" -> baseModel: "gpt-5.1-codex-max", effort: "high"
    const { baseModel, reasoningEffort: parsedEffort } = parseModelId(
      params.model,
    );

    // Use parsed effort from model ID, or fall back to params.reasoningEffort
    const effectiveEffort = parsedEffort || params.reasoningEffort;

    // Responses API uses a different format
    // GPT-5.2 and Codex models support reasoning effort and verbosity controls
    const isGPT52 = this.isGPT52Model(baseModel);
    const isCodex = this.isCodexModel(baseModel);

    const requestParams: any = {
      model: baseModel, // Use base model without suffix
      input: params.systemPrompt + "\n\n---\n\n" + params.userPrompt,
      max_output_tokens: params.maxTokens,
    };

    // GPT-5.2 specific parameters (from GPT-5 prompting guide best practices)
    if (isGPT52) {
      // Reasoning effort: default "high", use "xhigh" for Fixer agent
      const effort = effectiveEffort || "high";
      requestParams.reasoning = { effort };
      // High verbosity for detailed code output
      requestParams.text = { verbosity: "high" };
    }

    // Codex models (GPT-5.1-Codex-Max/Mini) - optimized for long autonomous coding
    // Per Codex-Max guide: "medium" for interactive, "high/xhigh" for hard tasks
    // Codex-Mini only supports: medium, high
    // Codex-Max supports: low, medium, high, xhigh
    if (isCodex) {
      const effort = effectiveEffort || "high";
      requestParams.reasoning = { effort };
    }

    // Pass previous_response_id to reuse reasoning context between turns
    // This improves intelligence, reduces tokens, and lowers latency
    if (params.previousResponseId) {
      requestParams.previous_response_id = params.previousResponseId;
    }

    const response = await this.client.responses.create(requestParams);

    // Extract text from response - GPT-5.2 provides output_text directly
    let content = (response as any).output_text;

    // Debug: Log response structure for codex models
    if (isCodex) {
      console.log(
        `[OpenAI] Codex response keys: ${Object.keys(response).join(", ")}`,
      );
      console.log(`[OpenAI] Codex output_text exists: ${!!content}`);
      if (!content) {
        console.log(
          `[OpenAI] Codex full response: ${JSON.stringify(response).slice(0, 1000)}`,
        );
      }
    }

    if (!content) {
      // Fallback 1: try extracting from output array (older format)
      let extractedContent = "";
      if (response.output && Array.isArray(response.output)) {
        for (const item of response.output as any[]) {
          if (item.type === "message" && item.content) {
            for (const block of item.content as any[]) {
              if (block.type === "output_text" || block.type === "text") {
                extractedContent += block.text;
              }
            }
          }
          // Also check for direct text content
          if (item.type === "text" && item.text) {
            extractedContent += item.text;
          }
        }
      }

      // Fallback 2: check for text field directly on response
      // NOTE: response.text is config metadata like {"format":{"type":"text"},"verbosity":"high"}
      // Only use it if it's a string (actual text content), not an object (config)
      if (!extractedContent && (response as any).text) {
        const textField = (response as any).text;
        if (typeof textField === "string") {
          extractedContent = textField;
        }
        // Skip if it's an object (config metadata, not content)
      }

      // Fallback 3: check for content field
      if (!extractedContent && (response as any).content) {
        const c = (response as any).content;
        if (typeof c === "string") {
          extractedContent = c;
        } else if (Array.isArray(c)) {
          for (const block of c) {
            if (block.type === "text" && block.text) {
              extractedContent += block.text;
            }
          }
        }
      }

      if (!extractedContent) {
        // Log the response structure for debugging
        console.error(
          "[OpenAI] Empty response. Keys:",
          Object.keys(response),
          "Status:",
          (response as any).status,
        );
        throw new Error("No content in responses API response");
      }
      content = extractedContent;
    }

    const tokensUsed =
      (response.usage?.input_tokens || 0) +
      (response.usage?.output_tokens || 0);

    return {
      content,
      tokens: tokensUsed,
      responseId: response.id, // Return for context reuse in subsequent calls
    };
  }

  /**
   * Complete with a tool call for structured output
   * Uses chat completions API with function calling
   */
  async completeWithTool<T = unknown>(
    params: ToolCompletionParams,
  ): Promise<T> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const isReasoning = this.isReasoningModel(params.model);

        const requestParams: any = {
          model: params.model,
          messages: [
            { role: "system", content: params.systemPrompt },
            { role: "user", content: params.userPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: params.tool.name,
                description: params.tool.description,
                parameters: params.tool.input_schema,
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: params.tool.name },
          },
        };

        // Reasoning models use max_completion_tokens
        if (isReasoning) {
          requestParams.max_completion_tokens = params.maxTokens;
          if (params.reasoningEffort) {
            requestParams.reasoning_effort = params.reasoningEffort;
          }
        } else {
          requestParams.max_tokens = params.maxTokens;
        }

        const response =
          await this.client.chat.completions.create(requestParams);

        const duration = Date.now() - startTime;
        const tokensUsed =
          (response.usage?.prompt_tokens || 0) +
          (response.usage?.completion_tokens || 0);

        console.log(
          `[LLM] OpenAI/${params.model} (tool:${params.tool.name}) | ${tokensUsed} tokens | ${duration}ms`,
        );

        const toolCall = response.choices[0]?.message?.tool_calls?.[0] as any;
        if (!toolCall || !toolCall.function) {
          throw new Error("No tool call in response");
        }

        return JSON.parse(toolCall.function.arguments) as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (isRetryableError(error) && attempt < MAX_RETRIES) {
          const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          console.warn(
            `[LLM] OpenAI/${params.model} (tool) attempt ${attempt}/${MAX_RETRIES} failed: ${lastError.message}. Retrying in ${delay}ms...`,
          );
          await sleep(delay);
        } else {
          console.error("[LLM] OpenAI Tool Error:", error);
          throw error;
        }
      }
    }

    throw lastError || new Error("Unknown error after tool retries");
  }
}

/**
 * OpenAI Direct models - APPROVED LIST
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️  ONLY USE GPT-5.2 OR GPT-5.1-CODEX MODELS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Do NOT use legacy models (gpt-4o, gpt-4, o1, o3, etc.)
 * GPT-5.2 is the flagship model for coding and agentic tasks.
 * GPT-5.1-Codex-Max is for long-running autonomous coding tasks.
 *
 * GPT-5.2 models use the Responses API with:
 * - reasoning.effort: "high" (default), "xhigh" for Fixer
 * - text.verbosity: "high" (for detailed code output)
 *
 * GPT-5.1-Codex-Max uses the Responses API with:
 * - reasoning.effort: "medium" (interactive), "high/xhigh" (hard tasks)
 * - First-class compaction support for multi-hour reasoning
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const OPENAI_DIRECT_MODELS = {
  // GPT-5.2 (Latest - 400K context, 128K output) - USE THESE
  "gpt-5.2": "GPT-5.2 - Best for coding and agentic tasks",
  "gpt-5.2-pro": "GPT-5.2 Pro - Harder thinking, tougher problems",
  "gpt-5.2-2025-12-11": "GPT-5.2 (Pinned snapshot)",

  // GPT-5.1 Codex (Responses API) - USE FOR LONG AUTONOMOUS CODING
  "gpt-5.1-codex-max":
    "GPT-5.1 Codex Max - Long-running autonomous coding, ~30% fewer tokens than GPT-5.1-Codex",
};
