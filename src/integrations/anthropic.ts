import Anthropic from "@anthropic-ai/sdk";
import type { AgentTool } from "../core/tool-generator";

interface CompletionParams {
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  userPrompt: string;
}

interface ToolCompletionParams {
  model: string;
  maxTokens: number;
  systemPrompt: string;
  userPrompt: string;
  tool: AgentTool;
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

  /**
   * Complete with a tool call for structured output
   * Returns the parsed JSON from the tool call input
   */
  async completeWithTool<T = unknown>(
    params: ToolCompletionParams,
  ): Promise<T> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.client.messages.create({
          model: params.model,
          max_tokens: params.maxTokens,
          system: params.systemPrompt,
          messages: [
            {
              role: "user",
              content: params.userPrompt,
            },
          ],
          tools: [
            {
              name: params.tool.name,
              description: params.tool.description,
              input_schema: params.tool
                .input_schema as Anthropic.Tool.InputSchema,
            },
          ],
          tool_choice: { type: "tool", name: params.tool.name },
        });

        const duration = Date.now() - startTime;
        const tokensUsed =
          (response.usage?.input_tokens || 0) +
          (response.usage?.output_tokens || 0);

        console.log(
          `[LLM] ${params.model} (tool:${params.tool.name}) | ${tokensUsed} tokens | ${duration}ms`,
        );

        // Extract tool use from response
        const toolUse = response.content.find(
          (block) => block.type === "tool_use",
        );

        if (!toolUse || toolUse.type !== "tool_use") {
          throw new Error("No tool use in response");
        }

        return toolUse.input as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (isRetryableError(error) && attempt < MAX_RETRIES) {
          const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          console.warn(
            `[LLM] ${params.model} (tool) attempt ${attempt}/${MAX_RETRIES} failed: ${lastError.message}. Retrying in ${delay}ms...`,
          );
          await sleep(delay);
        } else {
          console.error("[LLM] Error:", error);
          throw error;
        }
      }
    }

    throw lastError || new Error("Unknown error after tool retries");
  }
}
