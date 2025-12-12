import OpenAI from "openai";

interface CompletionParams {
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  userPrompt: string;
  // GPT-5.2 Responses API: pass previous_response_id to reuse reasoning context
  previousResponseId?: string;
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
  "gpt-5.2",
  "gpt-5.2-thinking",
  "gpt-5.2-instant",
  "gpt-5.2-2025-12-11",
  "gpt-5.2-pro",
  "gpt-5.1-codex",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex-mini",
];

// Models that require max_completion_tokens instead of max_tokens
const REASONING_MODELS = [
  "gpt-5.2",
  "gpt-5.2-thinking",
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
    return RESPONSES_API_MODELS.some((m) => model.includes(m));
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

        if (this.isResponsesModel(params.model)) {
          // Use responses API for GPT-5.2 and Codex models
          result = await this.completeWithResponses(params);
        } else {
          // Use chat completions API for other models
          result = await this.completeWithChat(params);
        }

        const duration = Date.now() - startTime;
        let logMsg = `[LLM] OpenAI/${params.model} | ${result.tokens} tokens | ${duration}ms`;
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

  private async completeWithResponses(
    params: CompletionParams,
  ): Promise<CompletionResult> {
    // Responses API uses a different format
    // GPT-5.2 supports reasoning effort and verbosity controls
    const isGPT52 = this.isGPT52Model(params.model);

    const requestParams: any = {
      model: params.model,
      input: params.systemPrompt + "\n\n---\n\n" + params.userPrompt,
      max_output_tokens: params.maxTokens,
    };

    // GPT-5.2 specific parameters (from GPT-5 prompting guide best practices)
    if (isGPT52) {
      // Use high reasoning effort for coding tasks (user approved)
      requestParams.reasoning = { effort: "high" };
      // High verbosity for detailed code output
      requestParams.text = { verbosity: "high" };
    }

    // Pass previous_response_id to reuse reasoning context between turns
    // This improves intelligence, reduces tokens, and lowers latency
    if (params.previousResponseId) {
      requestParams.previous_response_id = params.previousResponseId;
    }

    const response = await this.client.responses.create(requestParams);

    // Extract text from response - GPT-5.2 provides output_text directly
    const content = (response as any).output_text;

    if (!content) {
      // Fallback: try extracting from output array (older format)
      let extractedContent = "";
      if (response.output && Array.isArray(response.output)) {
        for (const item of response.output) {
          if (item.type === "message" && item.content) {
            for (const block of item.content) {
              if (block.type === "output_text") {
                extractedContent += block.text;
              }
            }
          }
        }
      }
      if (!extractedContent) {
        throw new Error("No content in responses API response");
      }
      return {
        content: extractedContent,
        tokens:
          (response.usage?.input_tokens || 0) +
          (response.usage?.output_tokens || 0),
        responseId: response.id,
      };
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
 * GPT-5.1-Codex-Max is for specialized coding workflows.
 *
 * All GPT-5.2 models use the Responses API with:
 * - reasoning.effort: "high" (for thorough reasoning)
 * - text.verbosity: "high" (for detailed code output)
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const OPENAI_DIRECT_MODELS = {
  // GPT-5.2 (Latest - 400K context, 128K output) - USE THESE
  "gpt-5.2": "GPT-5.2 - Best for coding and agentic tasks",
  "gpt-5.2-pro": "GPT-5.2 Pro - Harder thinking, tougher problems",
  "gpt-5.2-2025-12-11": "GPT-5.2 (Pinned snapshot)",

  // GPT-5.1 Codex (Responses API) - USE THESE FOR SPECIALIZED CODING
  "gpt-5.1-codex-max": "GPT-5.1 Codex Max - Interactive coding products",
};
