/**
 * Model Selection Strategy - Hybrid Option C
 *
 * Selects models based on task effort level and escalation state.
 * Implements cost-efficient routing: cheap models for simple tasks,
 * expensive models only when needed.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️  DO NOT CHANGE MODELS WITHOUT EXPRESS USER APPROVAL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Model changes require explicit user confirmation because:
 * 1. Different providers have different billing/credits
 * 2. Model naming conventions vary (OpenRouter uses "anthropic/...", direct API uses "claude-...")
 * 3. User has specific preferences for cost/quality tradeoffs
 *
 * HYBRID STRATEGY - Updated 2025-12-15:
 * ─────────────────────────────────────────────────
 * Agent                │ Model                    │ Cost/Task │ Provider
 * ─────────────────────┼──────────────────────────┼───────────┼──────────────
 * Planner              │ claude-haiku-4-5         │ ~$0.02    │ Anthropic
 * Fixer                │ claude-opus-4-5          │ ~$0.50    │ Anthropic
 * Reviewer             │ claude-sonnet-4-5        │ ~$0.10    │ Anthropic
 * Escalation 1         │ claude-sonnet-4-5        │ ~$0.15    │ Anthropic
 * Escalation 2         │ claude-opus-4-5          │ ~$0.75    │ Anthropic
 *
 * CODER BY COMPLEXITY + EFFORT:
 * ─────────────────────────────────────────────────
 * XS low               │ deepseek-speciale-low    │ ~$0.005   │ OpenRouter (ZDR)
 * XS medium            │ gpt-5.2-medium           │ ~$0.08    │ OpenAI Direct
 * XS high              │ gpt-5.2-high             │ ~$0.15    │ OpenAI Direct
 * XS default           │ gpt-5.2-medium           │ ~$0.08    │ OpenAI Direct
 * ─────────────────────────────────────────────────
 * S low                │ grok-code-fast-1         │ ~$0.01    │ OpenRouter (ZDR)
 * S medium             │ gpt-5.2-low              │ ~$0.03    │ OpenAI Direct
 * S high               │ gpt-5.2-medium           │ ~$0.08    │ OpenAI Direct
 * S default            │ grok-code-fast-1         │ ~$0.01    │ OpenRouter (ZDR)
 * ─────────────────────────────────────────────────
 * M low                │ gpt-5.2-medium           │ ~$0.08    │ OpenAI Direct
 * M medium             │ gpt-5.2-high             │ ~$0.15    │ OpenAI Direct
 * M high               │ claude-opus-4-5          │ ~$0.75    │ Anthropic
 * M default            │ gpt-5.2-medium           │ ~$0.08    │ OpenAI Direct
 *
 * ZDR = Zero Data Retention (Parasail, Nebius, Baseten providers)
 *
 * Escalation Path:
 * - Attempt 0: Effort-based (DeepSeek/Grok for low/med, Claude for high)
 * - Attempt 1: Claude Sonnet 4.5 (reliable recovery)
 * - Attempt 2+: Claude Opus 4.5 (final fallback)
 *
 * Available models:
 * - deepseek-speciale-*: Ultra-cheap reasoning (OpenRouter/Parasail)
 * - x-ai/grok-*: Fast coding models (OpenRouter)
 * - claude-haiku-4-5: Fast, cheap planning (Anthropic)
 * - claude-sonnet-4-5: Balanced quality (Anthropic)
 * - claude-opus-4-5: Final fallback (Anthropic)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { EffortLevel } from "./types";
import { db } from "../integrations/db";

/**
 * Runtime model configuration cache
 *
 * Loaded from database on startup and refreshed periodically.
 * Falls back to defaults if database unavailable.
 */
let modelConfigCache: Map<string, string> = new Map();
let cacheLoadedAt: Date | null = null;
const CACHE_TTL_MS = 60_000; // Refresh every 60 seconds

/**
 * Default model configuration (fallback)
 *
 * ⚠️ NO OPENAI MODELS - OpenAI quota exhausted as of 2025-12-15
 * All defaults use Claude (Anthropic), Grok (xAI), or DeepSeek (OpenRouter)
 */
export const DEFAULT_MODEL_CONFIG: Record<string, string> = {
  // Core agents - all Anthropic Claude
  planner: "claude-haiku-4-5-20251001",
  fixer: "claude-opus-4-5-20251101",
  reviewer: "claude-sonnet-4-5-20250929",
  escalation_1: "claude-sonnet-4-5-20250929",
  escalation_2: "claude-opus-4-5-20251101",
  // XS tasks - DeepSeek and Grok (cheap, fast)
  coder_xs_low: "deepseek/deepseek-v3.2-speciale",
  coder_xs_medium: "x-ai/grok-code-fast-1",
  coder_xs_high: "x-ai/grok-3",
  coder_xs_default: "x-ai/grok-code-fast-1",
  // S tasks - Grok and Claude
  coder_s_low: "deepseek/deepseek-v3.2-speciale",
  coder_s_medium: "x-ai/grok-3",
  coder_s_high: "anthropic/claude-sonnet-4",
  coder_s_default: "x-ai/grok-code-fast-1",
  // M tasks - Grok and Claude
  coder_m_low: "x-ai/grok-3",
  coder_m_medium: "anthropic/claude-sonnet-4",
  coder_m_high: "claude-opus-4-5-20251101",
  coder_m_default: "anthropic/claude-sonnet-4",
};

/**
 * Load model configuration from database
 */
async function loadModelConfig(): Promise<void> {
  try {
    const configs = await db.getModelConfigs();
    modelConfigCache.clear();
    for (const config of configs) {
      modelConfigCache.set(config.position, config.modelId);
    }
    cacheLoadedAt = new Date();
    console.log(
      `[ModelSelection] Loaded ${configs.length} model configs from database`,
    );
  } catch (error) {
    console.warn(
      "[ModelSelection] Failed to load config from database, using defaults:",
      error,
    );
  }
}

/**
 * Get model for a specific position (with caching)
 *
 * Fallback chain: cache → defaults → claude-sonnet (never OpenAI)
 */
export async function getModelForPosition(position: string): Promise<string> {
  // Check if cache needs refresh
  const now = new Date();
  if (
    !cacheLoadedAt ||
    now.getTime() - cacheLoadedAt.getTime() > CACHE_TTL_MS
  ) {
    await loadModelConfig();
  }

  // Return cached value or default
  return (
    modelConfigCache.get(position) ||
    DEFAULT_MODEL_CONFIG[position] ||
    "claude-sonnet-4-5-20250929" // Safe fallback (no OpenAI)
  );
}

/**
 * Get model synchronously (from cache only, no DB call)
 * Use this in hot paths where async is not acceptable
 *
 * Fallback chain: cache → defaults → claude-sonnet (never OpenAI)
 */
export function getModelForPositionSync(position: string): string {
  return (
    modelConfigCache.get(position) ||
    DEFAULT_MODEL_CONFIG[position] ||
    "claude-sonnet-4-5-20250929" // Safe fallback (no OpenAI)
  );
}

/**
 * Force refresh model config cache
 */
export async function refreshModelConfig(): Promise<void> {
  await loadModelConfig();
}

/**
 * Initialize model config on startup
 */
export async function initModelConfig(): Promise<void> {
  await loadModelConfig();
}

export interface ModelTier {
  name: string;
  models: string[];
  description: string;
  avgCostPerTask: number; // estimated USD
}

/**
 * GPT-5.2 Configurations
 *
 * All use model "gpt-5.2" but with different reasoning effort levels.
 * Internal config names for selection logic.
 *
 * GPT-5.2 Reasoning Effort Levels:
 * - none: Minimal reasoning, fastest, cheapest
 * - low: Light reasoning
 * - medium: Balanced reasoning
 * - high: Thorough reasoning (default for gpt-5.2)
 * - xhigh: Maximum reasoning (hardest problems)
 */
export const GPT52_CONFIGS = {
  "gpt-5.2-none": { model: "gpt-5.2", reasoningEffort: "none" as const },
  "gpt-5.2-low": { model: "gpt-5.2", reasoningEffort: "low" as const },
  "gpt-5.2-medium": { model: "gpt-5.2", reasoningEffort: "medium" as const },
  "gpt-5.2-high": { model: "gpt-5.2", reasoningEffort: "high" as const },
  "gpt-5.2-xhigh": { model: "gpt-5.2", reasoningEffort: "xhigh" as const },
} as const;

export type GPT52ConfigName = keyof typeof GPT52_CONFIGS;

/**
 * GPT-5.1-Codex-Max Configurations
 *
 * GPT-5.1-Codex-Max is optimized for long-running autonomous coding tasks.
 * Uses Responses API with reasoning effort parameter.
 *
 * Supported Reasoning Effort Levels:
 * - low: Light reasoning
 * - medium: Balanced reasoning (recommended for interactive)
 * - high: Thorough reasoning (recommended for hard tasks)
 * - xhigh: Maximum reasoning (hardest problems)
 *
 * Note: "none" is NOT supported for Codex models
 */
export const CODEX_MAX_CONFIGS = {
  "gpt-5.1-codex-max-low": {
    model: "gpt-5.1-codex-max",
    reasoningEffort: "low" as const,
  },
  "gpt-5.1-codex-max-medium": {
    model: "gpt-5.1-codex-max",
    reasoningEffort: "medium" as const,
  },
  "gpt-5.1-codex-max-high": {
    model: "gpt-5.1-codex-max",
    reasoningEffort: "high" as const,
  },
  "gpt-5.1-codex-max-xhigh": {
    model: "gpt-5.1-codex-max",
    reasoningEffort: "xhigh" as const,
  },
} as const;

export type CodexMaxConfigName = keyof typeof CODEX_MAX_CONFIGS;

/**
 * GPT-5.1-Codex-Mini Configurations
 *
 * GPT-5.1-Codex-Mini is a faster, cheaper version of Codex for simpler tasks.
 * Uses Responses API with reasoning effort parameter.
 *
 * Supported Reasoning Effort Levels:
 * - medium: Balanced reasoning
 * - high: Thorough reasoning
 *
 * Note: "none", "low", and "xhigh" are NOT supported for Codex Mini
 */
export const CODEX_MINI_CONFIGS = {
  "gpt-5.1-codex-mini-medium": {
    model: "gpt-5.1-codex-mini",
    reasoningEffort: "medium" as const,
  },
  "gpt-5.1-codex-mini-high": {
    model: "gpt-5.1-codex-mini",
    reasoningEffort: "high" as const,
  },
} as const;

export type CodexMiniConfigName = keyof typeof CODEX_MINI_CONFIGS;

/**
 * DeepSeek V3.2 Special Edition Configurations
 *
 * DeepSeek's reasoning model via OpenRouter with configurable effort levels.
 * Uses "reasoning.effort" parameter in OpenRouter API.
 *
 * Reasoning Effort Levels:
 * - low: Light reasoning (~40 tokens), fastest, cheapest
 * - medium: Balanced reasoning (~100 tokens)
 * - high: Thorough reasoning (~200+ tokens)
 *
 * Cost: ~$0.0002 per request (very cheap reasoning model)
 */
export const DEEPSEEK_CONFIGS = {
  "deepseek-speciale-low": {
    model: "deepseek/deepseek-v3.2-speciale",
    reasoningEffort: "low" as const,
  },
  "deepseek-speciale-medium": {
    model: "deepseek/deepseek-v3.2-speciale",
    reasoningEffort: "medium" as const,
  },
  "deepseek-speciale-high": {
    model: "deepseek/deepseek-v3.2-speciale",
    reasoningEffort: "high" as const,
  },
} as const;

export type DeepSeekConfigName = keyof typeof DEEPSEEK_CONFIGS;

/**
 * Z.AI GLM 4.6V Configuration
 *
 * Large multimodal reasoning model for high-fidelity visual understanding and
 * long-context reasoning across images, documents, and mixed media.
 *
 * Specs:
 * - Context: 131K tokens
 * - Input: $0.30/M tokens
 * - Output: $0.90/M tokens
 * - Provider: Parasail (US, zero data retention)
 * - Quantization: fp8
 * - Latency: 0.47s, Throughput: 125tps
 *
 * Note: This is a reasoning model. Output is wrapped in <|begin_of_box|>...<|end_of_box|>
 * markers. Reasoning is returned in message.reasoning field.
 * Requires max_tokens >= 500 to complete reasoning and produce output.
 *
 * Use cases: Document analysis, image understanding, chart processing
 */
export const GLM_CONFIGS = {
  "glm-4.6v": {
    model: "z-ai/glm-4.6v",
  },
} as const;

export type GLMConfigName = keyof typeof GLM_CONFIGS;

/**
 * NOTE: Kimi K2 was removed on 2025-12-15 due to:
 * - JSON parsing issues (truncated responses)
 * - Unreliable output format
 * - Replaced with Claude models for better reliability
 */

/**
 * All reasoning model configurations (GPT-5.2 + Codex + DeepSeek)
 */
export const REASONING_MODEL_CONFIGS = {
  ...GPT52_CONFIGS,
  ...CODEX_MAX_CONFIGS,
  ...CODEX_MINI_CONFIGS,
  ...DEEPSEEK_CONFIGS,
} as const;

/**
 * All model configurations (reasoning + multimodal + agentic)
 */
export const ALL_MODEL_CONFIGS = {
  ...REASONING_MODEL_CONFIGS,
  ...GLM_CONFIGS,
} as const;

export type ReasoningModelConfigName = keyof typeof REASONING_MODEL_CONFIGS;

/**
 * Model tiers from cheapest to most expensive
 *
 * Strategy - Anthropic + OpenRouter (no OpenAI):
 * - XS low/medium: DeepSeek/Grok (ultra-cheap, ~$0.005-0.02)
 * - XS high, S, M: Grok/Claude Sonnet (quality, ~$0.10-0.15)
 * - Escalation 1: Claude Sonnet 4.5 (reliable recovery, ~$0.15)
 * - Escalation 2: Claude Opus 4.5 (final fallback, ~$0.50)
 *
 * ⚠️ DO NOT MODIFY without user approval - see header comment
 */
export const MODEL_TIERS: ModelTier[] = [
  {
    name: "nano",
    models: ["deepseek-speciale-low"],
    description: "DeepSeek Speciale (low). Ultra-cheap for typos/simple fixes.",
    avgCostPerTask: 0.005,
  },
  {
    name: "fast",
    models: ["x-ai/grok-code-fast-1"],
    description: "Grok Code Fast. Quick coding with good quality.",
    avgCostPerTask: 0.01,
  },
  {
    name: "medium",
    models: ["x-ai/grok-3"],
    description: "Grok 3. Balanced speed/quality for most tasks.",
    avgCostPerTask: 0.05,
  },
  {
    name: "standard",
    models: ["claude-sonnet-4-5-20250929"],
    description: "Claude Sonnet 4.5. Reliable coding quality.",
    avgCostPerTask: 0.1,
  },
  {
    name: "thinking",
    models: ["claude-sonnet-4-5-20250929"],
    description: "Claude Sonnet 4.5. Reliable recovery for failed tasks.",
    avgCostPerTask: 0.15,
  },
  {
    name: "fallback",
    models: ["claude-opus-4-5-20251101"],
    description: "Claude Opus 4.5. Final fallback when all else fails.",
    avgCostPerTask: 0.5,
  },
];

export interface ModelSelection {
  tier: string;
  models: string[];
  useMultiAgent: boolean;
  reason: string;
}

export interface SelectionContext {
  complexity: "XS" | "S" | "M" | "L" | "XL";
  effort: EffortLevel | undefined;
  attemptCount: number;
  lastError?: string;
  isSubtask?: boolean;
}

/**
 * Select models based on task context and escalation state
 *
 * NOTE: Multi-agent disabled for now - using single agent escalation only
 */
export function selectModels(context: SelectionContext): ModelSelection {
  const { complexity, effort, attemptCount } = context;

  // XL/L tasks should be broken down, not processed directly
  if (complexity === "XL" || complexity === "L") {
    return {
      tier: "standard",
      models: ["claude-opus-4-5-20251101"],
      useMultiAgent: false,
      reason: "Large tasks should be broken down into subtasks",
    };
  }

  // M tasks: effort-based → Claude Sonnet → Claude Opus
  if (complexity === "M") {
    if (attemptCount >= 2) {
      return {
        tier: "fallback",
        models: ["claude-opus-4-5-20251101"],
        useMultiAgent: false,
        reason: "M complexity with 2+ failures → Claude Opus 4.5 (fallback)",
      };
    }
    if (attemptCount >= 1) {
      return {
        tier: "thinking",
        models: ["claude-sonnet-4-5-20250929"],
        useMultiAgent: false,
        reason: "M complexity with 1 failure → Claude Sonnet 4.5 (recovery)",
      };
    }
    return selectForM(effort);
  }

  // S tasks: effort-based → Claude Sonnet → Claude Opus
  if (complexity === "S") {
    if (attemptCount >= 2) {
      return {
        tier: "fallback",
        models: ["claude-opus-4-5-20251101"],
        useMultiAgent: false,
        reason: "S complexity with 2+ failures → Claude Opus 4.5 (fallback)",
      };
    }
    if (attemptCount >= 1) {
      return {
        tier: "thinking",
        models: ["claude-sonnet-4-5-20250929"],
        useMultiAgent: false,
        reason: "S complexity with 1 failure → Claude Sonnet 4.5 (recovery)",
      };
    }
    return selectForS(effort);
  }

  // XS tasks: effort-based selection with escalation
  return selectForXS(effort, attemptCount);
}

/**
 * Select models for XS tasks based on effort level
 *
 * Uses configurable models from database (via getModelForPositionSync).
 * Falls back to hardcoded defaults if no config available.
 *
 * Escalation path:
 * - Attempt 0: Effort-based (from config)
 * - Attempt 1: escalation_1 model (agentic recovery)
 * - Attempt 2+: escalation_2 model (final fallback)
 */
function selectForXS(
  effort: EffortLevel | undefined,
  attemptCount: number,
): ModelSelection {
  // Final fallback: escalation_2 model
  if (attemptCount >= 2) {
    const model = getModelForPositionSync("escalation_2");
    return {
      tier: "fallback",
      models: [model],
      useMultiAgent: false,
      reason: `XS with 2+ failures → ${model} (final fallback)`,
    };
  }

  // First escalation: escalation_1 model (agentic recovery)
  if (attemptCount >= 1) {
    const model = getModelForPositionSync("escalation_1");
    return {
      tier: "thinking",
      models: [model],
      useMultiAgent: false,
      reason: `XS with 1 failure → ${model} (agentic recovery)`,
    };
  }

  // First attempt: effort-based selection from config
  if (effort === "low") {
    const model = getModelForPositionSync("coder_xs_low");
    return {
      tier: "fast",
      models: [model],
      useMultiAgent: false,
      reason: `XS low effort → ${model}`,
    };
  }

  if (effort === "medium") {
    const model = getModelForPositionSync("coder_xs_medium");
    return {
      tier: "medium",
      models: [model],
      useMultiAgent: false,
      reason: `XS medium effort → ${model}`,
    };
  }

  if (effort === "high") {
    const model = getModelForPositionSync("coder_xs_high");
    return {
      tier: "standard",
      models: [model],
      useMultiAgent: false,
      reason: `XS high effort → ${model}`,
    };
  }

  // undefined effort → default model
  const model = getModelForPositionSync("coder_xs_default");
  return {
    tier: "medium",
    models: [model],
    useMultiAgent: false,
    reason: `XS (no effort specified) → ${model}`,
  };
}

/**
 * Select models for S tasks based on effort level
 *
 * Uses configurable models from database (via getModelForPositionSync).
 */
function selectForS(effort: EffortLevel | undefined): ModelSelection {
  if (effort === "low") {
    const model = getModelForPositionSync("coder_s_low");
    return {
      tier: "fast",
      models: [model],
      useMultiAgent: false,
      reason: `S low effort → ${model}`,
    };
  }

  if (effort === "medium") {
    const model = getModelForPositionSync("coder_s_medium");
    return {
      tier: "medium",
      models: [model],
      useMultiAgent: false,
      reason: `S medium effort → ${model}`,
    };
  }

  if (effort === "high") {
    const model = getModelForPositionSync("coder_s_high");
    return {
      tier: "standard",
      models: [model],
      useMultiAgent: false,
      reason: `S high effort → ${model}`,
    };
  }

  // default
  const model = getModelForPositionSync("coder_s_default");
  return {
    tier: "fast",
    models: [model],
    useMultiAgent: false,
    reason: `S (no effort specified) → ${model}`,
  };
}

/**
 * Select models for M tasks based on effort level
 *
 * Uses configurable models from database (via getModelForPositionSync).
 */
function selectForM(effort: EffortLevel | undefined): ModelSelection {
  if (effort === "low") {
    const model = getModelForPositionSync("coder_m_low");
    return {
      tier: "medium",
      models: [model],
      useMultiAgent: false,
      reason: `M low effort → ${model}`,
    };
  }

  if (effort === "medium") {
    const model = getModelForPositionSync("coder_m_medium");
    return {
      tier: "standard",
      models: [model],
      useMultiAgent: false,
      reason: `M medium effort → ${model}`,
    };
  }

  if (effort === "high") {
    const model = getModelForPositionSync("coder_m_high");
    return {
      tier: "fallback",
      models: [model],
      useMultiAgent: false,
      reason: `M high effort → ${model}`,
    };
  }

  // default
  const model = getModelForPositionSync("coder_m_default");
  return {
    tier: "medium",
    models: [model],
    useMultiAgent: false,
    reason: `M (no effort specified) → ${model}`,
  };
}

/**
 * Select models for Fixer agent
 *
 * Uses configurable fixer model from database.
 */
export function selectFixerModels(context: SelectionContext): ModelSelection {
  const { attemptCount } = context;
  const model = getModelForPositionSync("fixer");

  return {
    tier: "thinking",
    models: [model],
    useMultiAgent: false,
    reason: `Fixer attempt ${attemptCount + 1} → ${model} (agentic debugging)`,
  };
}

/**
 * Get the primary model from a selection (first model in list)
 */
export function getPrimaryModel(selection: ModelSelection): string {
  return selection.models[0];
}

/**
 * Estimate cost for a model selection
 */
export function estimateCost(selection: ModelSelection): number {
  const tier = MODEL_TIERS.find((t) => t.name === selection.tier);
  return tier?.avgCostPerTask ?? 0.1;
}

/**
 * Log model selection decision
 */
export function logSelection(
  context: SelectionContext,
  selection: ModelSelection,
): void {
  const primaryModel = getPrimaryModel(selection);
  const estimatedCost = estimateCost(selection);

  console.log(
    `[ModelSelection] ${context.complexity}-${context.effort || "unknown"} ` +
      `(attempt ${context.attemptCount}) → ${selection.tier} (${primaryModel}) ` +
      `~$${estimatedCost.toFixed(2)}/task | ${selection.reason}`,
  );
}
