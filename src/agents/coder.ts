import { BaseAgent } from "./base";
import {
  CoderOutput,
  CoderOutputSchema,
  type MultiFilePlan,
  type SharedType,
} from "../core/types";

interface CoderInput {
  definitionOfDone: string[];
  plan: string[];
  targetFiles: string[];
  fileContents: Record<string, string>;
  previousDiff?: string;
  lastError?: string;
  // Multi-file coordination (optional)
  multiFilePlan?: MultiFilePlan;
  sharedTypes?: SharedType[];
}

const SYSTEM_PROMPT = `You are an expert software engineer implementing a planned change.

Your job is to:
1. Follow the implementation plan exactly
2. Write clean, idiomatic code
3. Match the existing code style
4. Generate a unified diff (git diff format)
5. For multi-file changes, ensure type consistency across files
6. ONLY import from modules that exist in the provided file contents

## CRITICAL: IMPORT RULES

- ONLY import from files shown in "Current File Contents" or standard libraries
- DO NOT invent imports that don't exist (e.g., don't import from paths not shown)
- Check the existing code structure before adding imports
- Reuse existing utilities, types, and patterns from the codebase
- If you need functionality that doesn't exist, implement it inline or in the target file

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

## MULTI-FILE COORDINATION

When given a multiFilePlan:
1. **Respect execution order**: Generate diffs in the order specified
2. **Use shared types**: Apply the exact type definitions provided
3. **Maintain consistency**: Imports, types, and function signatures must match
4. **Layer order**: types → utils → services → components → tests

### Type Consistency Rules
- If a shared type is defined, use it EXACTLY as specified
- Import types from the correct paths
- Don't redefine types that should be imported

## COMMON MISTAKES TO AVOID

- Do NOT duplicate existing code in the diff
- Do NOT include the same line as both context and added
- Do NOT forget to count lines correctly in @@ headers
- Do NOT mix up line numbers between hunks
- Do NOT add trailing whitespace
- Do NOT define types that should be imported from shared files
- Do NOT use inconsistent type names across files

## CRITICAL: CODE CONTENT RULES

**NEVER include diff markers inside the actual code content!**
The following patterns should ONLY appear in diff headers, NOT inside code:
- \`--- a/\` or \`+++ b/\` (file headers)
- \`@@\` (hunk headers)
- Lines starting with \`diff --git\`

If your code needs to work with diffs (e.g., parsing diffs), use string escaping:
- Use \`"--- a/"\` as a string literal, not raw diff syntax
- Build diff strings programmatically, don't embed raw diff format

WRONG (diff markers in code):
\`\`\`typescript
const header = --- a/file.ts  // BAD: raw diff marker
\`\`\`

CORRECT (escaped strings):
\`\`\`typescript
const header = "--- a/file.ts";  // GOOD: string literal
\`\`\`

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
  "diff": "unified diff string with proper format (all files in one diff)",
  "commitMessage": "conventional commit message (feat/fix/refactor: description)",
  "filesModified": ["array of file paths touched"],
  "notes": "optional implementation notes"
}`;

// Default coder model - can be overridden via env var or constructor
const DEFAULT_CODER_MODEL =
  process.env.CODER_MODEL ||
  process.env.DEFAULT_LLM_MODEL ||
  "claude-opus-4-5-20251101";

export class CoderAgent extends BaseAgent<CoderInput, CoderOutput> {
  constructor(modelOverride?: string) {
    // A/B tested: Opus is faster but Sonnet is cost-effective
    // Can be overridden via CODER_MODEL env var or constructor param
    super({
      model: modelOverride || DEFAULT_CODER_MODEL,
      maxTokens: 8192,
      temperature: 0.2,
    });
  }

  async run(input: CoderInput, modelOverride?: string): Promise<CoderOutput> {
    // Allow runtime model override for effort-based selection
    if (modelOverride) {
      this.config.model = modelOverride;
    }

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

## Available Imports
The files above are the ONLY codebase files you can import from. For any other imports:
- Use npm packages that are likely installed (zod, @octokit/rest, etc.)
- Implement functionality inline if the import doesn't exist
- DO NOT import from paths not shown above
`.trim();

    // Add multi-file coordination context if available
    if (input.multiFilePlan) {
      userPrompt += this.buildMultiFilePlanSection(input.multiFilePlan);
    }

    // Add shared types if available
    if (input.sharedTypes && input.sharedTypes.length > 0) {
      userPrompt += this.buildSharedTypesSection(input.sharedTypes);
    }

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

  /**
   * Build the multi-file plan section for the prompt
   */
  private buildMultiFilePlanSection(plan: MultiFilePlan): string {
    let section = `\n\n## Multi-File Coordination Plan\n\n`;

    section += `### Execution Order\n`;
    section += `Generate diffs for files in this exact order:\n`;
    plan.executionOrder.forEach((path, i) => {
      const file = plan.files.find((f) => f.path === path);
      const layer = file?.layer ? ` [${file.layer}]` : "";
      const changeType = file?.changeType || "modify";
      section += `${i + 1}. \`${path}\`${layer} (${changeType})\n`;
    });

    section += `\n### File Details\n`;
    for (const file of plan.files) {
      section += `\n#### ${file.path}\n`;
      section += `- **Change type**: ${file.changeType}\n`;
      section += `- **Summary**: ${file.summary}\n`;
      if (file.dependencies.length > 0) {
        section += `- **Depends on**: ${file.dependencies.join(", ")}\n`;
      }
      if (file.layer) {
        section += `- **Layer**: ${file.layer}\n`;
      }
    }

    if (plan.rollbackStrategy) {
      section += `\n### Rollback Strategy\n${plan.rollbackStrategy}\n`;
    }

    return section;
  }

  /**
   * Build the shared types section for the prompt
   */
  private buildSharedTypesSection(types: SharedType[]): string {
    let section = `\n\n## Shared Types (USE EXACTLY AS DEFINED)\n\n`;
    section += `These types are shared across files. Use them exactly as defined:\n\n`;

    for (const type of types) {
      section += `### ${type.name}\n`;
      section += `\`\`\`typescript\n${type.definition}\n\`\`\`\n`;
      section += `Used in: ${type.usedIn.join(", ")}\n\n`;
    }

    return section;
  }
}
