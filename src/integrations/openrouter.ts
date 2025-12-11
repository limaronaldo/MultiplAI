import { OpenRouter } from "@openrouter/sdk";

interface CompletionParams {
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  userPrompt: string;
}

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

// Errors that should trigger a retry
const RETRYABLE_ERRORS = [
  "No content in response",
  "rate_limit",
  "timeout",
  "ECONNRESET",
  "ETIMEDOUT",
  "socket hang up",
  "502",
  "503",
  "529",
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

export class OpenRouterClient {
  private client: OpenRouter;

  constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY environment variable is required");
    }

    this.client = new OpenRouter({
      apiKey,
    });
  }

  async complete(params: CompletionParams): Promise<string> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Use streaming to get usage info including reasoning tokens
        const stream = await this.client.chat.send({
          model: params.model,
          messages: [
            {
              role: "system",
              content: params.systemPrompt,
            },
            {
              role: "user",
              content: params.userPrompt,
            },
          ],
          maxTokens: params.maxTokens,
          temperature: params.temperature,
          stream: true,
          streamOptions: {
            includeUsage: true,
          },
        });

        let content = "";
        let tokensUsed = 0;
        let reasoningTokens = 0;

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            content += delta;
          }

          // Usage information comes in the final chunk
          if (chunk.usage) {
            tokensUsed =
              (chunk.usage.promptTokens || 0) +
              (chunk.usage.completionTokens || 0);
            reasoningTokens = (chunk.usage as any).reasoningTokens || 0;
          }
        }

        const duration = Date.now() - startTime;

        let logMsg = `[LLM] OpenRouter/${params.model} | ${tokensUsed} tokens | ${duration}ms`;
        if (reasoningTokens > 0) {
          logMsg += ` | reasoning: ${reasoningTokens}`;
        }
        console.log(logMsg);

        if (!content) {
          throw new Error("No content in response");
        }

        return content;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (isRetryableError(error) && attempt < MAX_RETRIES) {
          const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          console.warn(
            `[LLM] OpenRouter/${params.model} attempt ${attempt}/${MAX_RETRIES} failed: ${lastError.message}. Retrying in ${delay}ms...`,
          );
          await sleep(delay);
        } else {
          console.error("[LLM] OpenRouter Error:", error);
          throw error;
        }
      }
    }

    // Should never reach here, but TypeScript needs it
    throw lastError || new Error("Unknown error after retries");
  }

  // Non-streaming version for simpler use cases
  async completeSync(params: CompletionParams): Promise<string> {
    const startTime = Date.now();

    try {
      const response = await this.client.chat.send({
        model: params.model,
        messages: [
          {
            role: "system",
            content: params.systemPrompt,
          },
          {
            role: "user",
            content: params.userPrompt,
          },
        ],
        maxTokens: params.maxTokens,
        temperature: params.temperature,
      });

      const duration = Date.now() - startTime;
      const tokensUsed =
        (response.usage?.promptTokens || 0) +
        (response.usage?.completionTokens || 0);

      console.log(
        `[LLM] OpenRouter/${params.model} | ${tokensUsed} tokens | ${duration}ms`,
      );

      const rawContent = response.choices[0]?.message?.content;
      if (!rawContent) {
        throw new Error("No content in response");
      }

      // Handle both string and array content types
      const content =
        typeof rawContent === "string"
          ? rawContent
          : rawContent.map((item: any) => item.text || "").join("");

      return content;
    } catch (error) {
      console.error("[LLM] OpenRouter Error:", error);
      throw error;
    }
  }
}

// Popular OpenRouter models
export const OPENROUTER_MODELS = {
  // Anthropic via OpenRouter
  "anthropic/claude-sonnet-4.5": "Claude Sonnet 4.5",
  "anthropic/claude-opus-4.5": "Claude Opus 4.5",
  "anthropic/claude-3-haiku": "Claude 3 Haiku",

  // OpenAI via OpenRouter
  "openai/gpt-5.1-codex-max": "GPT-5.1 Codex Max (Code)",
  "openai/gpt-4-turbo": "GPT-4 Turbo",
  "openai/o1-mini": "O1 Mini",

  // xAI Grok via OpenRouter
  "x-ai/grok-4.1-fast": "Grok 4.1 Fast",
  "x-ai/grok-code-fast-1": "Grok Code Fast (Code)",

  // Google via OpenRouter
  "google/gemini-3-pro-preview": "Gemini 3 Pro Preview",
  "google/gemini-2.0-flash-exp": "Gemini 2.0 Flash",
  "google/gemini-exp-1206": "Gemini Exp 1206",
  "google/gemini-pro-1.5": "Gemini Pro 1.5",

  // Meta via OpenRouter
  "meta-llama/llama-3.3-70b-instruct": "Llama 3.3 70B",
  "meta-llama/llama-3.1-405b-instruct": "Llama 3.1 405B",

  // DeepSeek via OpenRouter
  "deepseek/deepseek-chat": "DeepSeek Chat",
  "deepseek/deepseek-r1": "DeepSeek R1 (Reasoning)",
  "deepseek/deepseek-v3.2": "DeepSeek V3.2",

  // Mistral via OpenRouter
  "mistralai/mistral-large-2411": "Mistral Large",
  "mistralai/codestral-2501": "Codestral (Code)",

  // Qwen via OpenRouter
  "qwen/qwen-2.5-coder-32b-instruct": "Qwen 2.5 Coder 32B",
  "qwen/qwq-32b-preview": "QwQ 32B (Reasoning)",
};
