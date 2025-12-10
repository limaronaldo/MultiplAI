import OpenAI from "openai";

interface CompletionParams {
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  userPrompt: string;
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
      const response = await this.client.chat.completions.create({
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

      const duration = Date.now() - startTime;
      const tokensUsed =
        (response.usage?.prompt_tokens || 0) +
        (response.usage?.completion_tokens || 0);

      console.log(
        `[LLM] ${params.model} | ${tokensUsed} tokens | ${duration}ms`
      );

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
