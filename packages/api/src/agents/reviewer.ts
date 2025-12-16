import { BaseAgent } from "./base";
import { ReviewerOutput, ReviewerOutputSchema } from "../core/types";
import { AgentTools } from "../core/tool-generator";
import { getModelForPositionSync } from "../core/model-selection";

// Default reviewer model - used if database config not available
const DEFAULT_REVIEWER_MODEL = "claude-sonnet-4-5-20250929";

// Get reviewer model from database config
function getReviewerModel(): string {
  return getModelForPositionSync("reviewer") || DEFAULT_REVIEWER_MODEL;
}

interface ReviewerInput {
  definitionOfDone: string[];
  plan: string[];
  diff: string;
  fileContents: Record<string, string>;
  testsPassed?: boolean; // Whether CI tests passed
}

const SYSTEM_PROMPT = `You are a pragmatic senior engineer conducting a code review.

## Your Primary Goal
APPROVE code that meets the Definition of Done and has no critical issues.

## Important Guidelines
- **Be pragmatic, not perfectionist.** Minor style preferences are NOT blockers.
- **Tests passing is strong signal.** If tests pass, the code likely works.
- **Focus on the DoD.** If all DoD items are met, lean towards APPROVE.
- **Only block for real issues:** bugs, security vulnerabilities, or missing DoD items.

## What is NOT a valid reason to REQUEST_CHANGES:
- Minor style preferences (quotes, spacing, naming conventions)
- Missing optional features not in the DoD
- "Could be better" suggestions without actual bugs
- Hypothetical edge cases not mentioned in requirements
- Missing comments or documentation (unless in DoD)

## What IS a valid reason to REQUEST_CHANGES:
- Code doesn't compile or has syntax errors
- Logic bugs that would cause incorrect behavior
- Security vulnerabilities (SQL injection, XSS, etc.)
- DoD items that are clearly not met
- Runtime errors or crashes

## Verdict Decision Tree:
1. Do all DoD items appear to be met? If NO → REQUEST_CHANGES
2. Are there any critical bugs or security issues? If YES → REQUEST_CHANGES
3. Otherwise → APPROVE (even if minor improvements are possible)

Respond ONLY with valid JSON:
{
  "verdict": "APPROVE" | "REQUEST_CHANGES" | "NEEDS_DISCUSSION",
  "summary": "brief overall assessment",
  "dodVerification": [
    { "item": "DoD item text", "met": true/false, "evidence": "how it's met" }
  ],
  "comments": [
    {
      "file": "path/to/file",
      "line": 42,
      "severity": "critical" | "major" | "minor" | "suggestion",
      "comment": "description of the issue"
    }
  ],
  "suggestedChanges": ["only include if REQUEST_CHANGES"]
}`;

export class ReviewerAgent extends BaseAgent<ReviewerInput, ReviewerOutput> {
  constructor() {
    // Model is set at runtime in run() to use database config
    // Increased maxTokens from 2048 to 4096 to prevent truncation of detailed reviews
    super({
      model: DEFAULT_REVIEWER_MODEL, // Placeholder, updated in run()
      temperature: 0.1,
      maxTokens: 4096,
    });
  }

  async run(input: ReviewerInput): Promise<ReviewerOutput> {
    // Get model from database config at runtime
    const model = getReviewerModel();
    this.config.model = model;
    console.log(`[Reviewer] Using model: ${model}`);
    const fileContentsStr = Object.entries(input.fileContents)
      .map(([path, content]) => `### ${path}\n\`\`\`\n${content}\n\`\`\``)
      .join("\n\n");

    const testStatus = input.testsPassed
      ? "✅ CI TESTS PASSED - This is strong evidence the code works correctly."
      : "⚠️ Tests status unknown - verify carefully.";

    const userPrompt = `
## Test Status
${testStatus}

## Definition of Done (Checklist)
${input.definitionOfDone.map((d, i) => `${i + 1}. ${d}`).join("\n")}

## Implementation Plan
${input.plan.map((p, i) => `${i + 1}. ${p}`).join("\n")}

## Changes (Diff)
\`\`\`diff
${input.diff}
\`\`\`

## Resulting File Contents
${fileContentsStr}

---

Review this implementation. Remember:
- Tests passed means the code likely works
- APPROVE if DoD is met, even if minor improvements are possible
- Only REQUEST_CHANGES for real bugs or missing DoD items
`.trim();

    // Use structured output with tool calls - guarantees valid JSON
    const result = await this.completeStructured<ReviewerOutput>(
      SYSTEM_PROMPT,
      userPrompt,
      AgentTools.reviewerOutput,
    );

    console.log(
      `[Reviewer] Structured output verdict: ${result.verdict}, comments: ${result.comments?.length || 0}`,
    );

    if (result.verdict === "REQUEST_CHANGES" && input.testsPassed) {
      const hasCriticalIssues = result.comments?.some(
        (c) => c.severity === "critical",
      );

      if (!hasCriticalIssues) {
        console.log(
          "[Reviewer] Downgrading REQUEST_CHANGES to APPROVE: tests passed, no critical issues",
        );
        result.verdict = "APPROVE";
        result.summary = `${result.summary} (Auto-approved: tests passed, issues are minor)`;
      }
    }

    return result;
  }
}
