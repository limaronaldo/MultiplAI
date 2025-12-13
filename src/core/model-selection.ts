/**
 * Model Selection Strategy
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
 * Current approved models (as of 2025-12-12):
 * - Planner: gpt-5.1-codex-max (high reasoning)
 * - Coder XS: gpt-5.2 (effort-based) → gpt-5.2 (xhigh) → Claude Opus 4.5
 * - Coder S/M: gpt-5.2 (high) → gpt-5.2 (xhigh) → Claude Opus 4.5
 * - Fixer: gpt-5.1-codex-max (medium reasoning)
 * - Reviewer: gpt-5.1-codex-max (medium reasoning)
 * - Fallback: claude-sonnet-4-5-20250929
 *
 * Escalation Path (prevents complete failures):
 * - Attempt 0 (first try): GPT-5.2 with effort-based reasoning
 * - Attempt 1 (1st failure): GPT-5.2 xhigh (maximum reasoning)
 * - Attempt 2+ (2nd failure): Claude Opus 4.5 (final fallback)
 *
 * GPT-5.2 configurations use internal config names (e.g., gpt-5.2-medium)
 * which map to model "gpt-5.2" with specific reasoning effort levels.
 *
 * Available models:
 * - gpt-5.1-codex-max: Long autonomous coding, high reasoning
 * - gpt-5.1-codex-mini: Fast, lightweight coding tasks
 * - claude-opus-4-5-20251101: High quality, first attempt
 * - claude-sonnet-4-5-20250929: Fallback, general purpose
 * - x-ai/grok-3-mini: Fast, cheap (via OpenRouter)
 *
 * ⚠️ OPENAI: ONLY USE gpt-5.1-codex-* models - NO LEGACY MODELS (gpt-4o, o1, o3, gpt-5.2, etc.)
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
 * All reasoning model configurations (GPT-5.2 + DeepSeek)
 */
export const REASONING_MODEL_CONFIGS = {
  ...GPT52_CONFIGS,
  ...DEEPSEEK_CONFIGS,
} as const;

/**
 * All model configurations (reasoning + multimodal)
 */
export const ALL_MODEL_CONFIGS = {
  ...REASONING_MODEL_CONFIGS,
  ...GLM_CONFIGS,
} as const;

export type ReasoningModelConfigName = keyof typeof REASONING_MODEL_CONFIGS;

/**
 * Model tiers from cheapest to most expensive
 *
 * ⚠️ DO NOT MODIFY without user approval - see header comment
 */
export const MODEL_TIERS: ModelTier[] = [
  {
    name: "nano",
    models: ["gpt-5.2-none"],
    description: "GPT-5.2 (reasoning: none). Ultra-fast, minimal thinking.",
    avgCostPerTask: 0.01,
  },
  {
    name: "fast",
    models: ["gpt-5.2-low"],
    description: "GPT-5.2 (reasoning: low). Quick with light reasoning.",
    avgCostPerTask: 0.03,
  },
  {
    name: "medium",
    models: ["gpt-5.2-medium"],
    description: "GPT-5.2 (reasoning: medium). Balanced speed/quality.",
    avgCostPerTask: 0.08,
  },
  {
    name: "standard",
    models: ["gpt-5.2-high"],
    description: "GPT-5.2 (reasoning: high). Thorough reasoning for coding.",
    avgCostPerTask: 0.15,
  },
  {
    name: "thinking",
    models: ["gpt-5.2-xhigh"],
    description:
      "GPT-5.2 (reasoning: xhigh). Maximum reasoning for hard problems.",
    avgCostPerTask: 0.5,
  },
  {
    name: "fallback",
    models: ["claude-opus-4-5-20251101"],
    description:
      "Claude Opus 4.5. Final fallback when GPT-5.2 escalation fails.",
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

  // M tasks: gpt-5.2 (high) → gpt-5.2 (xhigh) → Claude Opus
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
        models: ["gpt-5.2-xhigh"],
        useMultiAgent: false,
        reason: "M complexity with 1 failure → gpt-5.2 (xhigh reasoning)",
      };
    }
    return {
      tier: "standard",
      models: ["gpt-5.2-high"],
      useMultiAgent: false,
      reason: "M complexity → gpt-5.2 (high reasoning)",
    };
  }

  // S tasks: gpt-5.2 (high) → gpt-5.2 (xhigh) → Claude Opus
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
        models: ["gpt-5.2-xhigh"],
        useMultiAgent: false,
        reason: "S complexity with 1 failure → gpt-5.2 (xhigh reasoning)",
      };
    }
    return {
      tier: "standard",
      models: ["gpt-5.2-high"],
      useMultiAgent: false,
      reason: "S complexity → gpt-5.2 (high reasoning)",
    };
  }

  // XS tasks: effort-based selection with escalation
  return selectForXS(effort, attemptCount);
}

/**
 * Select models for XS tasks based on effort level
 *
 * Effort-based selection using GPT-5.2 with different reasoning levels:
 * - low: gpt-5.2-low (reasoning: low)
 * - medium: gpt-5.2-medium (reasoning: medium)
 * - high: gpt-5.2-high (reasoning: high)
 * - undefined: gpt-5.2-medium (default)
 *
 * Escalation path:
 * - Attempt 1: gpt-5.2 (effort-based)
 * - Attempt 2: gpt-5.2-xhigh (max reasoning)
 * - Attempt 3: Claude Opus 4.5 (fallback to different model)
 */
function selectForXS(
  effort: EffortLevel | undefined,
  attemptCount: number,
): ModelSelection {
  // Final fallback: Claude Opus after GPT-5.2 xhigh fails
  if (attemptCount >= 2) {
    return {
      tier: "fallback",
      models: ["claude-opus-4-5-20251101"],
      useMultiAgent: false,
      reason: "XS with 2+ failures → Claude Opus 4.5 (final fallback)",
    };
  }

  // First escalation: GPT-5.2 xhigh
  if (attemptCount >= 1) {
    return {
      tier: "thinking",
      models: ["gpt-5.2-xhigh"],
      useMultiAgent: false,
      reason: "XS with 1 failure → gpt-5.2 (xhigh reasoning)",
    };
  }

  // First attempt: effort-based selection
  if (effort === "low") {
    return {
      tier: "fast",
      models: ["gpt-5.2-low"],
      useMultiAgent: false,
      reason: "XS low effort → gpt-5.2 (low reasoning)",
    };
  }

  if (effort === "medium") {
    return {
      tier: "medium",
      models: ["gpt-5.2-medium"],
      useMultiAgent: false,
      reason: "XS medium effort → gpt-5.2 (medium reasoning)",
    };
  }

  // high effort
  if (effort === "high") {
    return {
      tier: "standard",
      models: ["gpt-5.2-high"],
      useMultiAgent: false,
      reason: "XS high effort → gpt-5.2 (high reasoning)",
    };
  }

  // undefined effort → default to medium reasoning
  return {
    tier: "medium",
    models: ["gpt-5.2-medium"],
    useMultiAgent: false,
    reason: "XS (no effort specified) → gpt-5.2 (medium reasoning)",
  };
}

/**
 * Select models for Fixer agent
 *
 * Uses gpt-5.1-codex-max with medium reasoning for all attempts.
 * Fixer model is configured in fixer.ts, this is for escalation tracking.
 */
export function selectFixerModels(context: SelectionContext): ModelSelection {
  const { attemptCount } = context;

  // All fix attempts use gpt-5.1-codex-max (configured in fixer.ts)
  return {
    tier: "thinking",
    models: ["gpt-5.1-codex-max"],
    useMultiAgent: false,
    reason: `Fixer attempt ${attemptCount + 1} → gpt-5.1-codex-max (medium reasoning)`,
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
