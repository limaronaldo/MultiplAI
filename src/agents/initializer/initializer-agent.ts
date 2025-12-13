import { BaseAgent } from "../base";
import {
  InitializerInput,
  InitializerOutput,
  InitializerOutputSchema,
} from "./types";

const SYSTEM_PROMPT = `You are an Initializer Agent that analyzes GitHub issues and prepares structured context for coding agents.

Your job is to:
1. Understand the issue intent and scope
2. Extract clear acceptance criteria
3. Identify target files to modify
4. Create an execution plan
5. Assess risks and confidence

Key principle: "The initializer is the stage manager. It builds the set, places the props, writes the checklist for the play."

You do NOT write code. You prepare everything the coder needs to succeed.

Output ONLY valid JSON matching this schema:
{
  "understanding": {
    "intent": "One sentence describing what needs to be done",
    "scope": "feature" | "bugfix" | "refactor" | "docs" | "test" | "chore",
    "acceptanceCriteria": [
      { "id": "ac-1", "description": "...", "testable": true, "verificationMethod": "unit_test" | "integration_test" | "manual" | "type_check" | "lint" }
    ],
    "constraints": ["Constraint 1", ...],
    "ambiguities": [
      { "id": "amb-1", "description": "...", "possibleInterpretations": ["...", "..."], "blocking": false }
    ],
    "outOfScope": ["What this issue does NOT cover"]
  },
  "fileAnalysis": {
    "targetFiles": [
      { "path": "src/...", "exists": true, "changeType": "modify" | "create" | "delete", "reason": "...", "sections": ["functionName"], "estimatedLines": 20 }
    ],
    "contextFiles": ["Files to read for context"],
    "testFiles": ["Test files to update"]
  },
  "plan": {
    "steps": [
      { "id": "step-1", "action": "...", "targetFile": "src/...", "changeType": "modify", "description": "..." }
    ],
    "complexity": "XS" | "S" | "M" | "L" | "XL",
    "estimatedTotalLines": 50
  },
  "risks": {
    "overallRisk": "low" | "medium" | "high",
    "factors": [
      { "id": "risk-1", "category": "breaking_change" | "security" | "performance" | "complexity" | "testing", "description": "...", "severity": "low" | "medium" | "high", "mitigation": "..." }
    ],
    "recommendations": ["Recommendation 1", ...]
  },
  "confidence": {
    "overall": 0.85,
    "understanding": 0.9,
    "fileIdentification": 0.8,
    "planQuality": 0.85,
    "reasoning": "Why this confidence level"
  },
  "definitionOfDone": ["DoD item 1", "DoD item 2", ...],
  "targetFiles": ["src/file1.ts", "src/file2.ts"],
  "shouldProceed": true,
  "blockingReasons": []
}

Rules:
- Keep complexity estimates conservative (prefer XS/S)
- Flag any ambiguities that could lead to wrong implementation
- Set shouldProceed=false if complexity is L/XL or blocking ambiguities exist
- definitionOfDone should be derived from acceptanceCriteria
- targetFiles should be the paths from fileAnalysis.targetFiles`;

const DEFAULT_MODEL =
  process.env.INITIALIZER_MODEL ||
  process.env.DEFAULT_LLM_MODEL ||
  "claude-sonnet-4-5-20250929";

/**
 * InitializerAgent - Bootstraps session memory from issue
 *
 * Key principle: "The initializer is the stage manager. It builds the set,
 * places the props, writes the checklist for the play."
 *
 * The Initializer does NOT need memory - it transforms the prompt
 * into artifacts that serve as scaffolding for the coding agent.
 */
export class InitializerAgent extends BaseAgent<
  InitializerInput,
  InitializerOutput
> {
  constructor(modelOverride?: string) {
    super({
      model: modelOverride || DEFAULT_MODEL,
      maxTokens: 16384,
      temperature: 0.3,
    });
  }

  /**
   * Main entry point - analyze issue and produce structured output
   */
  async run(input: InitializerInput): Promise<InitializerOutput> {
    const userPrompt = this.buildPrompt(input);
    const response = await this.complete(SYSTEM_PROMPT, userPrompt);
    const parsed = this.parseJSON<InitializerOutput>(response);

    // Validate and enrich
    const output = InitializerOutputSchema.parse(parsed);

    // Post-process: ensure consistency
    return this.postProcess(output);
  }

  /**
   * Build the user prompt from input
   */
  private buildPrompt(input: InitializerInput): string {
    let prompt = `## Issue #${input.issue.number}: ${input.issue.title}

### Description
${input.issue.body || "No description provided."}

### Labels
${input.issue.labels.length > 0 ? input.issue.labels.join(", ") : "None"}
`;

    if (input.repoContext) {
      prompt += `
### Repository Context
${input.repoContext}
`;
    }

    prompt += `
---

Analyze this issue and provide the structured initialization output.`;

    return prompt;
  }

  /**
   * Post-process the output to ensure consistency
   */
  private postProcess(output: InitializerOutput): InitializerOutput {
    // Ensure definitionOfDone matches acceptance criteria if empty
    if (output.definitionOfDone.length === 0) {
      output.definitionOfDone = output.understanding.acceptanceCriteria.map(
        (ac) => ac.description,
      );
    }

    // Ensure targetFiles matches fileAnalysis if empty
    if (output.targetFiles.length === 0) {
      output.targetFiles = output.fileAnalysis.targetFiles.map((f) => f.path);
    }

    // Check blocking conditions
    const blockingReasons: string[] = [];

    // Complexity check
    if (output.plan.complexity === "L" || output.plan.complexity === "XL") {
      blockingReasons.push(`Complexity too high: ${output.plan.complexity}`);
    }

    // Blocking ambiguities
    const blockingAmbiguities = output.understanding.ambiguities.filter(
      (a) => a.blocking,
    );
    if (blockingAmbiguities.length > 0) {
      blockingReasons.push(
        `Blocking ambiguities: ${blockingAmbiguities.map((a) => a.description).join("; ")}`,
      );
    }

    // High risk with no mitigation
    const unmitigatedHighRisks = output.risks.factors.filter(
      (r) => r.severity === "high" && !r.mitigation,
    );
    if (unmitigatedHighRisks.length > 0) {
      blockingReasons.push(
        `High risks without mitigation: ${unmitigatedHighRisks.map((r) => r.description).join("; ")}`,
      );
    }

    // Low confidence
    if (output.confidence.overall < 0.5) {
      blockingReasons.push(`Low confidence: ${output.confidence.overall}`);
    }

    output.blockingReasons = blockingReasons;
    output.shouldProceed = blockingReasons.length === 0;

    return output;
  }
}
