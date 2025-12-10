import { AnthropicClient } from "./anthropic";
import { OpenAIClient } from "./openai";

export type LLMProvider = "anthropic" | "openai";

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

export function getProviderForModel(model: string): LLMProvider {
  // Check exact match first
  if (MODEL_PROVIDERS[model]) {
    return MODEL_PROVIDERS[model];
  }

  // Check prefixes
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

    if (provider === "openai") {
      return getOpenAIClient().complete(params);
    } else {
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
};
