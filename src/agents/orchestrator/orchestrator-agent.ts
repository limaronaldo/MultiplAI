import { BaseAgent } from "../base";
import type { StaticMemory } from "../../core/memory/static-types";
import type { SessionMemory } from "../../core/memory/session-types";
import type { InitializerOutput } from "../initializer/types";
import {
  OrchestratorInput,
  OrchestratorOutput,
  OrchestratorOutputSchema,
  SubtaskDefinition,
  ExecutionPlan,
  AggregationStrategy,
  createSkipOutput,
  createOrchestratorOutput,
  validateSubtasks,
} from "./types";
import { breakdownIntoSubtasks } from "./breakdown";
import { buildExecutionPlan, visualizeExecutionPlan } from "./execution-plan";

const SYSTEM_PROMPT = `You are an Orchestrator Agent that breaks down complex issues into smaller subtasks.

Your job is to:
1. Analyze the issue complexity
2. Determine if orchestration is needed (M/L/XL complexity)
3. Break down into XS/S subtasks
4. Identify dependencies between subtasks
5. Create an execution plan

Key principle: "The agent is just a policy that transforms one consistent memory state into another."

You do NOT execute subtasks. You prepare the breakdown and plan.

Output ONLY valid JSON matching this schema:
{
  "shouldOrchestrate": boolean,
  "skipReason": "string (if not orchestrating)",
  "subtasks": [
    {
      "id": "subtask-1",
      "title": "Short title",
      "description": "What needs to be done",
      "targetFiles": ["src/..."],
      "dependencies": ["subtask-id"],
      "acceptanceCriteria": ["Criterion 1", ...],
      "estimatedComplexity": "XS" | "S",
      "estimatedLines": 50
    }
  ],
  "aggregationStrategy": "direct" | "sequential" | "parallel_merge",
  "confidence": 0.85,
  "notes": ["Note 1", ...]
}`;

const DEFAULT_MODEL =
  process.env.ORCHESTRATOR_MODEL ||
  process.env.DEFAULT_LLM_MODEL ||
  "claude-sonnet-4-5-20250929";

/**
 * OrchestratorAgent - Coordinates complex task breakdown
 *
 * Key principle: "The agent is just a policy that transforms
 * one consistent memory state into another."
 *
 * The Orchestrator:
 * 1. Reads parent session (already initialized)
 * 2. Determines if orchestration is needed
 * 3. Breaks down into subtasks
 * 4. Creates execution plan
 *
 * It does NOT execute subtasks - that's the Orchestrator's job
 * in the main processing loop.
 */
export class OrchestratorAgent extends BaseAgent<
  OrchestratorInput,
  OrchestratorOutput
> {
  constructor(modelOverride?: string) {
    super({
      model: modelOverride || DEFAULT_MODEL,
      maxTokens: 16384,
      temperature: 0.3,
    });
  }

  /**
   * Main entry point - analyze and break down complex tasks
   */
  async run(input: OrchestratorInput): Promise<OrchestratorOutput> {
    const { parentSession, staticMemory } = input;

    // Check if orchestration is needed based on complexity
    const complexity = parentSession.context.estimatedComplexity;

    if (!complexity || complexity === "XS" || complexity === "S") {
      return createSkipOutput(
        `Simple task (${complexity || "unknown"} complexity) - no orchestration needed`,
      );
    }

    // Get initializer output from session
    const initOutput = this.extractInitializerOutput(parentSession);

    if (!initOutput) {
      // No initializer output - use LLM to break down
      return this.llmBreakdown(input);
    }

    // Use algorithmic breakdown based on initializer output
    return this.algorithmicBreakdown(initOutput, staticMemory);
  }

  /**
   * Algorithmic breakdown using Initializer output
   * Preferred when we have structured plan data
   */
  private algorithmicBreakdown(
    initOutput: InitializerOutput,
    staticMemory: StaticMemory,
  ): OrchestratorOutput {
    // Break down into subtasks
    const subtasks = breakdownIntoSubtasks(initOutput, staticMemory);

    // Validate subtasks
    const validation = validateSubtasks(subtasks);
    if (!validation.valid) {
      console.warn(
        `[Orchestrator] Subtask validation warnings: ${validation.errors.join(", ")}`,
      );
    }

    // Build execution plan
    const executionPlan = buildExecutionPlan(subtasks);

    // Determine aggregation strategy
    const aggregationStrategy = this.determineAggregationStrategy(
      subtasks,
      executionPlan,
    );

    // Calculate confidence based on plan quality
    const confidence = this.calculateConfidence(subtasks, executionPlan);

    console.log(
      `[Orchestrator] ${visualizeExecutionPlan(executionPlan, subtasks)}`,
    );

    return createOrchestratorOutput(
      subtasks,
      executionPlan,
      aggregationStrategy,
      confidence,
    );
  }

  /**
   * LLM-based breakdown when we don't have structured data
   */
  private async llmBreakdown(
    input: OrchestratorInput,
  ): Promise<OrchestratorOutput> {
    const userPrompt = this.buildPrompt(input);
    const response = await this.complete(SYSTEM_PROMPT, userPrompt);
    const parsed = this.parseJSON<OrchestratorOutput>(response);

    // Validate with Zod
    const output = OrchestratorOutputSchema.parse(parsed);

    // Build execution plan if subtasks exist but no plan
    if (
      output.shouldOrchestrate &&
      output.subtasks.length > 0 &&
      !output.executionPlan
    ) {
      output.executionPlan = buildExecutionPlan(output.subtasks);
    }

    return output;
  }

  /**
   * Build prompt for LLM breakdown
   */
  private buildPrompt(input: OrchestratorInput): string {
    const { parentSession, staticMemory } = input;
    const { context } = parentSession;

    return `## Issue Analysis

**Title:** ${context.issueTitle}
**Number:** #${context.issueNumber}
**Estimated Complexity:** ${context.estimatedComplexity || "Unknown"}

### Issue Body
${context.issueBody}

### Target Files
${context.targetFiles?.join("\n") || "Not yet identified"}

### Definition of Done
${context.definitionOfDone?.map((d, i) => `${i + 1}. ${d}`).join("\n") || "Not yet defined"}

### Repository Constraints
- Allowed paths: ${staticMemory.constraints?.allowedPaths?.join(", ") || "any"}
- Max diff lines: ${staticMemory.constraints?.maxDiffLines || 300}

---

Analyze this issue and break it down into XS/S subtasks if the complexity warrants it.
Each subtask should be independently implementable with clear boundaries.`;
  }

  /**
   * Extract InitializerOutput from session if available
   */
  private extractInitializerOutput(
    session: SessionMemory,
  ): InitializerOutput | null {
    // Check if we have planner output that matches InitializerOutput
    const plannerOutput = session.outputs.planner;
    if (!plannerOutput) return null;

    // Build a minimal InitializerOutput from session data
    try {
      return {
        understanding: {
          intent: session.context.issueTitle,
          scope: "feature" as const,
          acceptanceCriteria: (session.context.definitionOfDone || []).map(
            (desc, i) => ({
              id: `ac-${i + 1}`,
              description: desc,
              testable: true,
              verificationMethod: "type_check" as const,
            }),
          ),
          constraints: [],
          ambiguities: [],
          outOfScope: [],
        },
        fileAnalysis: {
          targetFiles: (session.context.targetFiles || []).map((path) => ({
            path,
            exists: true,
            changeType: "modify" as const,
            reason: "Implementation required",
            sections: [],
          })),
          contextFiles: [],
          testFiles: [],
        },
        plan: {
          steps: plannerOutput.plan.map((step, i) => ({
            id: `step-${i + 1}`,
            action: step.action,
            targetFile: step.targetFile,
            changeType: step.changeType,
            description: step.description,
          })),
          complexity: plannerOutput.estimatedComplexity,
          estimatedTotalLines: 100,
        },
        risks: {
          overallRisk: "low" as const,
          factors: [],
          recommendations: [],
        },
        confidence: {
          overall: 0.8,
          understanding: 0.8,
          fileIdentification: 0.8,
          planQuality: 0.8,
          reasoning: "Derived from planner output",
        },
        definitionOfDone: session.context.definitionOfDone || [],
        targetFiles: session.context.targetFiles || [],
        shouldProceed: true,
        blockingReasons: [],
      };
    } catch {
      return null;
    }
  }

  /**
   * Determine aggregation strategy based on subtask structure
   */
  private determineAggregationStrategy(
    subtasks: SubtaskDefinition[],
    plan: ExecutionPlan,
  ): AggregationStrategy {
    // If all subtasks are independent, can merge in parallel
    const allIndependent = subtasks.every((s) => s.dependencies.length === 0);
    if (allIndependent) {
      return "parallel_merge";
    }

    // If there's a linear chain, sequential is safer
    if (plan.criticalPath.length === subtasks.length) {
      return "sequential";
    }

    // Default to sequential for safety
    return "sequential";
  }

  /**
   * Calculate confidence in the breakdown
   */
  private calculateConfidence(
    subtasks: SubtaskDefinition[],
    plan: ExecutionPlan,
  ): number {
    let confidence = 0.9;

    // Reduce confidence for many subtasks
    if (subtasks.length > 5) {
      confidence -= 0.1;
    }

    // Reduce confidence for deep dependency chains
    if (plan.criticalPath.length > 3) {
      confidence -= 0.1;
    }

    // Reduce confidence if any subtask is S (not XS)
    const hasSComplexity = subtasks.some((s) => s.estimatedComplexity === "S");
    if (hasSComplexity) {
      confidence -= 0.05;
    }

    return Math.max(0.5, confidence);
  }
}
