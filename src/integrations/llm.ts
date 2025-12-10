import { AnthropicClient } from "./anthropic";
import { OpenAIClient } from "./openai";
import { OpenRouterClient } from "./openrouter";

export type LLMProvider = "anthropic" | "openai" | "openrouter";

export interface CompletionParams {
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  userPrompt: string;
}

// Model to provider mapping
const MODEL_PROVIDERS: Record<string, LLMProvider> = {
  // Anthropic models
  "claude-opus-4-5-20251101": "anthropic",
  "claude-sonnet-4-5-20250929": "anthropic",
  "claude-haiku-4-5-20251015": "anthropic",
  "claude-3-5-sonnet-20241022": "anthropic",
  "claude-3-5-haiku-20241022": "anthropic",
  // OpenAI GPT-4.1 family (2025)
  "gpt-4.1": "openai",
  "gpt-4.1-mini": "openai",
  "gpt-4.1-nano": "openai",
  // OpenAI GPT-4o family
  "gpt-4o": "openai",
  "gpt-4o-mini": "openai",
  // OpenAI legacy
  "gpt-4-turbo": "openai",
  "gpt-4": "openai",
  "gpt-3.5-turbo": "openai",
  // OpenAI reasoning models (o-series)
  o3: "openai",
  "o3-pro": "openai",
  "o3-mini": "openai",
  "o4-mini": "openai",
  o1: "openai",
  "o1-mini": "openai",
  "o1-preview": "openai",
};

// Lazy-loaded clients
let anthropicClient: AnthropicClient | null = null;
let openaiClient: OpenAIClient | null = null;
let openrouterClient: OpenRouterClient | null = null;

function getAnthropicClient(): AnthropicClient {
  if (!anthropicClient) {
    anthropicClient = new AnthropicClient();
  }
  return anthropicClient;
}

function getOpenAIClient(): OpenAIClient {
  if (!openaiClient) {
    openaiClient = new OpenAIClient();
  }
  return openaiClient;
}

function getOpenRouterClient(): OpenRouterClient {
  if (!openrouterClient) {
    openrouterClient = new OpenRouterClient();
  }
  return openrouterClient;
}

export function getProviderForModel(model: string): LLMProvider {
  // Check exact match first
  if (MODEL_PROVIDERS[model]) {
    return MODEL_PROVIDERS[model];
  }

  // OpenRouter models have provider prefix (e.g., "anthropic/claude-3.5-sonnet")
  if (model.includes("/")) {
    return "openrouter";
  }

  // Check prefixes for direct API access
  if (model.startsWith("claude-")) {
    return "anthropic";
  }
  if (
    model.startsWith("gpt-") ||
    model.startsWith("o1") ||
    model.startsWith("o3") ||
    model.startsWith("o4")
  ) {
    return "openai";
  }

  // Default to anthropic
  console.warn(`[LLM] Unknown model ${model}, defaulting to anthropic`);
  return "anthropic";
}

export class LLMClient {
  async complete(params: CompletionParams): Promise<string> {
    const provider = getProviderForModel(params.model);

    switch (provider) {
      case "openai":
        return getOpenAIClient().complete(params);
      case "openrouter":
        return getOpenRouterClient().complete(params);
      case "anthropic":
      default:
        return getAnthropicClient().complete(params);
    }
  }
}

// Export available models for reference
export const AVAILABLE_MODELS = {
  anthropic: {
    "claude-opus-4-5-20251101": "Most capable, best for complex coding",
    "claude-sonnet-4-5-20250929": "Balanced speed/quality",
    "claude-haiku-4-5-20251015": "Fast and cheap",
  },
  openai: {
    // GPT-4.1 family (April 2025)
    "gpt-4.1": "Latest GPT, 1M context, best coding",
    "gpt-4.1-mini": "Faster GPT-4.1",
    "gpt-4.1-nano": "Smallest, fastest GPT-4.1",
    // GPT-4o family
    "gpt-4o": "Multimodal GPT-4",
    "gpt-4o-mini": "Fast multimodal",
    // Reasoning models (o-series)
    o3: "Latest flagship reasoning",
    "o3-pro": "Extended thinking, most reliable",
    "o3-mini": "Fast reasoning model",
    "o4-mini": "Newest, best math/coding",
    o1: "Original reasoning model",
    "o1-mini": "Smaller reasoning model",
  },
  openrouter: {
    // Use any model via OpenRouter with "provider/model" format
    "anthropic/claude-3.5-sonnet": "Claude 3.5 Sonnet via OpenRouter",
    "openai/gpt-4o": "GPT-4o via OpenRouter",
    "google/gemini-2.0-flash-exp": "Gemini 2.0 Flash",
    "google/gemini-exp-1206": "Gemini Exp 1206",
    "meta-llama/llama-3.3-70b-instruct": "Llama 3.3 70B",
    "deepseek/deepseek-chat": "DeepSeek Chat",
    "deepseek/deepseek-r1": "DeepSeek R1 (Reasoning)",
    "mistralai/codestral-2501": "Codestral (Code specialist)",
    "qwen/qwen-2.5-coder-32b-instruct": "Qwen 2.5 Coder 32B",
    "qwen/qwq-32b-preview": "QwQ 32B (Reasoning)",
  },
};
