import { BaseAgent } from "./base";
import {
  CoderOutput,
  CoderOutputSchema,
  type MultiFilePlan,
  type SharedType,
} from "../core/types";
import { ragRuntime, type RagSearchResult } from "../services/rag/rag-runtime";
import { getMemoryBlockStore, type MemoryBlock } from "../core/memory/blocks";
import { getPatterns } from "../core/memory/archival";

interface CoderInput {
  definitionOfDone: string[];
  plan: string[];
  targetFiles: string[];
  fileContents: Record<string, string>;
  knowledgeGraphContext?: string;
  previousDiff?: string;
  lastError?: string;
  // Multi-file coordination (optional)
  multiFilePlan?: MultiFilePlan | null;
  sharedTypes?: SharedType[];
  // RAG context (optional)
  repoFullName?: string;
  // Memory context
  taskId?: string;
  repo?: string;
}

const SYSTEM_PROMPT = `You are an expert software engineer implementing a planned change.

Your job is to:
1. Follow the implementation plan exactly
2. Write clean, idiomatic code
3. Match the existing code style
4. Generate a unified diff (git diff format)
5. For multi-file changes, ensure type consistency across files
6. ONLY import from modules that exist in the provided file contents

## STRICT CONTENT RULES

- NEVER add decorative content: NO ASCII art, NO banners, NO box-drawing characters
- NEVER add emojis in code (only allowed in user-facing strings if requested)
- NEVER add decorative console.log statements with fancy formatting
- Keep output minimal and professional - code only, no flair

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

    // Gather RAG context if available
    const ragContext = await this.gatherRagContext(input);

    // Gather memory blocks and learned patterns
    const memoryContext = await this.gatherMemoryContext(input);

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

${input.knowledgeGraphContext ? `\n## Knowledge Graph Context (best-effort)\n${input.knowledgeGraphContext}\n` : ""}
${ragContext ? `\n## Similar Code Patterns (RAG)\n${ragContext}\n` : ""}
${memoryContext ? `\n## Memory Context (learned from past tasks)\n${memoryContext}\n` : ""}

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

    // Debug: Log response type and preview
    console.log(`[Coder] Response type: ${typeof response}`);
    console.log(
      `[Coder] Response preview: ${String(response).slice(0, 500)}...`,
    );

    // Handle case where response is already an object (some API responses)
    if (typeof response === "object" && response !== null) {
      console.log(
        `[Coder] Response is already an object, keys: ${Object.keys(response).join(", ")}`,
      );
      // Check if it has expected fields before parsing
      const obj = response as Record<string, unknown>;
      if (!obj.diff || !obj.commitMessage || !obj.filesModified) {
        console.error(
          `[Coder] Object missing required fields: diff=${!!obj.diff}, commitMessage=${!!obj.commitMessage}, filesModified=${!!obj.filesModified}`,
        );
        console.error(
          `[Coder] Full response object: ${JSON.stringify(response).slice(0, 1000)}`,
        );
      }
      return CoderOutputSchema.parse(response);
    }

    const parsed = this.parseJSON<CoderOutput>(response);

    // Debug: Log parsed keys
    console.log(`[Coder] Parsed keys: ${Object.keys(parsed || {}).join(", ")}`);
    if (!parsed?.diff || !parsed?.commitMessage || !parsed?.filesModified) {
      console.error(
        `[Coder] Parsed result missing required fields: diff=${!!parsed?.diff}, commitMessage=${!!parsed?.commitMessage}, filesModified=${!!parsed?.filesModified}`,
      );
      console.error(`[Coder] Raw response length: ${String(response).length}`);
    }

    return CoderOutputSchema.parse(parsed);
  }

  /**
   * Gather memory blocks and coding conventions for context
   */
  private async gatherMemoryContext(input: CoderInput): Promise<string | null> {
    try {
      const parts: string[] = [];

      // Get task-specific memory blocks if taskId is provided
      if (input.taskId) {
        const store = getMemoryBlockStore();
        const blocks = await store.getForTask(input.taskId);

        // Filter for relevant blocks (project context, learned patterns)
        const relevantBlocks = blocks.filter(
          (b: MemoryBlock) => b.label === "project" || b.label === "learned",
        );

        if (relevantBlocks.length > 0) {
          const blocksSection = relevantBlocks
            .map(
              (b: MemoryBlock) =>
                `**${b.label}** (${b.description}):\n${b.value.slice(0, 500)}${b.value.length > 500 ? "..." : ""}`,
            )
            .join("\n\n");
          parts.push(`### Task Context\n${blocksSection}`);
        }
      }

      // Get coding conventions from learned patterns
      const conventions = await getPatterns({
        patternType: "convention",
        repo: input.repo,
        minConfidence: 0.6,
        limit: 5,
      });

      if (conventions.length > 0) {
        const conventionsSection = conventions
          .map((c) => `- ${c.description}`)
          .join("\n");
        parts.push(`### Coding Conventions (learned)\n${conventionsSection}`);
      }

      // Get style patterns
      const stylePatterns = await getPatterns({
        patternType: "style",
        repo: input.repo,
        minConfidence: 0.6,
        limit: 3,
      });

      if (stylePatterns.length > 0) {
        const styleSection = stylePatterns
          .map((s) => `- ${s.description}`)
          .join("\n");
        parts.push(`### Style Guidelines (learned)\n${styleSection}`);
      }

      if (parts.length === 0) {
        return null;
      }

      console.log(
        `[Coder] Found memory context: ${input.taskId ? "task blocks, " : ""}${conventions.length} conventions, ${stylePatterns.length} style patterns`,
      );
      return parts.join("\n\n");
    } catch (error) {
      console.warn("[Coder] Failed to gather memory context:", error);
      return null;
    }
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

  /**
   * Gather RAG context by searching for similar code patterns
   * Issue #208 - Integrate RAG search into CoderAgent
   */
  private async gatherRagContext(input: CoderInput): Promise<string | null> {
    // Skip if RAG is not available or repo not specified
    if (!input.repoFullName) {
      return null;
    }

    const stats = ragRuntime.getStats();
    if (stats.status !== "ready" || stats.repoFullName !== input.repoFullName) {
      console.log(
        `[Coder] RAG not ready for ${input.repoFullName}, skipping context gathering`,
      );
      return null;
    }

    try {
      // Build search queries from the plan and definition of done
      const searchQueries: string[] = [];

      // Extract key terms from the plan
      for (const step of input.plan.slice(0, 3)) {
        // Limit to first 3 steps
        searchQueries.push(step);
      }

      // Extract key terms from definition of done
      for (const item of input.definitionOfDone.slice(0, 2)) {
        // Limit to first 2 items
        searchQueries.push(item);
      }

      // Search for similar patterns
      const allResults: RagSearchResult[] = [];
      const seenChunks = new Set<string>();

      for (const query of searchQueries) {
        try {
          const results = ragRuntime.search({
            repoFullName: input.repoFullName,
            query,
            limit: 3,
          });

          for (const result of results) {
            // Deduplicate by chunk content
            const chunkKey = `${result.filePath}:${result.chunk.slice(0, 100)}`;
            if (!seenChunks.has(chunkKey) && result.score > 0.3) {
              seenChunks.add(chunkKey);
              allResults.push(result);
            }
          }
        } catch (searchError) {
          console.warn(
            `[Coder] RAG search failed for query "${query.slice(0, 50)}...":`,
            searchError,
          );
        }
      }

      if (allResults.length === 0) {
        return null;
      }

      // Sort by score and take top results
      const topResults = allResults
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      // Format results for context
      const contextParts = topResults.map((result) => {
        return `### ${result.filePath} (score: ${result.score.toFixed(2)})\n\`\`\`\n${result.chunk.slice(0, 500)}${result.chunk.length > 500 ? "..." : ""}\n\`\`\``;
      });

      console.log(
        `[Coder] Found ${topResults.length} relevant code patterns from RAG`,
      );
      return contextParts.join("\n\n");
    } catch (error) {
      console.warn("[Coder] Failed to gather RAG context:", error);
      return null;
    }
  }
}
