import { BaseAgent } from "./base";
import { FixerOutput, FixerOutputSchema } from "../core/types";

interface FixerInput {
  definitionOfDone: string[];
  plan: string[];
  currentDiff: string;
  errorLogs: string;
  fileContents: Record<string, string>;
}

// Default fixer model - Kimi K2 Thinking for tool-oriented debugging
// Cost: ~$0.10/task vs ~$0.30 with gpt-5.1-codex-max (67% savings)
const DEFAULT_FIXER_MODEL =
  process.env.FIXER_MODEL || "moonshotai/kimi-k2-thinking";

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
- The output diff must be complete (original changes + your fixes) and apply cleanly to the base branch; do NOT assume the repo already contains the diff.

## CRITICAL: CODE CONTENT RULES

**NEVER include diff markers inside the actual code content!**
The following patterns should ONLY appear in diff headers, NOT inside code:
- \`--- a/\` or \`+++ b/\` (file headers)
- \`@@\` (hunk headers)
- Lines starting with \`diff --git\`

If the code needs to work with diffs, use proper string escaping:
- Use \`"--- a/"\` as a string literal
- Build diff strings programmatically

Common error: "Contains git diff markers in content" means you put raw diff syntax inside code.

## OUTPUT FORMAT - MANDATORY

You MUST respond with ONLY a JSON object. No explanations, no prose, no markdown.
Even if the error logs are incomplete, you must still output valid JSON.
If you cannot determine the exact fix, make your best attempt based on the code structure.

\`\`\`json
{
  "diff": "complete unified diff with fixes",
  "commitMessage": "fix: description of what was fixed",
  "fixDescription": "explanation of what was wrong and how it was fixed",
  "filesModified": ["array of file paths touched"]
}
\`\`\`

IMPORTANT: Your entire response must be valid JSON wrapped in a code block. Never write prose before or after the JSON.`;

export class FixerAgent extends BaseAgent<FixerInput, FixerOutput> {
  constructor(modelOverride?: string) {
    // Kimi K2 Thinking - agentic reasoning for debugging with tool use
    // No reasoningEffort param needed - Kimi handles reasoning internally
    super({
      model: modelOverride || DEFAULT_FIXER_MODEL,
      maxTokens: 8192,
      temperature: 0.2,
    });
  }

  async run(input: FixerInput, modelOverride?: string): Promise<FixerOutput> {
    // Allow runtime model override for effort-based selection
    if (modelOverride) {
      this.config.model = modelOverride;
    }

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

## Current File Contents
Note: depending on execution mode, these contents may reflect the base branch *before* the diff above is applied. Use \`currentDiff\` as the source of truth for the intended changes, and output a single complete diff that reaches the fixed final state.
${fileContentsStr}

---

Analyze the error and generate a fixed diff in JSON format.
`.trim();

    const response = await this.complete(SYSTEM_PROMPT, userPrompt);
    const parsed = this.parseJSON<FixerOutput>(response);

    return FixerOutputSchema.parse(parsed);
  }
}
