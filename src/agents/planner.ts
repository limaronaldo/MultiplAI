import { BaseAgent } from "./base";
import { PlannerOutput, PlannerOutputSchema } from "../core/types";

interface PlannerInput {
  issueTitle: string;
  issueBody: string;
  repoContext: string;
}

const SYSTEM_PROMPT = `You are a senior tech lead planning the implementation of a GitHub issue.

Your job is to:
1. Understand the issue requirements
2. Define clear, testable acceptance criteria (Definition of Done)
3. Create a step-by-step implementation plan
4. Identify which files need to be modified or created
5. Estimate complexity

IMPORTANT RULES:
- Keep the scope small and focused
- Each DoD item must be verifiable
- Plan should be sequential and logical
- Only include files that NEED to change
- Be conservative with complexity estimates

Respond ONLY with valid JSON matching this schema:
{
  "definitionOfDone": ["string array of acceptance criteria"],
  "plan": ["string array of implementation steps"],
  "targetFiles": ["string array of file paths"],
  "estimatedComplexity": "XS" | "S" | "M" | "L" | "XL",
  "risks": ["optional array of potential issues"]
}

Complexity guide:
- XS: < 20 lines, single file, trivial change
- S: < 50 lines, 1-2 files, straightforward
- M: < 150 lines, 2-4 files, some logic
- L: > 150 lines, multiple files, complex logic
- XL: Major feature, architectural changes`;

export class PlannerAgent extends BaseAgent<PlannerInput, PlannerOutput> {
  async run(input: PlannerInput): Promise<PlannerOutput> {
    const userPrompt = `
## Issue Title
${input.issueTitle}

## Issue Description
${input.issueBody || "No description provided"}

## Repository Context
${input.repoContext}

---

Analyze this issue and provide your implementation plan as JSON.
`.trim();

    const response = await this.complete(SYSTEM_PROMPT, userPrompt);
    const parsed = this.parseJSON<PlannerOutput>(response);

    // Validate with Zod
    return PlannerOutputSchema.parse(parsed);
  }
}
