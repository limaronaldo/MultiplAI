/**
 * Swarm Orchestration Pattern
 *
 * Implements agent-declared handoff targets where each agent specifies
 * which agents it can hand off to. The orchestrator validates and
 * executes handoffs based on these declarations.
 *
 * Benefits:
 * - Decentralized control: agents declare their own handoff rules
 * - Type-safe: handoffs are validated at runtime
 * - Flexible: supports conditional and dynamic handoffs
 * - Debuggable: clear handoff chain tracking
 *
 * @see https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/swarm.html
 */

import { db } from "../integrations/db";
import type { Task } from "./types";

// ============================================
// Types
// ============================================

export interface SwarmAgent {
  /** Unique agent identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Agents this agent can hand off to */
  handoffs: string[];
  /** Condition-based handoffs */
  conditionalHandoffs?: ConditionalHandoff[];
  /** Run the agent */
  run(context: SwarmContext): Promise<SwarmResult>;
}

export interface ConditionalHandoff {
  /** Target agent ID */
  target: string;
  /** Condition that must be true */
  condition: (result: SwarmResult, context: SwarmContext) => boolean;
  /** Priority (higher = checked first) */
  priority?: number;
}

export interface SwarmContext {
  /** Current task */
  task: Task;
  /** Handoff chain history */
  handoffChain: HandoffRecord[];
  /** Shared state between agents */
  sharedState: Record<string, unknown>;
  /** Current iteration */
  iteration: number;
  /** Maximum iterations */
  maxIterations: number;
}

export interface HandoffRecord {
  /** Source agent */
  from: string;
  /** Target agent */
  to: string;
  /** Why handoff occurred */
  reason: string;
  /** Timestamp */
  timestamp: Date;
  /** Any data passed */
  data?: Record<string, unknown>;
}

export interface SwarmResult {
  /** Did the agent complete successfully */
  success: boolean;
  /** Next agent to hand off to (if any) */
  handoff?: string;
  /** Reason for handoff */
  handoffReason?: string;
  /** Data to pass to next agent */
  handoffData?: Record<string, unknown>;
  /** Output from this agent */
  output?: unknown;
  /** Is this a terminal state */
  isTerminal?: boolean;
  /** Error if failed */
  error?: string;
}

export interface SwarmConfig {
  /** Maximum iterations before forcing stop */
  maxIterations: number;
  /** Allow cycles in handoff chain */
  allowCycles: boolean;
  /** Maximum cycle depth before stopping */
  maxCycleDepth: number;
  /** Validate handoffs before execution */
  validateHandoffs: boolean;
  /** Log handoffs to database */
  logHandoffs: boolean;
}

// ============================================
// Default Configuration
// ============================================

export const DEFAULT_SWARM_CONFIG: SwarmConfig = {
  maxIterations: 20,
  allowCycles: true,
  maxCycleDepth: 3,
  validateHandoffs: true,
  logHandoffs: true,
};

// ============================================
// SwarmOrchestrator Class
// ============================================

export class SwarmOrchestrator {
  private agents: Map<string, SwarmAgent> = new Map();
  private config: SwarmConfig;

  constructor(config: Partial<SwarmConfig> = {}) {
    this.config = { ...DEFAULT_SWARM_CONFIG, ...config };
  }

  /**
   * Register an agent with the swarm
   */
  register(agent: SwarmAgent): this {
    // Validate handoff targets exist (deferred until run)
    this.agents.set(agent.id, agent);
    return this;
  }

  /**
   * Register multiple agents
   */
  registerAll(agents: SwarmAgent[]): this {
    agents.forEach((agent) => this.register(agent));
    return this;
  }

  /**
   * Unregister an agent
   */
  unregister(agentId: string): this {
    this.agents.delete(agentId);
    return this;
  }

  /**
   * Run the swarm starting from a specific agent
   */
  async run(task: Task, startAgentId: string): Promise<SwarmRunResult> {
    // Validate start agent exists
    if (!this.agents.has(startAgentId)) {
      throw new Error(`Start agent '${startAgentId}' not found in swarm`);
    }

    // Validate all handoff targets if configured
    if (this.config.validateHandoffs) {
      this.validateAllHandoffs();
    }

    const context: SwarmContext = {
      task,
      handoffChain: [],
      sharedState: {},
      iteration: 0,
      maxIterations: this.config.maxIterations,
    };

    let currentAgentId = startAgentId;
    let finalResult: SwarmResult | null = null;

    while (context.iteration < this.config.maxIterations) {
      const agent = this.agents.get(currentAgentId);
      if (!agent) {
        throw new Error(`Agent '${currentAgentId}' not found during execution`);
      }

      // Run the agent
      const result = await this.runAgent(agent, context);
      finalResult = result;

      // Log handoff event
      if (this.config.logHandoffs && result.handoff) {
        await db.createTaskEvent({
          taskId: task.id,
          eventType: "SWARM_HANDOFF",
          metadata: {
            from: currentAgentId,
            to: result.handoff,
            reason: result.handoffReason,
            iteration: context.iteration,
          },
        });
      }

      // Check for terminal state
      if (result.isTerminal || !result.handoff) {
        return {
          success: result.success,
          finalAgent: currentAgentId,
          handoffChain: context.handoffChain,
          iterations: context.iteration + 1,
          output: result.output,
          error: result.error,
        };
      }

      // Validate handoff
      if (this.config.validateHandoffs) {
        this.validateHandoff(agent, result.handoff);
      }

      // Check for cycles
      if (!this.config.allowCycles) {
        const cycleCount = context.handoffChain.filter(
          (h) => h.to === result.handoff,
        ).length;
        if (cycleCount > 0) {
          throw new Error(
            `Cycle detected: ${result.handoff} already in handoff chain`,
          );
        }
      } else {
        const cycleCount = context.handoffChain.filter(
          (h) => h.to === result.handoff,
        ).length;
        if (cycleCount >= this.config.maxCycleDepth) {
          return {
            success: false,
            finalAgent: currentAgentId,
            handoffChain: context.handoffChain,
            iterations: context.iteration + 1,
            error: `Max cycle depth (${this.config.maxCycleDepth}) reached for ${result.handoff}`,
          };
        }
      }

      // Record handoff
      context.handoffChain.push({
        from: currentAgentId,
        to: result.handoff,
        reason: result.handoffReason || "No reason provided",
        timestamp: new Date(),
        data: result.handoffData,
      });

      // Merge handoff data into shared state
      if (result.handoffData) {
        context.sharedState = {
          ...context.sharedState,
          ...result.handoffData,
          _lastHandoff: result.handoffData,
        };
      }

      // Move to next agent
      currentAgentId = result.handoff;
      context.iteration++;
    }

    return {
      success: false,
      finalAgent: currentAgentId,
      handoffChain: context.handoffChain,
      iterations: this.config.maxIterations,
      error: "Max iterations reached",
    };
  }

  /**
   * Get the handoff graph as an adjacency list
   */
  getHandoffGraph(): Record<string, string[]> {
    const graph: Record<string, string[]> = {};
    for (const [id, agent] of this.agents) {
      graph[id] = [...agent.handoffs];
      if (agent.conditionalHandoffs) {
        for (const ch of agent.conditionalHandoffs) {
          if (!graph[id].includes(ch.target)) {
            graph[id].push(ch.target);
          }
        }
      }
    }
    return graph;
  }

  /**
   * Get all registered agents
   */
  getAgents(): SwarmAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Check if an agent can hand off to another
   */
  canHandoff(fromId: string, toId: string): boolean {
    const agent = this.agents.get(fromId);
    if (!agent) return false;

    if (agent.handoffs.includes(toId)) return true;
    if (agent.conditionalHandoffs?.some((ch) => ch.target === toId))
      return true;

    return false;
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Run a single agent
   */
  private async runAgent(
    agent: SwarmAgent,
    context: SwarmContext,
  ): Promise<SwarmResult> {
    try {
      const result = await agent.run(context);

      // Check conditional handoffs
      if (!result.handoff && agent.conditionalHandoffs) {
        const sortedConditions = [...agent.conditionalHandoffs].sort(
          (a, b) => (b.priority || 0) - (a.priority || 0),
        );

        for (const ch of sortedConditions) {
          if (ch.condition(result, context)) {
            result.handoff = ch.target;
            result.handoffReason = `Conditional handoff to ${ch.target}`;
            break;
          }
        }
      }

      return result;
    } catch (error) {
      return {
        success: false,
        isTerminal: true,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Validate all handoff targets exist
   */
  private validateAllHandoffs(): void {
    const errors: string[] = [];

    for (const [id, agent] of this.agents) {
      for (const target of agent.handoffs) {
        if (!this.agents.has(target)) {
          errors.push(`Agent '${id}' has invalid handoff target '${target}'`);
        }
      }

      if (agent.conditionalHandoffs) {
        for (const ch of agent.conditionalHandoffs) {
          if (!this.agents.has(ch.target)) {
            errors.push(
              `Agent '${id}' has invalid conditional handoff target '${ch.target}'`,
            );
          }
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(`Handoff validation failed:\n${errors.join("\n")}`);
    }
  }

  /**
   * Validate a specific handoff
   */
  private validateHandoff(agent: SwarmAgent, target: string): void {
    if (!this.canHandoff(agent.id, target)) {
      throw new Error(
        `Invalid handoff: '${agent.id}' cannot hand off to '${target}'. ` +
          `Allowed targets: ${agent.handoffs.join(", ")}`,
      );
    }
  }
}

// ============================================
// Result Types
// ============================================

export interface SwarmRunResult {
  success: boolean;
  finalAgent: string;
  handoffChain: HandoffRecord[];
  iterations: number;
  output?: unknown;
  error?: string;
}

// ============================================
// Default AutoDev Swarm Agents
// ============================================

/**
 * Create default AutoDev swarm agents
 */
export function createDefaultSwarmAgents(): SwarmAgent[] {
  return [
    {
      id: "planner",
      name: "PlannerAgent",
      handoffs: ["coder", "breakdown"],
      conditionalHandoffs: [
        {
          target: "breakdown",
          condition: (result) =>
            result.output !== null &&
            result.output !== undefined &&
            typeof result.output === "object" &&
            (result.output as Record<string, unknown>).complexity === "L",
          priority: 10,
        },
      ],
      run: async (_context) => {
        // Placeholder - would integrate with actual PlannerAgent
        return {
          success: true,
          handoff: "coder",
          handoffReason: "Plan complete, ready for coding",
          output: { plan: [], complexity: "S" },
        };
      },
    },
    {
      id: "breakdown",
      name: "BreakdownAgent",
      handoffs: ["coder"],
      run: async (_context) => {
        return {
          success: true,
          handoff: "coder",
          handoffReason: "Subtasks created",
          output: { subtasks: [] },
        };
      },
    },
    {
      id: "coder",
      name: "CoderAgent",
      handoffs: ["tester"],
      run: async (_context) => {
        return {
          success: true,
          handoff: "tester",
          handoffReason: "Code generated, ready for testing",
          output: { diff: "" },
        };
      },
    },
    {
      id: "tester",
      name: "TesterAgent",
      handoffs: ["fixer", "reviewer"],
      conditionalHandoffs: [
        {
          target: "fixer",
          condition: (result) => !result.success,
          priority: 10,
        },
        {
          target: "reviewer",
          condition: (result) => result.success === true,
          priority: 5,
        },
      ],
      run: async (_context) => {
        // Placeholder - would run actual tests
        const passed = Math.random() > 0.3; // Simulate 70% pass rate
        return {
          success: passed,
          output: { passed, tests: [] },
        };
      },
    },
    {
      id: "fixer",
      name: "FixerAgent",
      handoffs: ["tester"],
      run: async (_context) => {
        return {
          success: true,
          handoff: "tester",
          handoffReason: "Fix applied, retesting",
          output: { fix: "" },
        };
      },
    },
    {
      id: "reviewer",
      name: "ReviewerAgent",
      handoffs: ["coder", "finisher"],
      conditionalHandoffs: [
        {
          target: "coder",
          condition: (result) =>
            result.output !== null &&
            result.output !== undefined &&
            typeof result.output === "object" &&
            (result.output as Record<string, unknown>).verdict ===
              "REQUEST_CHANGES",
          priority: 10,
        },
        {
          target: "finisher",
          condition: (result) =>
            result.output !== null &&
            result.output !== undefined &&
            typeof result.output === "object" &&
            (result.output as Record<string, unknown>).verdict === "APPROVE",
          priority: 5,
        },
      ],
      run: async (_context) => {
        // Placeholder
        return {
          success: true,
          output: { verdict: "APPROVE" },
        };
      },
    },
    {
      id: "finisher",
      name: "FinisherAgent",
      handoffs: [], // Terminal agent
      run: async (_context) => {
        return {
          success: true,
          isTerminal: true,
          output: { prCreated: true },
        };
      },
    },
  ];
}

// ============================================
// Factory Functions
// ============================================

export function createSwarmOrchestrator(
  config?: Partial<SwarmConfig>,
): SwarmOrchestrator {
  return new SwarmOrchestrator(config);
}

/**
 * Create a swarm with default AutoDev agents
 */
export function createDefaultSwarm(): SwarmOrchestrator {
  const orchestrator = new SwarmOrchestrator();
  orchestrator.registerAll(createDefaultSwarmAgents());
  return orchestrator;
}

/**
 * Create a minimal swarm for testing
 */
export function createMinimalSwarm(agents: SwarmAgent[]): SwarmOrchestrator {
  const orchestrator = new SwarmOrchestrator({
    maxIterations: 10,
    validateHandoffs: true,
  });
  orchestrator.registerAll(agents);
  return orchestrator;
}
