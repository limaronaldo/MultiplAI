/**
 * Processing Modes - Unified interface for different multi-agent processing strategies
 *
 * This module integrates the AutoGen-inspired patterns:
 * - MoA (Mixture of Agents) - Layered multi-model with aggregation
 * - Debate - Multi-agent debate with consensus
 * - Swarm - Agent-declared handoffs
 * - Single - Traditional single-agent processing
 *
 * @see RML-725, RML-726, RML-731
 */

import { Task } from "./types";
import {
  MixtureOfAgents,
  MoAConfig,
  MoAResult,
  DEFAULT_MOA_CONFIG,
  MOA_LITE_CONFIG,
  MOA_HEAVY_CONFIG,
} from "./mixture-of-agents";
import {
  DebateRunner,
  DebateConfig,
  DebateResult,
  DEFAULT_DEBATE_CONFIG,
  FAST_DEBATE_CONFIG,
} from "./debate-runner";
import {
  SwarmOrchestrator,
  SwarmConfig,
  SwarmRunResult,
  DEFAULT_SWARM_CONFIG,
  createDefaultSwarmAgents,
} from "./swarm";
import { CoderAgent } from "../agents/coder";
import { FixerAgent } from "../agents/fixer";
import { db, getDb } from "../integrations/db";
import { createSystemLogger } from "./logger";

const logger = createSystemLogger("processing-modes");

// ============================================
// Types
// ============================================

export type ProcessingMode = "single" | "moa" | "debate" | "swarm";

export interface ProcessingModeConfig {
  mode: ProcessingMode;

  // MoA-specific config
  moaPreset?: "lite" | "default" | "heavy";
  moaConfig?: Partial<MoAConfig>;

  // Debate-specific config
  debatePreset?: "fast" | "default";
  debateConfig?: Partial<DebateConfig>;

  // Swarm-specific config
  swarmConfig?: Partial<SwarmConfig>;
}

export interface ProcessingResult {
  success: boolean;
  diff?: string;
  commitMessage?: string;
  metadata: {
    mode: ProcessingMode;
    tokensUsed?: number;
    estimatedCost?: number;
    iterations?: number;
    agentsUsed?: string[];
    consensusScore?: number;
  };
  error?: string;
}

// Use any for agent inputs to avoid type conflicts with internal agent interfaces
// The actual types are defined in each agent file
export type CoderInput = {
  definitionOfDone: string[];
  plan: string[];
  targetFiles: string[];
  fileContents: Record<string, string>;
  previousDiff?: string;
  lastError?: string;
  [key: string]: unknown;
};

export type FixerInput = {
  definitionOfDone: string[];
  plan: string[];
  currentDiff: string;
  errorLogs: string;
  fileContents: Record<string, string>;
  [key: string]: unknown;
};

// ============================================
// Default Configuration
// ============================================

const DEFAULT_MODE_CONFIG: ProcessingModeConfig = {
  mode: "single",
};

// Store current mode config in memory (can be overridden per-task or globally)
let globalModeConfig: ProcessingModeConfig = DEFAULT_MODE_CONFIG;

// ============================================
// Mode Configuration Management
// ============================================

/**
 * Get the current global processing mode config
 */
export function getProcessingModeConfig(): ProcessingModeConfig {
  return { ...globalModeConfig };
}

/**
 * Set the global processing mode config
 */
export function setProcessingModeConfig(
  config: Partial<ProcessingModeConfig>,
): void {
  globalModeConfig = { ...globalModeConfig, ...config };
  logger.info(`Processing mode set to: ${globalModeConfig.mode}`);
}

/**
 * Get the processing mode for a specific task
 * Priority: task-specific > global config
 */
export async function getTaskProcessingMode(
  taskId: string,
): Promise<ProcessingModeConfig> {
  // Check if task has a specific mode override in session memory
  try {
    const sql = getDb();
    const [result] = await sql`
      SELECT processing_mode FROM session_memory WHERE task_id = ${taskId}
    `;
    if (result?.processing_mode) {
      return result.processing_mode as ProcessingModeConfig;
    }
  } catch (error) {
    // Ignore - column may not exist yet
  }

  return getProcessingModeConfig();
}

/**
 * Set the processing mode for a specific task
 */
export async function setTaskProcessingMode(
  taskId: string,
  config: ProcessingModeConfig,
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE session_memory
    SET processing_mode = ${JSON.stringify(config)}::jsonb
    WHERE task_id = ${taskId}
  `;
  logger.info(`Task ${taskId} processing mode set to: ${config.mode}`);
}

// ============================================
// Processing Mode Runners
// ============================================

/**
 * Run coding with the specified processing mode
 */
export async function runCodingWithMode(
  task: Task,
  input: CoderInput,
  modeConfig?: ProcessingModeConfig,
): Promise<ProcessingResult> {
  const config = modeConfig || (await getTaskProcessingMode(task.id));

  logger.info(`Running coding for task ${task.id} with mode: ${config.mode}`);

  switch (config.mode) {
    case "moa":
      return runMoACoding(task, input, config);

    case "debate":
      return runDebateCoding(task, input, config);

    case "swarm":
      return runSwarmCoding(task, input, config);

    case "single":
    default:
      return runSingleCoding(task, input);
  }
}

/**
 * Run fixing with the specified processing mode
 */
export async function runFixingWithMode(
  task: Task,
  input: FixerInput,
  modeConfig?: ProcessingModeConfig,
): Promise<ProcessingResult> {
  const config = modeConfig || (await getTaskProcessingMode(task.id));

  logger.info(`Running fixing for task ${task.id} with mode: ${config.mode}`);

  switch (config.mode) {
    case "moa":
      return runMoAFixing(task, input, config);

    case "debate":
      return runDebateFixing(task, input, config);

    case "swarm":
      // Swarm uses handoffs, not parallel fixing
      // Fall back to single for fixing
      return runSingleFixing(task, input);

    case "single":
    default:
      return runSingleFixing(task, input);
  }
}

// ============================================
// Single Agent Mode
// ============================================

async function runSingleCoding(
  task: Task,
  input: CoderInput,
): Promise<ProcessingResult> {
  const coder = new CoderAgent();

  try {
    const output = await coder.run(input);

    return {
      success: true,
      diff: output.diff,
      commitMessage: output.commitMessage,
      metadata: {
        mode: "single",
        agentsUsed: ["coder"],
      },
    };
  } catch (error) {
    return {
      success: false,
      metadata: { mode: "single" },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runSingleFixing(
  task: Task,
  input: FixerInput,
): Promise<ProcessingResult> {
  const fixer = new FixerAgent();

  try {
    const output = await fixer.run(input);

    return {
      success: true,
      diff: output.diff,
      commitMessage: output.commitMessage,
      metadata: {
        mode: "single",
        agentsUsed: ["fixer"],
      },
    };
  } catch (error) {
    return {
      success: false,
      metadata: { mode: "single" },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================
// MoA Mode
// ============================================

async function runMoACoding(
  task: Task,
  input: CoderInput,
  config: ProcessingModeConfig,
): Promise<ProcessingResult> {
  // Select MoA config based on preset or custom config
  let moaConfig: MoAConfig;

  if (config.moaConfig) {
    moaConfig = { ...DEFAULT_MOA_CONFIG, ...config.moaConfig };
  } else {
    switch (config.moaPreset) {
      case "lite":
        moaConfig = MOA_LITE_CONFIG;
        break;
      case "heavy":
        moaConfig = MOA_HEAVY_CONFIG;
        break;
      default:
        moaConfig = DEFAULT_MOA_CONFIG;
    }
  }

  const moa = new MixtureOfAgents(moaConfig);

  try {
    // Build context string from file contents
    const context = Object.entries(input.fileContents)
      .map(([path, content]) => `// File: ${path}\n${content}`)
      .join("\n\n");

    const result: MoAResult = await moa.run(task, input.plan, context);

    // Record MoA run in database
    await db.createMoARun({
      id: crypto.randomUUID(),
      taskId: task.id,
      layers: moaConfig.layers,
      proposersPerLayer: moaConfig.proposersPerLayer,
      proposerModels: moaConfig.proposerModels,
      aggregatorModel: moaConfig.aggregatorModel,
      status: "completed",
      finalDiff: result.diff,
      proposerResults: result.proposerResults,
      aggregationReasoning: result.aggregation.reasoning,
      totalTokens: result.totalTokens,
      estimatedCost: result.estimatedCost,
    });

    return {
      success: true,
      diff: result.diff,
      commitMessage: `feat: implement changes (MoA aggregation)`,
      metadata: {
        mode: "moa",
        tokensUsed: result.totalTokens,
        estimatedCost: result.estimatedCost,
        agentsUsed: moaConfig.proposerModels,
      },
    };
  } catch (error) {
    return {
      success: false,
      metadata: { mode: "moa" },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runMoAFixing(
  task: Task,
  input: FixerInput,
  config: ProcessingModeConfig,
): Promise<ProcessingResult> {
  // For fixing, we use a lightweight MoA config
  const moaConfig = config.moaConfig
    ? { ...MOA_LITE_CONFIG, ...config.moaConfig }
    : MOA_LITE_CONFIG;

  const moa = new MixtureOfAgents(moaConfig);

  // Build context string from file contents
  const context = Object.entries(input.fileContents)
    .map(([path, content]) => `// File: ${path}\n${content}`)
    .join("\n\n");

  // Add error context to plan
  const fixPlan = [
    ...input.plan,
    `Fix error: ${input.errorLogs.slice(0, 500)}`,
  ];

  try {
    const result: MoAResult = await moa.run(task, fixPlan, context);

    return {
      success: true,
      diff: result.diff,
      commitMessage: `fix: apply corrections (MoA aggregation)`,
      metadata: {
        mode: "moa",
        tokensUsed: result.totalTokens,
        estimatedCost: result.estimatedCost,
        agentsUsed: moaConfig.proposerModels,
      },
    };
  } catch (error) {
    return {
      success: false,
      metadata: { mode: "moa" },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================
// Debate Mode
// ============================================

async function runDebateCoding(
  task: Task,
  input: CoderInput,
  config: ProcessingModeConfig,
): Promise<ProcessingResult> {
  // Select debate config based on preset or custom config
  let debateConfig: DebateConfig;

  if (config.debateConfig) {
    debateConfig = { ...DEFAULT_DEBATE_CONFIG, ...config.debateConfig };
  } else {
    switch (config.debatePreset) {
      case "fast":
        debateConfig = FAST_DEBATE_CONFIG;
        break;
      default:
        debateConfig = DEFAULT_DEBATE_CONFIG;
    }
  }

  const debater = new DebateRunner(debateConfig);

  try {
    // Build context string from file contents
    const context = Object.entries(input.fileContents)
      .map(([path, content]) => `// File: ${path}\n${content}`)
      .join("\n\n");

    const result: DebateResult = await debater.runDebate(
      task,
      input.plan,
      context,
    );

    // Record debate session in database
    await db.createDebateSession({
      id: crypto.randomUUID(),
      taskId: task.id,
      solverCount: debateConfig.solverCount,
      maxRounds: debateConfig.maxRounds,
      topology: debateConfig.topology,
      aggregationMethod: debateConfig.aggregationMethod,
      status: result.consensusScore >= 0.7 ? "completed" : "failed",
      finalDiff: result.diff,
      consensusScore: result.consensusScore,
      selectedSolver: result.selectedSolver,
    });

    return {
      success: result.consensusScore >= 0.7,
      diff: result.diff,
      commitMessage: `feat: implement changes (debate consensus)`,
      metadata: {
        mode: "debate",
        iterations: result.rounds.length,
        consensusScore: result.consensusScore,
        agentsUsed: debateConfig.solverModels,
      },
    };
  } catch (error) {
    return {
      success: false,
      metadata: { mode: "debate" },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runDebateFixing(
  task: Task,
  input: FixerInput,
  config: ProcessingModeConfig,
): Promise<ProcessingResult> {
  // Use fast debate for fixing
  const debateConfig = config.debateConfig
    ? { ...FAST_DEBATE_CONFIG, ...config.debateConfig }
    : FAST_DEBATE_CONFIG;

  const debater = new DebateRunner(debateConfig);

  // Build context string from file contents
  const context = Object.entries(input.fileContents)
    .map(([path, content]) => `// File: ${path}\n${content}`)
    .join("\n\n");

  // Add error context to plan
  const fixPlan = [
    ...input.plan,
    `Fix error: ${input.errorLogs.slice(0, 500)}`,
  ];

  try {
    const result: DebateResult = await debater.runDebate(
      task,
      fixPlan,
      context,
    );

    return {
      success: result.consensusScore >= 0.7,
      diff: result.diff,
      commitMessage: `fix: apply corrections (debate consensus)`,
      metadata: {
        mode: "debate",
        iterations: result.rounds.length,
        consensusScore: result.consensusScore,
        agentsUsed: debateConfig.solverModels,
      },
    };
  } catch (error) {
    return {
      success: false,
      metadata: { mode: "debate" },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================
// Swarm Mode
// ============================================

async function runSwarmCoding(
  task: Task,
  input: CoderInput,
  config: ProcessingModeConfig,
): Promise<ProcessingResult> {
  const swarmConfig: SwarmConfig = {
    ...DEFAULT_SWARM_CONFIG,
    ...config.swarmConfig,
  };

  const swarm = new SwarmOrchestrator(swarmConfig);
  const agents = createDefaultSwarmAgents();
  swarm.registerAll(agents);

  try {
    const result: SwarmRunResult = await swarm.run(task, "planner");

    // Extract diff from output if available
    const output = result.output as
      | { diff?: string; commitMessage?: string }
      | undefined;

    return {
      success: result.success,
      diff: output?.diff,
      commitMessage: output?.commitMessage || `feat: implement changes (swarm)`,
      metadata: {
        mode: "swarm",
        iterations: result.iterations,
        agentsUsed: result.handoffChain.map((h) => h.from),
      },
      error: result.error,
    };
  } catch (error) {
    return {
      success: false,
      metadata: { mode: "swarm" },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================
// Mode Recommendation
// ============================================

/**
 * Recommend a processing mode based on task characteristics
 */
export function recommendProcessingMode(task: Task): ProcessingModeConfig {
  const complexity = task.estimatedComplexity;
  const effort = task.estimatedEffort;

  // XS tasks - single agent is sufficient
  if (complexity === "XS") {
    return { mode: "single" };
  }

  // High effort or M+ complexity - consider multi-agent
  if (effort === "high" || complexity === "M" || complexity === "L") {
    // For medium complexity, use debate (faster)
    if (complexity === "M") {
      return { mode: "debate", debatePreset: "default" };
    }

    // For large complexity, use MoA (more thorough)
    if (complexity === "L") {
      return { mode: "moa", moaPreset: "default" };
    }

    // High effort but small complexity - use lite MoA
    return { mode: "moa", moaPreset: "lite" };
  }

  // Default to single agent
  return { mode: "single" };
}

/**
 * Get available processing modes with descriptions
 */
export function getAvailableModes(): Array<{
  mode: ProcessingMode;
  name: string;
  description: string;
  presets?: string[];
  bestFor: string;
}> {
  return [
    {
      mode: "single",
      name: "Single Agent",
      description:
        "Traditional single-model processing. Fast and cost-effective.",
      bestFor: "XS/S complexity tasks, simple bug fixes, quick changes",
    },
    {
      mode: "moa",
      name: "Mixture of Agents",
      description:
        "Layered multi-model architecture with proposers and aggregator. Best for complex tasks requiring diverse perspectives.",
      presets: ["lite", "default", "heavy"],
      bestFor:
        "L/XL complexity tasks, architectural changes, critical features",
    },
    {
      mode: "debate",
      name: "Multi-Agent Debate",
      description:
        "Multiple solvers debate and critique each other's solutions. Good for finding edge cases.",
      presets: ["fast", "default"],
      bestFor:
        "M complexity tasks, code review scenarios, quality-critical changes",
    },
    {
      mode: "swarm",
      name: "Swarm Handoffs",
      description:
        "Agents hand off to specialists based on task needs. Dynamic and adaptive.",
      bestFor: "Multi-domain tasks, tasks requiring different expertise phases",
    },
  ];
}
