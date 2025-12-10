import OpenAI from "openai";

interface CompletionParams {
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  userPrompt: string;
}

export class OpenRouterClient {
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY environment variable is required");
    }

    // OpenRouter uses OpenAI SDK with custom base URL
    this.client = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": process.env.OPENROUTER_REFERER || "https://multiplai.fly.dev",
        "X-Title": "MultiplAI",
      },
    });
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
        `[LLM] OpenRouter/${params.model} | ${tokensUsed} tokens | ${duration}ms`
      );

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No content in response");
      }

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
  "anthropic/claude-3.5-sonnet": "Claude 3.5 Sonnet",
  "anthropic/claude-3-opus": "Claude 3 Opus",
  "anthropic/claude-3-haiku": "Claude 3 Haiku",

  // OpenAI via OpenRouter
  "openai/gpt-4o": "GPT-4o",
  "openai/gpt-4-turbo": "GPT-4 Turbo",
  "openai/o1-preview": "O1 Preview",
  "openai/o1-mini": "O1 Mini",

  // Google via OpenRouter
  "google/gemini-2.0-flash-exp": "Gemini 2.0 Flash",
  "google/gemini-exp-1206": "Gemini Exp 1206",
  "google/gemini-pro-1.5": "Gemini Pro 1.5",

  // Meta via OpenRouter
  "meta-llama/llama-3.3-70b-instruct": "Llama 3.3 70B",
  "meta-llama/llama-3.1-405b-instruct": "Llama 3.1 405B",

  // DeepSeek via OpenRouter
  "deepseek/deepseek-chat": "DeepSeek Chat",
  "deepseek/deepseek-r1": "DeepSeek R1 (Reasoning)",

  // Mistral via OpenRouter
  "mistralai/mistral-large-2411": "Mistral Large",
  "mistralai/codestral-2501": "Codestral (Code)",

  // Qwen via OpenRouter
  "qwen/qwen-2.5-coder-32b-instruct": "Qwen 2.5 Coder 32B",
  "qwen/qwq-32b-preview": "QwQ 32B (Reasoning)",
};
