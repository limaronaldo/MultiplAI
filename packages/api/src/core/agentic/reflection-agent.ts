import { BaseAgent } from "../../agents/base";
import {
  ReflectionOutput,
  ReflectionOutputSchema,
  type ReflectionRootCause,
  type ReflectionRecommendation,
  type AttemptRecord,
} from "./types";

export interface ReflectionInput {
  originalIssue: string;
  plan: string[];
  diff: string;
  testOutput: string;
  attemptNumber: number;
  previousAttempts: AttemptRecord[];
}

// Default reflection model - DeepSeek Speciale for cheap reasoning
const DEFAULT_REFLECTION_MODEL =
  process.env.REFLECTION_MODEL || "deepseek/deepseek-r1-0528";

const SYSTEM_PROMPT = `You are an expert code analyst specializing in diagnosing test failures and code issues.

Your job is to:
1. Analyze why the tests failed
2. Identify the root cause (plan, code, test, or environment)
3. Recommend the next action (replan, fix, or abort)
4. Provide specific feedback for the fixer

## Root Cause Categories

- **plan**: The implementation approach is fundamentally flawed
- **code**: There are bugs in the implementation (typos, logic errors, missing imports)
- **test**: The test itself is incorrect or has wrong expectations
- **environment**: External issues (missing dependencies, config problems)

## Recommendations

- **replan**: The plan needs to change - current approach won't work
- **fix**: The code needs targeted fixes - approach is sound
- **abort**: Unrecoverable issue (e.g., impossible requirements, blocked by external factors)

## Confidence Score

Rate your confidence (0.0 to 1.0) in the diagnosis:
- 0.9-1.0: Very clear root cause, high certainty
- 0.7-0.9: Likely root cause, reasonable certainty
- 0.5-0.7: Possible root cause, some uncertainty
- Below 0.5: Unclear, multiple possible causes

## OUTPUT FORMAT - MANDATORY

Respond with ONLY a JSON object:

\`\`\`json
{
  "diagnosis": "Clear explanation of what went wrong",
  "rootCause": "plan" | "code" | "test" | "environment",
  "recommendation": "replan" | "fix" | "abort",
  "feedback": "Specific actionable feedback for the fixer or planner",
  "confidence": 0.0-1.0
}
\`\`\``;

export class ReflectionAgent extends BaseAgent<
  ReflectionInput,
  ReflectionOutput
> {
  constructor(modelOverride?: string) {
    super({
      model: modelOverride || DEFAULT_REFLECTION_MODEL,
      maxTokens: 2048,
      temperature: 0.1,
    });
  }

  async run(input: ReflectionInput): Promise<ReflectionOutput> {
    const previousAttemptsStr =
      input.previousAttempts.length > 0
        ? input.previousAttempts
            .map(
              (a) =>
                `- Attempt ${a.iteration}: ${a.action} → ${a.result}${a.error ? ` (${a.error.slice(0, 100)})` : ""}`,
            )
            .join("\n")
        : "No previous attempts";

    const userPrompt = `
## Original Issue
${input.originalIssue}

## Implementation Plan
${input.plan.map((p, i) => `${i + 1}. ${p}`).join("\n")}

## Current Diff
\`\`\`diff
${input.diff}
\`\`\`

## Test Output (Failed)
\`\`\`
${input.testOutput}
\`\`\`

## Attempt History
Current attempt: ${input.attemptNumber}
${previousAttemptsStr}

---

Analyze the failure and provide your diagnosis in JSON format.
`.trim();

    const response = await this.complete(SYSTEM_PROMPT, userPrompt);
    const parsed = this.parseJSON<ReflectionOutput>(response);

    return ReflectionOutputSchema.parse(parsed);
  }
}
