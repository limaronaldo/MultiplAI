import OpenAI from "openai";

type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

interface CompletionParams {
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  userPrompt: string;
  // For o1/o3 models. Accept broader values (shared with GPT-5.2),
  // then normalize to OpenAI-supported reasoning_effort values.
  reasoningEffort?: ReasoningEffort;
}

// Models that use reasoning (o1, o3 series)
const REASONING_MODELS = ["o1", "o1-mini", "o1-preview", "o3", "o3-mini"];

function isReasoningModel(model: string): boolean {
  return REASONING_MODELS.some((m) => model.startsWith(m));
}

function normalizeReasoningEffort(
  effort?: ReasoningEffort,
): "low" | "medium" | "high" {
  if (!effort || effort === "none") return "medium";
  if (effort === "xhigh") return "high";
  return effort;
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
          reasoning_effort: normalizeReasoningEffort(params.reasoningEffort),
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
