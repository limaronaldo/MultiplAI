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
 * HYBRID STRATEGY - Updated 2025-12-13:
 * ─────────────────────────────────────────────────
 * Agent                │ Model                    │ Cost/Task │ Provider
 * ─────────────────────┼──────────────────────────┼───────────┼──────────────
 * Planner              │ deepseek-speciale-high   │ ~$0.02    │ OpenRouter
 * Fixer (even)         │ deepseek-speciale-high   │ ~$0.02    │ OpenRouter
 * Fixer (odd)          │ glm-4.6-exacto           │ ~$0.02    │ OpenRouter
 * Reviewer             │ deepseek-speciale-high   │ ~$0.02    │ OpenRouter
 * Escalation 1         │ deepseek-speciale-high   │ ~$0.02    │ OpenRouter
 * Escalation 2         │ claude-opus-4-5          │ ~$0.75    │ Anthropic
 *
 * CODER BY COMPLEXITY + EFFORT:
 * ─────────────────────────────────────────────────
 * XS low               │ deepseek-speciale-low    │ ~$0.005   │ OpenRouter
 * XS medium            │ glm-4.6-exacto           │ ~$0.02    │ OpenRouter
 * XS high              │ gpt-5.2-high             │ ~$0.15    │ OpenAI Direct
 * XS default           │ glm-4.6-exacto           │ ~$0.02    │ OpenRouter
 * ─────────────────────────────────────────────────
 * S low                │ grok-code-fast-1         │ ~$0.01    │ OpenRouter
 * S medium             │ gpt-5.2-low              │ ~$0.03    │ OpenAI Direct
 * S high               │ gpt-5.2-medium           │ ~$0.08    │ OpenAI Direct
 * S default            │ grok-code-fast-1         │ ~$0.01    │ OpenRouter
 * ─────────────────────────────────────────────────
 * M low                │ gpt-5.2-medium           │ ~$0.08    │ OpenAI Direct
 * M medium             │ gpt-5.2-high             │ ~$0.15    │ OpenAI Direct
 * M high               │ claude-opus-4-5          │ ~$0.75    │ Anthropic
 * M default            │ gpt-5.2-medium           │ ~$0.08    │ OpenAI Direct
 *
 * Escalation Path:
 * - Attempt 0: Effort-based (DeepSeek/GLM for low/med, GPT-5.2 for high)
 * - Attempt 1: DeepSeek or GLM (alternating for rate limit avoidance)
 * - Attempt 2+: Claude Opus 4.5 (final fallback)
 *
 * Cost Savings vs Previous Config:
 * - XS low task: $0.005 vs $0.03 (83% savings)
 * - XS medium task: $0.01 vs $0.08 (87% savings)
 * - Typical XS task: ~$0.30-0.35 vs ~$0.85 (59% savings)
 *
 * Available models:
 * - deepseek-speciale-*: Ultra-cheap reasoning (OpenRouter/Parasail)
 * - deepseek-speciale-high: Cheap reasoning model (OpenRouter/Parasail)
 * - gpt-5.2-high: Proven coding quality (OpenAI Direct)
 * - claude-opus-4-5: Final fallback (Anthropic Direct)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { EffortLevel } from "./types";

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
 * Z.AI GLM 4.6 Configurations
 *
 * GLM 4.6V - Large multimodal reasoning model for visual understanding.
 * GLM 4.6 Exacto - Cheap code generation model, DeepSeek alternative.
 *
 * GLM 4.6V Specs:
 * - Context: 131K tokens
 * - Input: $0.30/M tokens, Output: $0.90/M tokens
 * - Provider: Parasail (US, zero data retention)
 * - Use cases: Document analysis, image understanding
 *
 * GLM 4.6 Exacto Specs:
 * - Context: 204.8K tokens
 * - Max Output: 131.1K tokens
 * - Input: $0.44/M tokens, Output: $1.76/M tokens
 * - Provider: NovitaAI (US, bf16)
 * - Latency: 1.33s, Throughput: 66tps
 * - Use cases: Cheap code generation, medium complexity tasks
 */
export const GLM_CONFIGS = {
  "glm-4.6v": {
    model: "z-ai/glm-4.6v",
  },
  "glm-4.6-exacto": {
    model: "z-ai/glm-4.6:exacto",
  },
} as const;

export type GLMConfigName = keyof typeof GLM_CONFIGS;

/**
 * MoonshotAI Kimi K2 Thinking Configuration
 *
 * Moonshot AI's most advanced open reasoning model. Trillion-parameter MoE
 * architecture (32B active per forward pass) optimized for agentic,
 * long-horizon reasoning with persistent step-by-step thought and tool use.
 *
 * Specs:
 * - Context: 262K tokens (256K usable)
 * - Max Output: 163-262K tokens
 * - Input: $0.45-0.60/M tokens
 * - Output: $2.35-2.50/M tokens
 * - Providers: Nebius Token Factory (NL), Baseten (US)
 * - Data Policy: Zero retention, no prompt training
 * - Latency: 0.37-0.49s, Throughput: 97-112tps
 *
 * Capabilities:
 * - Stable multi-agent behavior through 200-300 tool calls
 * - Benchmarks: HLE, BrowseComp, SWE-Multilingual, LiveCodeBench
 * - Autonomous research, coding, and writing without drift
 *
 * Ideal for: Complex agentic tasks, multi-step reasoning, tool-heavy workflows
 */
export const KIMI_CONFIGS = {
  "kimi-k2-thinking": {
    model: "moonshotai/kimi-k2-thinking",
  },
} as const;

export type KimiConfigName = keyof typeof KIMI_CONFIGS;

/**
 * All reasoning model configurations (GPT-5.2 + DeepSeek)
 */
export const REASONING_MODEL_CONFIGS = {
  ...GPT52_CONFIGS,
  ...DEEPSEEK_CONFIGS,
} as const;

/**
 * All model configurations (reasoning + multimodal + agentic)
 */
export const ALL_MODEL_CONFIGS = {
  ...REASONING_MODEL_CONFIGS,
  ...GLM_CONFIGS,
  ...KIMI_CONFIGS,
} as const;

export type ReasoningModelConfigName = keyof typeof REASONING_MODEL_CONFIGS;

/**
 * Model tiers from cheapest to most expensive
 *
 * Hybrid Strategy (Option C) - Optimized for cost/performance:
 * - XS low/medium: DeepSeek Speciale (ultra-cheap, ~$0.005-0.01)
 * - XS high, S, M: GPT-5.2 (proven quality, ~$0.15)
 * - Escalation 1: Kimi K2 Thinking (agentic recovery, ~$0.20)
 * - Escalation 2: Claude Opus 4.5 (final fallback, ~$0.75)
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
    models: ["deepseek-speciale-low"],
    description: "DeepSeek Speciale (low). Quick with light reasoning.",
    avgCostPerTask: 0.005,
  },
  {
    name: "glm",
    models: ["z-ai/glm-4.6:exacto"],
    description: "GLM 4.6 Exacto. Cheap coding, large context (204K).",
    avgCostPerTask: 0.02,
  },
  {
    name: "medium",
    models: ["deepseek-speciale-medium"],
    description: "DeepSeek Speciale (medium). Balanced speed/quality.",
    avgCostPerTask: 0.01,
  },
  {
    name: "standard",
    models: ["gpt-5.2-high"],
    description: "GPT-5.2 (reasoning: high). Thorough reasoning for coding.",
    avgCostPerTask: 0.15,
  },
  {
    name: "thinking",
    models: ["deepseek-speciale-high"],
    description:
      "DeepSeek V3.2 Speciale (high). Cheap reasoning for failed task recovery.",
    avgCostPerTask: 0.02,
  },
  {
    name: "glm-recovery",
    models: ["z-ai/glm-4.6:exacto"],
    description: "GLM 4.6 Exacto. Alternative recovery model to DeepSeek.",
    avgCostPerTask: 0.02,
  },
  {
    name: "fallback",
    models: ["claude-opus-4-5-20251101"],
    description: "Claude Opus 4.5. Final fallback when all else fails.",
    avgCostPerTask: 0.75,
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

  // M tasks: effort-based → Kimi K2 → Claude Opus
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
        models: ["deepseek-speciale-high"],
        useMultiAgent: false,
        reason: "M complexity with 1 failure → DeepSeek Speciale (recovery)",
      };
    }
    return selectForM(effort);
  }

  // S tasks: effort-based → Kimi K2 → Claude Opus
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
        models: ["deepseek-speciale-high"],
        useMultiAgent: false,
        reason: "S complexity with 1 failure → DeepSeek Speciale (recovery)",
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
 * Hybrid Strategy (Option C):
 * - low: DeepSeek Speciale (low) - ultra-cheap for typos
 * - medium: DeepSeek Speciale (medium) - cheap for simple bugs
 * - high: GPT-5.2 (high) - proven quality for complex tasks
 * - undefined: DeepSeek Speciale (medium) (default)
 *
 * Escalation path:
 * - Attempt 0: Effort-based (DeepSeek or GPT-5.2)
 * - Attempt 1: DeepSeek Speciale (high) (recovery)
 * - Attempt 2+: Claude Opus 4.5 (final fallback)
 */
function selectForXS(
  effort: EffortLevel | undefined,
  attemptCount: number,
): ModelSelection {
  // Final fallback: Claude Opus after Kimi K2 fails
  if (attemptCount >= 2) {
    return {
      tier: "fallback",
      models: ["claude-opus-4-5-20251101"],
      useMultiAgent: false,
      reason: "XS with 2+ failures → Claude Opus 4.5 (final fallback)",
    };
  }

  // First escalation: DeepSeek Speciale (high) for recovery
  if (attemptCount >= 1) {
    return {
      tier: "thinking",
      models: ["deepseek-speciale-high"],
      useMultiAgent: false,
      reason: "XS with 1 failure → DeepSeek Speciale (recovery)",
    };
  }

  // First attempt: effort-based selection
  if (effort === "low") {
    return {
      tier: "fast",
      models: ["deepseek-speciale-low"],
      useMultiAgent: false,
      reason: "XS low effort → DeepSeek Speciale (low) ~$0.005",
    };
  }

  if (effort === "medium") {
    return {
      tier: "glm",
      models: ["z-ai/glm-4.6:exacto"],
      useMultiAgent: false,
      reason: "XS medium effort → GLM 4.6 Exacto ~$0.02",
    };
  }

  // high effort - keep GPT-5.2 for quality
  if (effort === "high") {
    return {
      tier: "standard",
      models: ["gpt-5.2-high"],
      useMultiAgent: false,
      reason: "XS high effort → GPT-5.2 (high reasoning) ~$0.15",
    };
  }

  // undefined effort → default to GLM 4.6 Exacto (cheap, large context)
  return {
    tier: "glm",
    models: ["z-ai/glm-4.6:exacto"],
    useMultiAgent: false,
    reason: "XS (no effort specified) → GLM 4.6 Exacto ~$0.02",
  };
}

/**
 * Select models for S tasks based on effort level
 *
 * Option A (Cheap):
 * - low: Grok Code Fast (~$0.01)
 * - medium: GPT-5.2 low (~$0.03)
 * - high: GPT-5.2 medium (~$0.08)
 * - default: Grok Code Fast (~$0.01)
 */
function selectForS(effort: EffortLevel | undefined): ModelSelection {
  if (effort === "low") {
    return {
      tier: "fast",
      models: ["x-ai/grok-code-fast-1"],
      useMultiAgent: false,
      reason: "S low effort → Grok Code Fast ~$0.01",
    };
  }

  if (effort === "medium") {
    return {
      tier: "medium",
      models: ["gpt-5.2-low"],
      useMultiAgent: false,
      reason: "S medium effort → GPT-5.2 (low) ~$0.03",
    };
  }

  if (effort === "high") {
    return {
      tier: "standard",
      models: ["gpt-5.2-medium"],
      useMultiAgent: false,
      reason: "S high effort → GPT-5.2 (medium) ~$0.08",
    };
  }

  // default
  return {
    tier: "fast",
    models: ["x-ai/grok-code-fast-1"],
    useMultiAgent: false,
    reason: "S (no effort specified) → Grok Code Fast ~$0.01",
  };
}

/**
 * Select models for M tasks based on effort level
 *
 * - low: GPT-5.2 medium (~$0.08)
 * - medium: GPT-5.2 high (~$0.15)
 * - high: Claude Opus 4.5 (~$0.75)
 * - default: GPT-5.2 medium (~$0.08)
 */
function selectForM(effort: EffortLevel | undefined): ModelSelection {
  if (effort === "low") {
    return {
      tier: "medium",
      models: ["gpt-5.2-medium"],
      useMultiAgent: false,
      reason: "M low effort → GPT-5.2 (medium) ~$0.08",
    };
  }

  if (effort === "medium") {
    return {
      tier: "standard",
      models: ["gpt-5.2-high"],
      useMultiAgent: false,
      reason: "M medium effort → GPT-5.2 (high) ~$0.15",
    };
  }

  if (effort === "high") {
    return {
      tier: "fallback",
      models: ["claude-opus-4-5-20251101"],
      useMultiAgent: false,
      reason: "M high effort → Claude Opus 4.5 ~$0.75",
    };
  }

  // default
  return {
    tier: "medium",
    models: ["gpt-5.2-medium"],
    useMultiAgent: false,
    reason: "M (no effort specified) → GPT-5.2 (medium) ~$0.08",
  };
}

/**
 * Select models for Fixer agent
 *
 * Alternates between DeepSeek and GLM to avoid rate limits.
 * Odd attempts → DeepSeek Speciale (high)
 * Even attempts → GLM 4.6 Exacto
 */
export function selectFixerModels(context: SelectionContext): ModelSelection {
  const { attemptCount } = context;

  // Alternate between DeepSeek and GLM to spread load
  if (attemptCount % 2 === 0) {
    return {
      tier: "thinking",
      models: ["deepseek-speciale-high"],
      useMultiAgent: false,
      reason: `Fixer attempt ${attemptCount + 1} → DeepSeek Speciale (debugging)`,
    };
  } else {
    return {
      tier: "glm-recovery",
      models: ["z-ai/glm-4.6:exacto"],
      useMultiAgent: false,
      reason: `Fixer attempt ${attemptCount + 1} → GLM 4.6 Exacto (alt recovery)`,
    };
  }
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
