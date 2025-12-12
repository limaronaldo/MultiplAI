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
 * - Coder: claude-opus-4-5-20251101 → gpt-5.1-codex-mini → gpt-5.1-codex-max (escalation)
 * - Fixer: gpt-5.1-codex-max (medium reasoning)
 * - Reviewer: gpt-5.1-codex-max (medium reasoning)
 * - Fallback: claude-sonnet-4-5-20250514
 *
 * Available models:
 * - gpt-5.1-codex-max: Long autonomous coding, high reasoning
 * - gpt-5.1-codex-mini: Fast, lightweight coding tasks
 * - claude-opus-4-5-20251101: High quality, first attempt
 * - claude-sonnet-4-5-20250514: Fallback, general purpose
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
 * Model tiers from cheapest to most expensive
 *
 * ⚠️ DO NOT MODIFY without user approval - see header comment
 */
export const MODEL_TIERS: ModelTier[] = [
  {
    name: "fast",
    models: ["x-ai/grok-code-fast-1"],
    description: "Ultra-fast, cheap. For XS low effort tasks.",
    avgCostPerTask: 0.01,
  },
  {
    name: "medium",
    models: ["gpt-5.1-codex-mini"],
    description: "Fast codex model with high reasoning. For XS medium effort.",
    avgCostPerTask: 0.05,
  },
  {
    name: "standard",
    models: ["claude-opus-4-5-20251101"],
    description: "High quality. For XS high effort, S, M tasks.",
    avgCostPerTask: 0.15,
  },
  {
    name: "thinking",
    models: ["gpt-5.1-codex-max"],
    description: "Deep reasoning. For escalation after failures.",
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

  // M tasks: Opus → gpt-5.1-codex-max (escalation)
  if (complexity === "M") {
    if (attemptCount >= 1) {
      return {
        tier: "thinking",
        models: ["gpt-5.1-codex-max"],
        useMultiAgent: false,
        reason: "M complexity with failures → gpt-5.1-codex-max",
      };
    }
    return {
      tier: "standard",
      models: ["claude-opus-4-5-20251101"],
      useMultiAgent: false,
      reason: "M complexity → Claude Opus 4.5",
    };
  }

  // S tasks: Opus → gpt-5.1-codex-max (escalation)
  if (complexity === "S") {
    if (attemptCount >= 1) {
      return {
        tier: "thinking",
        models: ["gpt-5.1-codex-max"],
        useMultiAgent: false,
        reason: "S complexity with failures → gpt-5.1-codex-max",
      };
    }
    return {
      tier: "standard",
      models: ["claude-opus-4-5-20251101"],
      useMultiAgent: false,
      reason: "S complexity → Claude Opus 4.5",
    };
  }

  // XS tasks: effort-based selection with escalation
  return selectForXS(effort, attemptCount);
}

/**
 * Select models for XS tasks based on effort level
 *
 * Effort-based selection:
 * - low: x-ai/grok-code-fast-1 (fast, cheap)
 * - medium: gpt-5.1-codex-mini (high reasoning)
 * - high: claude-opus-4-5-20251101 (high quality)
 *
 * Escalation after failures → gpt-5.1-codex-max
 */
function selectForXS(
  effort: EffortLevel | undefined,
  attemptCount: number,
): ModelSelection {
  // Escalation after failures
  if (attemptCount >= 2) {
    return {
      tier: "thinking",
      models: ["gpt-5.1-codex-max"],
      useMultiAgent: false,
      reason: "XS with 2+ failures → gpt-5.1-codex-max",
    };
  }

  if (attemptCount >= 1) {
    return {
      tier: "thinking",
      models: ["gpt-5.1-codex-max"],
      useMultiAgent: false,
      reason: "XS with 1 failure → gpt-5.1-codex-max",
    };
  }

  // First attempt: effort-based selection
  if (effort === "low") {
    return {
      tier: "fast",
      models: ["x-ai/grok-code-fast-1"],
      useMultiAgent: false,
      reason: "XS low effort → grok-code-fast-1",
    };
  }

  if (effort === "medium") {
    return {
      tier: "medium",
      models: ["gpt-5.1-codex-mini"],
      useMultiAgent: false,
      reason: "XS medium effort → gpt-5.1-codex-mini (high reasoning)",
    };
  }

  // high effort or undefined → Opus 4.5
  return {
    tier: "standard",
    models: ["claude-opus-4-5-20251101"],
    useMultiAgent: false,
    reason: "XS high effort → Claude Opus 4.5",
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
  console.log(
    `[ModelSelection] ${context.complexity}-${context.effort || "unknown"} ` +
      `(attempt ${context.attemptCount}) → ${selection.tier}: ${selection.reason}`,
  );
}
