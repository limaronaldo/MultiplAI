import Anthropic from "@anthropic-ai/sdk";

interface CompletionParams {
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  userPrompt: string;
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
        (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

      console.log(
        `[LLM] ${params.model} | ${tokensUsed} tokens | ${duration}ms`
      );

      // Extrai texto da resposta
      const textBlock = response.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text content in response");
      }

      return textBlock.text;
    } catch (error) {
      console.error("[LLM] Error:", error);
      throw error;
    }
  }
}
