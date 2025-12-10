import { BaseAgent } from "./base";
import { FixerOutput, FixerOutputSchema } from "../core/types";

interface FixerInput {
  definitionOfDone: string[];
  plan: string[];
  currentDiff: string;
  errorLogs: string;
  fileContents: Record<string, string>;
}

const SYSTEM_PROMPT = `You are an expert debugger fixing failing code.

Your job is to:
1. Analyze the error logs
2. Understand what went wrong
3. Fix the code while preserving the original intent
4. Generate a new unified diff with the fixes

CRITICAL RULES:
- Focus ONLY on fixing the reported errors
- Don't refactor or change unrelated code
- Keep the fix minimal
- Ensure the fix addresses the root cause
- Output valid unified diff format

Respond ONLY with valid JSON:
{
  "diff": "complete unified diff with fixes",
  "commitMessage": "fix: description of what was fixed",
  "fixDescription": "explanation of what was wrong and how it was fixed",
  "filesModified": ["array of file paths touched"]
}`;

export class FixerAgent extends BaseAgent<FixerInput, FixerOutput> {
  constructor() {
    // Kimi K2 Thinking via OpenRouter for performance testing
    super({
      model: "moonshotai/kimi-k2-thinking",
      maxTokens: 8192,
      temperature: 0.2,
    });
  }

  async run(input: FixerInput): Promise<FixerOutput> {
    const fileContentsStr = Object.entries(input.fileContents)
      .map(([path, content]) => `### ${path}\n\`\`\`\n${content}\n\`\`\``)
      .join("\n\n");

    const userPrompt = `
## Original Requirements

### Definition of Done
${input.definitionOfDone.map((d, i) => `${i + 1}. ${d}`).join("\n")}

### Plan
${input.plan.map((p, i) => `${i + 1}. ${p}`).join("\n")}

## Current Implementation (Diff Applied)
\`\`\`diff
${input.currentDiff}
\`\`\`

## Error Logs
\`\`\`
${input.errorLogs}
\`\`\`

## Current File Contents (After Diff)
${fileContentsStr}

---

Analyze the error and generate a fixed diff in JSON format.
`.trim();

    const response = await this.complete(SYSTEM_PROMPT, userPrompt);
    const parsed = this.parseJSON<FixerOutput>(response);

    return FixerOutputSchema.parse(parsed);
  }
}
