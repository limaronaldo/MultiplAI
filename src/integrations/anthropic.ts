import Anthropic from "@anthropic-ai/sdk";

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
  "No text content in response",
  "overloaded",
  "rate_limit",
  "timeout",
  "ECONNRESET",
  "ETIMEDOUT",
  "socket hang up",
  "529", // Overloaded
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

export class AnthropicClient {
  private client: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }
    this.client = new Anthropic({ apiKey });
  }

  async complete(params: CompletionParams): Promise<string> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.client.messages.create({
          model: params.model,
          max_tokens: params.maxTokens,
          temperature: params.temperature,
          system: params.systemPrompt,
          messages: [
            {
              role: "user",
              content: params.userPrompt,
            },
          ],
        });

        const duration = Date.now() - startTime;
        const tokensUsed =
          (response.usage?.input_tokens || 0) +
          (response.usage?.output_tokens || 0);

        console.log(
          `[LLM] ${params.model} | ${tokensUsed} tokens | ${duration}ms`,
        );

        // Extract text from response
        const textBlock = response.content.find(
          (block) => block.type === "text",
        );
        if (!textBlock || textBlock.type !== "text") {
          throw new Error("No text content in response");
        }

        return textBlock.text;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (isRetryableError(error) && attempt < MAX_RETRIES) {
          const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          console.warn(
            `[LLM] ${params.model} attempt ${attempt}/${MAX_RETRIES} failed: ${lastError.message}. Retrying in ${delay}ms...`,
          );
          await sleep(delay);
        } else {
          console.error("[LLM] Error:", error);
          throw error;
        }
      }
    }

    // Should never reach here, but TypeScript needs it
    throw lastError || new Error("Unknown error after retries");
  }
}
