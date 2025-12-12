import OpenAI from "openai";

interface CompletionParams {
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  userPrompt: string;
}

// Models that use the responses API (Codex models)
const RESPONSES_API_MODELS = [
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

  async complete(params: CompletionParams): Promise<string> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        let content: string;
        let tokensUsed: number;

        if (this.isResponsesModel(params.model)) {
          // Use responses API for Codex models
          const result = await this.completeWithResponses(params);
          content = result.content;
          tokensUsed = result.tokens;
        } else {
          // Use chat completions API for other models
          const result = await this.completeWithChat(params);
          content = result.content;
          tokensUsed = result.tokens;
        }

        const duration = Date.now() - startTime;
        console.log(
          `[LLM] OpenAI/${params.model} | ${tokensUsed} tokens | ${duration}ms`,
        );

        return content;
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
  ): Promise<{ content: string; tokens: number }> {
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

  private async completeWithResponses(
    params: CompletionParams,
  ): Promise<{ content: string; tokens: number }> {
    // Responses API uses a different format
    // Note: Codex models don't support temperature
    const response = await this.client.responses.create({
      model: params.model,
      instructions: params.systemPrompt,
      input: params.userPrompt,
      max_output_tokens: params.maxTokens,
    });

    // Extract text from response output
    let content = "";
    if (response.output && Array.isArray(response.output)) {
      for (const item of response.output) {
        if (item.type === "message" && item.content) {
          for (const block of item.content) {
            if (block.type === "output_text") {
              content += block.text;
            }
          }
        }
      }
    }

    if (!content) {
      throw new Error("No content in responses API response");
    }

    const tokensUsed =
      (response.usage?.input_tokens || 0) +
      (response.usage?.output_tokens || 0);

    return { content, tokens: tokensUsed };
  }
}

// OpenAI Direct models
export const OPENAI_DIRECT_MODELS = {
  // GPT-5.2 (Latest - 400K context, 128K output)
  "gpt-5.2": "GPT-5.2 (400K context)",
  "gpt-5.2-thinking": "GPT-5.2 Thinking (Reasoning)",
  "gpt-5.2-instant": "GPT-5.2 Instant (Fast)",
  "gpt-5.2-2025-12-11": "GPT-5.2 (Pinned snapshot)",

  // GPT-5.1 Chat
  "gpt-5.1-2025-11-13": "GPT-5.1 (Latest)",
  "gpt-5.1": "GPT-5.1",

  // GPT-5.1 Codex (Responses API)
  "gpt-5.1-codex": "GPT-5.1 Codex",
  "gpt-5.1-codex-max": "GPT-5.1 Codex Max",
  "gpt-5.1-codex-mini": "GPT-5.1 Codex Mini",

  // O4 Reasoning
  "o4-mini": "O4 Mini (Reasoning)",
  o4: "O4 (Reasoning)",

  // O3 Reasoning
  "o3-mini": "O3 Mini (Reasoning)",
  o3: "O3 (Reasoning)",
};
