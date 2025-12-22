import { BaseAgent } from "./base";
import {
  FixerOutput,
  FixerOutputSchema,
  type ReflectionRootCause,
} from "../core/types";
import { ragRuntime, type RagSearchResult } from "../services/rag/rag-runtime";
import { getPatterns, semanticSearch } from "../core/memory/archival";

interface FixerInput {
  definitionOfDone: string[];
  plan: string[];
  currentDiff: string;
  errorLogs: string;
  fileContents: Record<string, string>;
  knowledgeGraphContext?: string;
  // RAG context (optional)
  repoFullName?: string;
  // Reflection feedback (Issue #217 - Agentic Loop integration)
  reflectionFeedback?: string;
  rootCause?: ReflectionRootCause;
  reflectionDiagnosis?: string;
  // Memory context
  repo?: string;
}

// Default fixer model - Claude Haiku 4.5 for fast debugging
// Cost: ~$0.01/task vs ~$0.30 with gpt-5.1-codex-max (97% savings)
const DEFAULT_FIXER_MODEL =
  process.env.FIXER_MODEL || "claude-haiku-4-5-20250514";

const SYSTEM_PROMPT = `You are an expert debugger fixing failing code.

Your job is to:
1. Analyze the error logs
2. Understand what went wrong
3. Fix the code while preserving the original intent
4. Generate a new unified diff with the fixes

CRITICAL RULES:
- Focus ONLY on fixing the reported errors
- Don't refactor or change unrelated code
- Keep the fix minimal and surgical
- Ensure the fix addresses the root cause
- Output valid unified diff format
- The output diff must be complete (original changes + your fixes) and apply cleanly to the base branch; do NOT assume the repo already contains the diff.
- NEVER add decorative content: NO ASCII art, NO banners, NO box-drawing characters, NO emojis in code
- NEVER add console.log statements with decorative formatting
- If the error is unrelated to the original task (e.g., pre-existing lint errors), acknowledge this in fixDescription but still attempt a minimal fix

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
    // Claude Opus - best model for debugging complex issues
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

    // Gather RAG context for error resolution
    const ragContext = await this.gatherRagContext(input);

    // Gather fix patterns from archival memory
    const memoryPatterns = await this.gatherMemoryPatterns(input);

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

${input.knowledgeGraphContext ? `\n## Knowledge Graph Context (best-effort)\n${input.knowledgeGraphContext}\n` : ""}
${ragContext ? `\n## Related Code (RAG)\n${ragContext}\n` : ""}
${memoryPatterns ? `\n## Memory Context (learned from past fixes)\n${memoryPatterns}\n` : ""}
${this.buildReflectionSection(input)}

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

  /**
   * Gather fix patterns from archival memory
   * Searches for similar errors that were successfully fixed in the past
   */
  private async gatherMemoryPatterns(
    input: FixerInput,
  ): Promise<string | null> {
    try {
      // Search for fix patterns matching this type of error
      const fixPatterns = await getPatterns({
        patternType: "fix",
        repo: input.repo,
        minConfidence: 0.5,
        limit: 5,
      });

      // Also search archival memory for similar error contexts
      const errorQuery = input.errorLogs.slice(0, 500); // First 500 chars of error
      const similarErrors = await semanticSearch({
        query: errorQuery,
        repo: input.repo,
        sourceTypes: ["feedback", "observation"],
        limit: 3,
        threshold: 0.6,
        includeGlobal: true,
      });

      const parts: string[] = [];

      if (fixPatterns.length > 0) {
        const patternsSection = fixPatterns
          .map((p) => {
            const solution = p.solution ? `\n   Solution: ${p.solution}` : "";
            return `- ${p.description}${solution} (${(p.confidence * 100).toFixed(0)}% confidence)`;
          })
          .join("\n");
        parts.push(`### Known Fix Patterns\n${patternsSection}`);
      }

      if (similarErrors.length > 0) {
        const errorsSection = similarErrors
          .map((e) => `- ${e.summary || e.content.slice(0, 200)}...`)
          .join("\n");
        parts.push(`### Similar Past Errors\n${errorsSection}`);
      }

      if (parts.length === 0) {
        return null;
      }

      console.log(
        `[Fixer] Found ${fixPatterns.length} fix patterns and ${similarErrors.length} similar errors from memory`,
      );
      return parts.join("\n\n");
    } catch (error) {
      console.warn("[Fixer] Failed to gather memory patterns:", error);
      return null;
    }
  }

  /**
   * Gather RAG context by searching for symbol definitions and similar error fixes
   * Issue #209 - Integrate RAG search into FixerAgent
   */
  private async gatherRagContext(input: FixerInput): Promise<string | null> {
    // Skip if RAG is not available or repo not specified
    if (!input.repoFullName) {
      return null;
    }

    const stats = ragRuntime.getStats();
    if (stats.status !== "ready" || stats.repoFullName !== input.repoFullName) {
      console.log(
        `[Fixer] RAG not ready for ${input.repoFullName}, skipping context gathering`,
      );
      return null;
    }

    try {
      const searchQueries: string[] = [];
      const allResults: RagSearchResult[] = [];
      const seenChunks = new Set<string>();

      // Extract undefined symbols from error logs
      const undefinedSymbols = this.extractUndefinedSymbols(input.errorLogs);
      for (const symbol of undefinedSymbols.slice(0, 3)) {
        searchQueries.push(`function ${symbol}`);
        searchQueries.push(`class ${symbol}`);
        searchQueries.push(`const ${symbol}`);
      }

      // Extract type errors
      const typeErrors = this.extractTypeErrors(input.errorLogs);
      for (const typeError of typeErrors.slice(0, 2)) {
        searchQueries.push(typeError);
      }

      // Search for each query
      for (const query of searchQueries) {
        try {
          const results = ragRuntime.search({
            repoFullName: input.repoFullName,
            query,
            limit: 3,
          });

          for (const result of results) {
            const chunkKey = `${result.filePath}:${result.chunk.slice(0, 100)}`;
            if (!seenChunks.has(chunkKey) && result.score > 0.25) {
              seenChunks.add(chunkKey);
              allResults.push(result);
            }
          }
        } catch (searchError) {
          console.warn(
            `[Fixer] RAG search failed for query "${query.slice(0, 50)}...":`,
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
        `[Fixer] Found ${topResults.length} relevant code patterns from RAG`,
      );
      return contextParts.join("\n\n");
    } catch (error) {
      console.warn("[Fixer] Failed to gather RAG context:", error);
      return null;
    }
  }

  /**
   * Extract undefined symbol names from error logs
   */
  private extractUndefinedSymbols(errorLogs: string): string[] {
    const symbols: string[] = [];

    // Common patterns for undefined symbols
    const patterns = [
      /Cannot find name '(\w+)'/g,
      /is not defined/g,
      /'(\w+)' is not defined/g,
      /Property '(\w+)' does not exist/g,
      /Cannot find module '([^']+)'/g,
      /has no exported member '(\w+)'/g,
      /ReferenceError: (\w+) is not defined/g,
    ];

    for (const pattern of patterns) {
      const matches = errorLogs.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && !symbols.includes(match[1])) {
          symbols.push(match[1]);
        }
      }
    }

    return symbols;
  }

  /**
   * Extract type error descriptions from error logs
   */
  private extractTypeErrors(errorLogs: string): string[] {
    const errors: string[] = [];

    // Common type error patterns
    const patterns = [
      /Type '([^']+)' is not assignable to type '([^']+)'/g,
      /Argument of type '([^']+)' is not assignable/g,
      /Property '(\w+)' is missing in type/g,
      /Expected \d+ arguments, but got \d+/g,
    ];

    for (const pattern of patterns) {
      const matches = errorLogs.matchAll(pattern);
      for (const match of matches) {
        const errorDesc = match[0].slice(0, 100);
        if (!errors.includes(errorDesc)) {
          errors.push(errorDesc);
        }
      }
    }

    return errors;
  }

  /**
   * Build the reflection feedback section for the prompt
   * Issue #217 - Use reflection insights to guide fix strategy
   */
  private buildReflectionSection(input: FixerInput): string {
    if (!input.reflectionFeedback && !input.rootCause) {
      return "";
    }

    let section = "\n## Reflection Analysis (Agentic Loop)\n\n";

    if (input.rootCause) {
      section += `**Root Cause**: ${input.rootCause}\n`;
      section += this.getRootCauseGuidance(input.rootCause);
    }

    if (input.reflectionDiagnosis) {
      section += `\n**Diagnosis**: ${input.reflectionDiagnosis}\n`;
    }

    if (input.reflectionFeedback) {
      section += `\n**Feedback**: ${input.reflectionFeedback}\n`;
    }

    section += `
**IMPORTANT**: The reflection analysis above provides insights into why previous attempts failed.
Use this information to:
1. Address the specific root cause identified
2. Avoid repeating the same mistakes
3. Apply the targeted fix strategy for this type of error
`;

    return section;
  }

  /**
   * Get specific guidance based on root cause type
   */
  private getRootCauseGuidance(rootCause: ReflectionRootCause): string {
    switch (rootCause) {
      case "plan":
        return `
> The issue is with the plan itself, not the implementation.
> Focus on: Adjusting the approach rather than just fixing syntax.
> The fix may require a different strategy than originally planned.
`;
      case "code":
        return `
> The issue is in the code implementation.
> Focus on: Fixing the specific code error while maintaining the original plan.
> Look for typos, logic errors, missing imports, or incorrect API usage.
`;
      case "test":
        return `
> The issue is with the test setup or expectations, not the implementation.
> Focus on: Ensuring the test correctly validates the intended behavior.
> The implementation may be correct but the test needs adjustment.
`;
      case "environment":
        return `
> The issue is environmental (dependencies, config, permissions).
> Focus on: Ensuring all dependencies are properly installed and configured.
> Check for missing packages, incorrect versions, or configuration issues.
`;
      default:
        return "";
    }
  }
}
