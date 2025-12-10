import { BaseAgent } from "./base";
import { CoderOutput, CoderOutputSchema } from "../core/types";

interface CoderInput {
  definitionOfDone: string[];
  plan: string[];
  targetFiles: string[];
  fileContents: Record<string, string>;
  previousDiff?: string;
  lastError?: string;
}

const SYSTEM_PROMPT = `You are an expert software engineer implementing a planned change.

Your job is to:
1. Follow the implementation plan exactly
2. Write clean, idiomatic code
3. Match the existing code style
4. Generate a unified diff (git diff format)

## CRITICAL DIFF FORMAT RULES

1. **File headers**: Always use exact paths
   \`\`\`
   --- a/src/file.rs
   +++ b/src/file.rs
   \`\`\`

2. **New files**: Use /dev/null as source
   \`\`\`
   --- /dev/null
   +++ b/src/new_file.rs
   @@ -0,0 +1,10 @@
   +line 1
   +line 2
   \`\`\`

3. **Hunk headers**: Must be accurate - @@ -oldStart,oldCount +newStart,newCount @@
   - oldStart: Line number in original file where change begins
   - oldCount: Number of lines from original (context + deleted)
   - newStart: Line number in new file where change begins
   - newCount: Number of lines in result (context + added)

4. **Line prefixes**: EXACTLY one character
   - " " (space) = context line (unchanged)
   - "+" = added line
   - "-" = removed line

5. **Context**: Include 3 lines of context before and after changes

## COMMON MISTAKES TO AVOID

- Do NOT duplicate existing code in the diff
- Do NOT include the same line as both context and added
- Do NOT forget to count lines correctly in @@ headers
- Do NOT mix up line numbers between hunks
- Do NOT add trailing whitespace

## EXAMPLE: Adding a function after existing code

Original file has function foo() at lines 1-5. Adding bar() after it:

\`\`\`diff
--- a/src/lib.rs
+++ b/src/lib.rs
@@ -3,4 +3,10 @@
     println!("foo");
 }

+pub fn bar() {
+    println!("bar");
+}
+
\`\`\`

Note: @@ -3,4 means "starting at line 3, showing 4 lines from original"
      +3,10 means "starting at line 3, result has 10 lines"

Respond ONLY with valid JSON:
{
  "diff": "unified diff string with proper format",
  "commitMessage": "conventional commit message (feat/fix/refactor: description)",
  "filesModified": ["array of file paths touched"],
  "notes": "optional implementation notes"
}`;

export class CoderAgent extends BaseAgent<CoderInput, CoderOutput> {
  constructor() {
    // Using GPT-4o via OpenAI for performance testing
    super({
      model: "gpt-4o",
      maxTokens: 8192,
      temperature: 0.2,
    });
  }

  async run(input: CoderInput): Promise<CoderOutput> {
    const fileContentsStr = Object.entries(input.fileContents)
      .map(([path, content]) => `### ${path}\n\`\`\`\n${content}\n\`\`\``)
      .join("\n\n");

    let userPrompt = `
## Definition of Done
${input.definitionOfDone.map((d, i) => `${i + 1}. ${d}`).join("\n")}

## Implementation Plan
${input.plan.map((p, i) => `${i + 1}. ${p}`).join("\n")}

## Target Files
${input.targetFiles.join(", ")}

## Current File Contents
${fileContentsStr}
`.trim();

    // Se há erro anterior, inclui contexto
    if (input.lastError && input.previousDiff) {
      userPrompt += `

## Previous Attempt Failed
The previous implementation had issues:

### Previous Diff
\`\`\`diff
${input.previousDiff}
\`\`\`

### Error
${input.lastError}

Please fix the issues while maintaining the original intent.`;
    }

    userPrompt +=
      "\n\n---\n\nGenerate the implementation as a unified diff in JSON format.";

    const response = await this.complete(SYSTEM_PROMPT, userPrompt);
    const parsed = this.parseJSON<CoderOutput>(response);

    return CoderOutputSchema.parse(parsed);
  }
}
