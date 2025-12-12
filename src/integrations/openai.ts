import OpenAI from "openai";

interface CompletionParams {
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  userPrompt: string;
  reasoningEffort?: "low" | "medium" | "high"; // For o1/o3 models
}

// Models that use reasoning (o1, o3 series)
const REASONING_MODELS = ["o1", "o1-mini", "o1-preview", "o3", "o3-mini"];

function isReasoningModel(model: string): boolean {
  return REASONING_MODELS.some((m) => model.startsWith(m));
}

export class OpenAIClient {
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }
    this.client = new OpenAI({ apiKey });
  }

  async complete(params: CompletionParams): Promise<string> {
    const startTime = Date.now();

    try {
      let response;

      if (isReasoningModel(params.model)) {
        // o1/o3 models: no system role, use max_completion_tokens, reasoning_effort
        response = await this.client.chat.completions.create({
          model: params.model,
          max_completion_tokens: params.maxTokens,
          reasoning_effort: params.reasoningEffort || "medium",
          messages: [
            {
              role: "user",
              content: `${params.systemPrompt}\n\n---\n\n${params.userPrompt}`,
            },
          ],
        } as any); // reasoning_effort not in types yet
      } else {
        // Standard models
        response = await this.client.chat.completions.create({
          model: params.model,
          max_tokens: params.maxTokens,
          temperature: params.temperature,
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
        });
      }

      const duration = Date.now() - startTime;
      const tokensUsed =
        (response.usage?.prompt_tokens || 0) +
        (response.usage?.completion_tokens || 0);
      const reasoningTokens =
        (response.usage as any)?.completion_tokens_details?.reasoning_tokens ||
        0;

      let logMsg = `[LLM] ${params.model} | ${tokensUsed} tokens | ${duration}ms`;
      if (reasoningTokens > 0) {
        logMsg += ` | reasoning: ${reasoningTokens}`;
      }
      console.log(logMsg);

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No content in response");
      }

      return content;
    } catch (error) {
      console.error("[LLM] OpenAI Error:", error);
      throw error;
    }
  }
}
