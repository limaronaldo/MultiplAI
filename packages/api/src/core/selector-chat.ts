/**
 * SelectorGroupChat - Dynamic Speaker Selection
 *
 * Implements LLM-based agent routing where an LLM decides which agent
 * should handle the next step based on context and agent capabilities.
 *
 * Benefits:
 * - Intelligent routing based on task requirements
 * - Flexible: works with any agent type
 * - Context-aware: considers conversation history
 * - Filterable: can exclude/include specific agents
 *
 * @see https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/selector-group-chat.html
 */

import { LLMClient } from "../integrations/llm";
import { db } from "../integrations/db";
import type { Task, TaskStatus } from "./types";

// ============================================
// Types
// ============================================

export interface AgentDescription {
  /** Unique agent identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** What this agent does */
  description: string;
  /** What tasks this agent handles */
  capabilities: string[];
  /** When this agent should be selected */
  triggers?: string[];
  /** Agent priority (higher = preferred) */
  priority?: number;
}

export interface SelectionContext {
  /** Current task */
  task: Task;
  /** Recent messages/events */
  recentHistory: HistoryItem[];
  /** Current phase */
  currentPhase: string;
  /** Last agent that ran */
  lastAgent?: string;
  /** Agents to exclude from selection */
  excludeAgents?: string[];
  /** Additional context */
  metadata?: Record<string, unknown>;
}

export interface HistoryItem {
  agent: string;
  action: string;
  result?: string;
  timestamp: Date;
}

export interface SelectionResult {
  /** Selected agent ID */
  agentId: string;
  /** Confidence in selection (0-1) */
  confidence: number;
  /** Reasoning for selection */
  reasoning: string;
  /** Suggested input for the agent */
  suggestedInput?: Record<string, unknown>;
}

export interface SelectorConfig {
  /** Model to use for selection */
  model: string;
  /** Available agents */
  agents: AgentDescription[];
  /** Maximum history items to include */
  maxHistoryItems: number;
  /** Minimum confidence threshold */
  minConfidence: number;
  /** Allow same agent twice in a row */
  allowRepeat: boolean;
  /** Temperature for selection */
  temperature: number;
}

// ============================================
// Default Agent Descriptions
// ============================================

export const COMMON_AGENT_DESCRIPTIONS: AgentDescription[] = [
  {
    id: "planner",
    name: "PlannerAgent",
    description:
      "Analyzes issues and creates implementation plans with Definition of Done",
    capabilities: [
      "issue analysis",
      "complexity estimation",
      "implementation planning",
      "file identification",
    ],
    triggers: ["new task", "replanning needed", "scope change"],
    priority: 10,
  },
  {
    id: "coder",
    name: "CoderAgent",
    description: "Generates code changes as unified diffs based on plans",
    capabilities: [
      "code generation",
      "diff creation",
      "implementing features",
      "bug fixes",
    ],
    triggers: ["plan ready", "implementation needed", "code changes required"],
    priority: 8,
  },
  {
    id: "fixer",
    name: "FixerAgent",
    description: "Fixes code based on test failures and error messages",
    capabilities: [
      "error analysis",
      "bug fixing",
      "test failure resolution",
      "syntax error correction",
    ],
    triggers: ["test failed", "error occurred", "fix needed"],
    priority: 9,
  },
  {
    id: "reviewer",
    name: "ReviewerAgent",
    description:
      "Reviews code changes for quality, correctness, and best practices",
    capabilities: [
      "code review",
      "quality assessment",
      "best practices check",
      "security review",
    ],
    triggers: ["code ready for review", "tests passed", "pr preparation"],
    priority: 7,
  },
  {
    id: "breakdown",
    name: "BreakdownAgent",
    description: "Breaks down complex tasks into smaller subtasks",
    capabilities: [
      "task decomposition",
      "subtask creation",
      "dependency analysis",
    ],
    triggers: ["complex task", "large scope", "needs breakdown"],
    priority: 6,
  },
];

// ============================================
// Default Configuration
// ============================================

export const DEFAULT_SELECTOR_CONFIG: SelectorConfig = {
  model: "deepseek/deepseek-chat",
  agents: COMMON_AGENT_DESCRIPTIONS,
  maxHistoryItems: 10,
  minConfidence: 0.6,
  allowRepeat: false,
  temperature: 0.3,
};

// ============================================
// SelectorGroupChat Class
// ============================================

export class SelectorGroupChat {
  private llm: LLMClient;
  private config: SelectorConfig;

  constructor(config: Partial<SelectorConfig> = {}) {
    this.llm = new LLMClient();
    this.config = { ...DEFAULT_SELECTOR_CONFIG, ...config };
  }

  /**
   * Select the next agent to run
   */
  async selectNextSpeaker(context: SelectionContext): Promise<SelectionResult> {
    // Filter available agents
    const availableAgents = this.filterAgents(context);

    if (availableAgents.length === 0) {
      throw new Error("No available agents after filtering");
    }

    if (availableAgents.length === 1) {
      return {
        agentId: availableAgents[0].id,
        confidence: 1.0,
        reasoning: "Only one agent available",
      };
    }

    // Use LLM to select
    const selection = await this.llmSelect(context, availableAgents);

    // Validate selection
    if (selection.confidence < this.config.minConfidence) {
      // Fall back to priority-based selection
      const fallback = this.prioritySelect(availableAgents, context);
      return {
        ...fallback,
        reasoning: `Low confidence (${selection.confidence.toFixed(2)}), using priority fallback: ${fallback.reasoning}`,
      };
    }

    return selection;
  }

  /**
   * Run a full group chat session
   */
  async run(task: Task, maxTurns = 10): Promise<TaskResult> {
    const history: HistoryItem[] = [];
    let currentPhase = "start";
    let lastAgent: string | undefined;

    for (let turn = 0; turn < maxTurns; turn++) {
      // Build context
      const context: SelectionContext = {
        task,
        recentHistory: history.slice(-this.config.maxHistoryItems),
        currentPhase,
        lastAgent,
      };

      // Select next speaker
      const selection = await this.selectNextSpeaker(context);

      // Record selection event
      await db.createTaskEvent({
        taskId: task.id,
        eventType: "AGENT_SELECTED",
        metadata: {
          agentId: selection.agentId,
          confidence: selection.confidence,
          reasoning: selection.reasoning,
          turn,
        },
      });

      // Run the selected agent (this would integrate with actual agent execution)
      const result = await this.runAgent(selection.agentId, task, context);

      // Add to history
      history.push({
        agent: selection.agentId,
        action: result.action,
        result: result.summary,
        timestamp: new Date(),
      });

      // Update phase based on result
      currentPhase = result.nextPhase || currentPhase;
      lastAgent = selection.agentId;

      // Check for termination
      if (result.isTerminal) {
        return {
          success: result.success,
          finalAgent: selection.agentId,
          turns: turn + 1,
          history,
        };
      }
    }

    return {
      success: false,
      finalAgent: lastAgent,
      turns: maxTurns,
      history,
      error: "Max turns reached",
    };
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Filter agents based on context
   */
  private filterAgents(context: SelectionContext): AgentDescription[] {
    let agents = [...this.config.agents];

    // Remove excluded agents
    if (context.excludeAgents?.length) {
      agents = agents.filter((a) => !context.excludeAgents!.includes(a.id));
    }

    // Remove last agent if repeat not allowed
    if (!this.config.allowRepeat && context.lastAgent) {
      agents = agents.filter((a) => a.id !== context.lastAgent);
    }

    return agents;
  }

  /**
   * Use LLM to select next agent
   */
  private async llmSelect(
    context: SelectionContext,
    agents: AgentDescription[],
  ): Promise<SelectionResult> {
    const systemPrompt = `You are an agent selector for an autonomous coding system.
Your job is to select the most appropriate agent to handle the next step.

Available agents:
${agents
  .map(
    (a) => `- ${a.id} (${a.name}): ${a.description}
  Capabilities: ${a.capabilities.join(", ")}
  Triggers: ${a.triggers?.join(", ") || "any"}`,
  )
  .join("\n\n")}

Respond in JSON format:
{
  "agentId": "selected agent id",
  "confidence": 0.0-1.0,
  "reasoning": "why this agent was selected",
  "suggestedInput": { optional input hints }
}`;

    const userPrompt = `## Task
${context.task.githubIssueTitle}

Status: ${context.task.status}
Current Phase: ${context.currentPhase}
${context.lastAgent ? `Last Agent: ${context.lastAgent}` : ""}

## Recent History
${
  context.recentHistory.length > 0
    ? context.recentHistory
        .map(
          (h) => `- ${h.agent}: ${h.action}${h.result ? ` → ${h.result}` : ""}`,
        )
        .join("\n")
    : "No history yet"
}

## Task Details
${context.task.githubIssueBody?.slice(0, 500) || "No description"}

Select the next agent to handle this task.`;

    try {
      const response = await this.llm.complete({
        model: this.config.model,
        maxTokens: 1024,
        temperature: this.config.temperature,
        systemPrompt,
        userPrompt,
      });

      const parsed = this.parseSelection(response, agents);
      return parsed;
    } catch (error) {
      // Fallback to priority selection
      return this.prioritySelect(agents, context);
    }
  }

  /**
   * Priority-based selection fallback
   */
  private prioritySelect(
    agents: AgentDescription[],
    context: SelectionContext,
  ): SelectionResult {
    // Sort by priority (higher first)
    const sorted = [...agents].sort(
      (a, b) => (b.priority || 0) - (a.priority || 0),
    );

    // Check triggers
    for (const agent of sorted) {
      if (agent.triggers?.some((t) => this.matchesTrigger(t, context))) {
        return {
          agentId: agent.id,
          confidence: 0.8,
          reasoning: `Matched trigger for ${agent.name}`,
        };
      }
    }

    // Default to highest priority
    return {
      agentId: sorted[0].id,
      confidence: 0.5,
      reasoning: `Default selection: highest priority agent (${sorted[0].name})`,
    };
  }

  /**
   * Check if trigger matches context
   */
  private matchesTrigger(trigger: string, context: SelectionContext): boolean {
    const status = context.task.status.toLowerCase();
    const phase = context.currentPhase.toLowerCase();
    const t = trigger.toLowerCase();

    // Simple keyword matching
    return status.includes(t) || phase.includes(t) || t.includes(status);
  }

  /**
   * Parse LLM selection response
   */
  private parseSelection(
    response: string,
    agents: AgentDescription[],
  ): SelectionResult {
    try {
      // Extract JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate agent ID
      const validAgent = agents.find((a) => a.id === parsed.agentId);
      if (!validAgent) {
        throw new Error(`Invalid agent: ${parsed.agentId}`);
      }

      return {
        agentId: parsed.agentId,
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
        reasoning: parsed.reasoning || "No reasoning provided",
        suggestedInput: parsed.suggestedInput,
      };
    } catch {
      // Return first agent as fallback
      return {
        agentId: agents[0].id,
        confidence: 0.3,
        reasoning: "Failed to parse selection, using fallback",
      };
    }
  }

  /**
   * Run a selected agent (placeholder - integrate with actual agents)
   */
  private async runAgent(
    agentId: string,
    task: Task,
    _context: SelectionContext,
  ): Promise<AgentRunResult> {
    // This would integrate with actual agent execution
    // For now, return placeholder based on task status
    const statusToPhase: Record<
      string,
      { action: string; nextPhase: string; isTerminal?: boolean }
    > = {
      NEW: { action: "analyzed task", nextPhase: "planning" },
      PLANNING: { action: "created plan", nextPhase: "coding" },
      PLANNING_DONE: { action: "verified plan", nextPhase: "coding" },
      CODING: { action: "generated code", nextPhase: "testing" },
      CODING_DONE: { action: "completed coding", nextPhase: "testing" },
      TESTS_PASSED: { action: "verified tests", nextPhase: "reviewing" },
      TESTS_FAILED: { action: "identified failures", nextPhase: "fixing" },
      REVIEW_APPROVED: {
        action: "approved code",
        nextPhase: "done",
        isTerminal: true,
      },
      COMPLETED: { action: "completed", nextPhase: "done", isTerminal: true },
      FAILED: { action: "failed", nextPhase: "failed", isTerminal: true },
    };

    const result = statusToPhase[task.status] || {
      action: "processed",
      nextPhase: "unknown",
    };

    return {
      action: result.action,
      summary: `${agentId} ${result.action}`,
      nextPhase: result.nextPhase,
      isTerminal: result.isTerminal || false,
      success: !["FAILED"].includes(task.status),
    };
  }
}

// ============================================
// Result Types
// ============================================

interface AgentRunResult {
  action: string;
  summary: string;
  nextPhase?: string;
  isTerminal: boolean;
  success: boolean;
}

interface TaskResult {
  success: boolean;
  finalAgent?: string;
  turns: number;
  history: HistoryItem[];
  error?: string;
}

// ============================================
// Factory Functions
// ============================================

export function createSelectorGroupChat(
  config?: Partial<SelectorConfig>,
): SelectorGroupChat {
  return new SelectorGroupChat(config);
}

/**
 * Create selector with custom agents
 */
export function createCustomSelector(
  agents: AgentDescription[],
  model?: string,
): SelectorGroupChat {
  return new SelectorGroupChat({
    agents,
    model: model || DEFAULT_SELECTOR_CONFIG.model,
  });
}

/**
 * Add an agent description to the common list
 */
export function registerAgent(agent: AgentDescription): void {
  COMMON_AGENT_DESCRIPTIONS.push(agent);
}
