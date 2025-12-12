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
 * - Fast tier: x-ai/grok-code-fast-1 (via OpenRouter)
 * - Standard tier: claude-opus-4-5-20251101 (direct Anthropic API)
 * - Multi tier: claude-opus-4-5-20251101, gpt-5.2, x-ai/grok-code-fast-1
 * - Thinking tier: gpt-5.2-pro (Responses API with high reasoning)
 * - Fixer tier: gpt-5.2 with reasoning.effort: "xhigh"
 *
 * ⚠️ OPENAI: ONLY USE GPT-5.2 OR GPT-5.1-CODEX - NO LEGACY MODELS (gpt-4o, o1, o3, etc.)
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
 * Model tiers from cheapest to most expensive
 *
 * ⚠️ DO NOT MODIFY without user approval - see header comment
 */
export const MODEL_TIERS: ModelTier[] = [
  {
    name: "fast",
    models: ["x-ai/grok-code-fast-1"],
    description: "Ultra-fast, cheap. For typos, comments, simple renames.",
    avgCostPerTask: 0.01,
  },
  {
    name: "standard",
    models: ["claude-opus-4-5-20251101"],
    description:
      "High quality single agent. For simple features, bug fixes, tests.",
    avgCostPerTask: 0.15,
  },
  {
    name: "multi",
    models: ["claude-opus-4-5-20251101", "gpt-5.2", "x-ai/grok-code-fast-1"],
    description: "Multi-agent consensus. For complex features, refactors.",
    avgCostPerTask: 0.5,
  },
  {
    name: "thinking",
    models: ["gpt-5.1-codex-max", "gpt-5.2-pro"],
    description:
      "Deep reasoning. Codex-Max for long autonomous coding, 5.2-pro for hard thinking.",
    avgCostPerTask: 2.0,
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
 */
export function selectModels(context: SelectionContext): ModelSelection {
  const { complexity, effort, attemptCount } = context;

  // XL/L tasks should be broken down, not processed directly
  if (complexity === "XL" || complexity === "L") {
    return {
      tier: "standard",
      models: MODEL_TIERS[1].models,
      useMultiAgent: false,
      reason: "Large tasks should be broken down into subtasks",
    };
  }

  // M tasks get multi-agent by default
  if (complexity === "M") {
    if (attemptCount >= 2) {
      return {
        tier: "thinking",
        models: MODEL_TIERS[3].models,
        useMultiAgent: false,
        reason: "M complexity with 2+ failures → thinking models",
      };
    }
    return {
      tier: "multi",
      models: MODEL_TIERS[2].models,
      useMultiAgent: true,
      reason: "M complexity → multi-agent consensus",
    };
  }

  // S tasks: standard or escalate
  if (complexity === "S") {
    if (attemptCount >= 2) {
      return {
        tier: "multi",
        models: MODEL_TIERS[2].models,
        useMultiAgent: true,
        reason: "S complexity with 2+ failures → multi-agent",
      };
    }
    if (attemptCount >= 1) {
      return {
        tier: "standard",
        models: MODEL_TIERS[1].models,
        useMultiAgent: false,
        reason: "S complexity with 1 failure → standard retry",
      };
    }
    return {
      tier: "standard",
      models: MODEL_TIERS[1].models,
      useMultiAgent: false,
      reason: "S complexity → standard models",
    };
  }

  // XS tasks: effort-based selection with escalation
  return selectForXS(effort, attemptCount);
}

/**
 * Select models for XS tasks based on effort and escalation
 */
function selectForXS(
  effort: EffortLevel | undefined,
  attemptCount: number,
): ModelSelection {
  // Default to medium effort if not specified
  const effectiveEffort = effort || "medium";

  // Escalation chain based on attempts
  if (attemptCount >= 3) {
    return {
      tier: "thinking",
      models: MODEL_TIERS[3].models,
      useMultiAgent: false,
      reason: "XS with 3+ failures → thinking models (last resort)",
    };
  }

  if (attemptCount >= 2) {
    return {
      tier: "multi",
      models: MODEL_TIERS[2].models,
      useMultiAgent: true,
      reason: "XS with 2+ failures → multi-agent consensus",
    };
  }

  if (attemptCount >= 1) {
    // After first failure, escalate one tier
    if (effectiveEffort === "low") {
      return {
        tier: "standard",
        models: MODEL_TIERS[1].models,
        useMultiAgent: false,
        reason: "XS-low with 1 failure → escalate to standard",
      };
    }
    if (effectiveEffort === "medium") {
      return {
        tier: "multi",
        models: MODEL_TIERS[2].models,
        useMultiAgent: true,
        reason: "XS-medium with 1 failure → escalate to multi-agent",
      };
    }
    // high effort already uses multi-agent
    return {
      tier: "thinking",
      models: MODEL_TIERS[3].models,
      useMultiAgent: false,
      reason: "XS-high with 1 failure → escalate to thinking",
    };
  }

  // First attempt: use effort-based selection
  switch (effectiveEffort) {
    case "low":
      return {
        tier: "fast",
        models: MODEL_TIERS[0].models,
        useMultiAgent: false,
        reason: "XS-low effort → Grok Fast (cheapest)",
      };

    case "medium":
      return {
        tier: "standard",
        models: MODEL_TIERS[1].models,
        useMultiAgent: false,
        reason: "XS-medium effort → standard models",
      };

    case "high":
      return {
        tier: "multi",
        models: MODEL_TIERS[2].models,
        useMultiAgent: true,
        reason: "XS-high effort → multi-agent consensus",
      };

    default:
      return {
        tier: "standard",
        models: MODEL_TIERS[1].models,
        useMultiAgent: false,
        reason: "XS default → standard models",
      };
  }
}

/**
 * Select models for Fixer agent
 *
 * Escalation chain:
 * - First attempt: GPT-5.2 with xhigh reasoning
 * - After 1 failure: Claude Opus 4.5 (single)
 * - After 2+ failures: Thinking models (gpt-5.1-codex-max)
 */
export function selectFixerModels(context: SelectionContext): ModelSelection {
  const { attemptCount } = context;

  // Escalation for fixer: GPT-5.2 → Opus 4.5 → Thinking
  if (attemptCount >= 2) {
    return {
      tier: "thinking",
      models: MODEL_TIERS[3].models,
      useMultiAgent: false,
      reason: "Fixer with 2+ failures → thinking models (gpt-5.1-codex-max)",
    };
  }

  if (attemptCount >= 1) {
    return {
      tier: "standard",
      models: ["claude-opus-4-5-20251101"],
      useMultiAgent: false,
      reason: "Fixer with 1 failure → Claude Opus 4.5 (single)",
    };
  }

  // First fix attempt: GPT-5.2 with xhigh reasoning
  return {
    tier: "fixer",
    models: ["gpt-5.2"],
    useMultiAgent: false,
    reason: "Fixer uses GPT-5.2 with xhigh reasoning effort",
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
  console.log(
    `[ModelSelection] ${context.complexity}-${context.effort || "unknown"} ` +
      `(attempt ${context.attemptCount}) → ${selection.tier}: ${selection.reason}`,
  );
}
