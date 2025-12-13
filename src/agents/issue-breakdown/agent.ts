/**
 * IssueBreakdownAgent
 *
 * Core agent that breaks M/L/XL issues into XS subtasks.
 * Uses LLM to analyze issue requirements and generate a breakdown plan.
 */

import { BaseAgent } from "../base";
import type {
  BreakdownInput,
  BreakdownOutput,
  XSIssueDefinition,
  ComplexityLevel,
} from "./types";
import {
  BreakdownOutputSchema,
  createNoBreakdownOutput,
  createBreakdownOutput,
} from "./types";
import { analyzeAllBoundaries } from "./boundary-detection";
import { chunkPlanItems, chunksToIssues, smartChunk } from "./chunking";
import {
  buildDependencyGraph,
  generateExecutionPlan,
  hasCycles,
  topologicalSort,
} from "./dependency-graph";
import type { PlanItem } from "./chunking";

// =============================================================================
// CONFIGURATION
// =============================================================================

const DEFAULT_BREAKDOWN_MODEL =
  process.env.BREAKDOWN_MODEL ||
  process.env.DEFAULT_LLM_MODEL ||
  "claude-sonnet-4-5-20250929";

const COMPLEXITY_THRESHOLD: ComplexityLevel[] = ["M", "L", "XL"];

// =============================================================================
// SYSTEM PROMPT
// =============================================================================

const SYSTEM_PROMPT = `You are a senior software architect specializing in breaking down complex tasks.

Your job is to analyze a GitHub issue and break it down into XS-sized subtasks that can be implemented independently by an AI coding agent.

RULES FOR XS SUBTASKS:
1. Each subtask should modify AT MOST 2 files
2. Each subtask should add/change AT MOST 50 lines of code
3. Each subtask should be completable WITHOUT context from other subtasks
4. Each subtask should have clear, testable acceptance criteria
5. Subtasks should be ordered by dependency (earlier tasks don't depend on later ones)

CHANGE TYPES:
- "create": New file that doesn't exist
- "modify": Change to existing file (be specific about what to change)
- "delete": Remove file or code

FOR EACH SUBTASK, SPECIFY:
- action: What needs to be done (short description)
- targetFile: The file path to create/modify/delete
- changeType: "create" | "modify" | "delete"
- description: Detailed description of what to implement
- estimatedLines: Approximate lines of code
- dependencies: Array of file paths this change depends on

OUTPUT FORMAT:
Respond with valid JSON matching this schema:
{
  "shouldBreakdown": true,
  "planItems": [
    {
      "action": "Create types file",
      "targetFile": "src/types.ts",
      "changeType": "create",
      "description": "Define TypeScript interfaces for...",
      "estimatedLines": 30,
      "dependencies": []
    }
  ],
  "originalComplexity": "M" | "L" | "XL",
  "reasoning": "Brief explanation of the breakdown strategy"
}

If the issue is already XS or S sized, respond with:
{
  "shouldBreakdown": false,
  "skipReason": "Issue is already small enough to implement directly",
  "originalComplexity": "XS" | "S"
}`;

// =============================================================================
// AGENT IMPLEMENTATION
// =============================================================================

interface LLMBreakdownResponse {
  shouldBreakdown: boolean;
  skipReason?: string;
  planItems?: Array<{
    action: string;
    targetFile: string;
    changeType: "create" | "modify" | "delete";
    description: string;
    estimatedLines?: number;
    dependencies?: string[];
  }>;
  originalComplexity: ComplexityLevel;
  reasoning?: string;
}

export class IssueBreakdownAgent extends BaseAgent<
  BreakdownInput,
  BreakdownOutput
> {
  constructor() {
    super({
      model: DEFAULT_BREAKDOWN_MODEL,
      temperature: 0.3,
      maxTokens: 16384,
    });
  }

  async run(input: BreakdownInput): Promise<BreakdownOutput> {
    // Check if already estimated as small
    if (
      input.estimatedComplexity &&
      !COMPLEXITY_THRESHOLD.includes(input.estimatedComplexity)
    ) {
      return createNoBreakdownOutput(
        `Issue complexity is ${input.estimatedComplexity}, no breakdown needed`,
      );
    }

    // If we have an existing plan, use it directly
    if (input.existingPlan && input.existingPlan.length > 0) {
      return this.breakdownFromExistingPlan(input);
    }

    // Otherwise, ask LLM to analyze and break down
    return this.breakdownWithLLM(input);
  }

  private async breakdownWithLLM(
    input: BreakdownInput,
  ): Promise<BreakdownOutput> {
    const userPrompt = `
## Issue #${input.issueNumber}: ${input.issueTitle}

## Description
${input.issueBody || "No description provided"}

## Repository
${input.repoFullName}

---

Analyze this issue and provide a breakdown plan. If the issue is small enough (XS or S), indicate that no breakdown is needed.
`.trim();

    const response = await this.complete(SYSTEM_PROMPT, userPrompt);
    const parsed = this.parseJSON<LLMBreakdownResponse>(response);

    if (!parsed.shouldBreakdown) {
      return createNoBreakdownOutput(
        parsed.skipReason || "Issue is small enough",
      );
    }

    if (!parsed.planItems || parsed.planItems.length === 0) {
      return createNoBreakdownOutput("LLM could not generate a breakdown plan");
    }

    // Convert LLM response to our internal format
    const planItems: PlanItem[] = parsed.planItems.map((item) => ({
      action: item.action,
      targetFile: item.targetFile,
      changeType: item.changeType,
      description: item.description,
      estimatedLines: item.estimatedLines || 30,
      dependencies: item.dependencies || [],
    }));

    return this.processBreakdown(
      planItems,
      input.issueNumber,
      input.issueTitle,
      parsed.originalComplexity,
    );
  }

  private breakdownFromExistingPlan(input: BreakdownInput): BreakdownOutput {
    if (!input.existingPlan) {
      return createNoBreakdownOutput("No existing plan provided");
    }

    const planItems: PlanItem[] = input.existingPlan.map((item) => ({
      action: item.action,
      targetFile: item.targetFile,
      changeType: item.changeType as "create" | "modify" | "delete",
      description: item.description,
      estimatedLines: 30,
      dependencies: [],
    }));

    return this.processBreakdown(
      planItems,
      input.issueNumber,
      input.issueTitle,
      input.estimatedComplexity || "M",
    );
  }

  private processBreakdown(
    planItems: PlanItem[],
    issueNumber: number,
    issueTitle: string,
    originalComplexity: ComplexityLevel,
  ): BreakdownOutput {
    // Chunk the plan items into XS-sized groups
    const chunks = chunkPlanItems(planItems);

    // Build dependency graph
    const depGraph = buildDependencyGraph(chunks);

    // Check for cycles
    if (hasCycles(depGraph)) {
      // Try to resolve by reordering
      const sorted = topologicalSort(depGraph);
      if (!sorted) {
        return createNoBreakdownOutput(
          "Circular dependency detected in breakdown plan",
        );
      }
    }

    // Generate execution plan
    const executionPlan = generateExecutionPlan(depGraph);

    // Convert chunks to XS issue definitions
    const issues = chunksToIssues(chunks, issueNumber, issueTitle);

    return createBreakdownOutput(
      issues,
      depGraph,
      originalComplexity,
      executionPlan,
    );
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Create a breakdown agent and run it on an issue
 */
export async function breakdownIssue(
  input: BreakdownInput,
): Promise<BreakdownOutput> {
  const agent = new IssueBreakdownAgent();
  return agent.run(input);
}

/**
 * Check if an issue should be broken down based on complexity
 */
export function shouldBreakdown(complexity: ComplexityLevel): boolean {
  return COMPLEXITY_THRESHOLD.includes(complexity);
}
