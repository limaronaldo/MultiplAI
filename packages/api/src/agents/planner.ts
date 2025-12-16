import { BaseAgent } from "./base";
import { PlannerOutput, PlannerOutputSchema } from "../core/types";
import { ragService } from "../services/rag";
import type { CodeChunk } from "../services/rag";
import { getModelForPositionSync } from "../core/model-selection";

// Default planner model - reads from database config, falls back to env var or hardcoded default
// The model can be configured via the Settings page in the dashboard
function getPlannerModel(): string {
  const dbModel = getModelForPositionSync("planner");
  if (dbModel && dbModel !== "x-ai/grok-code-fast-1") {
    // x-ai/grok-code-fast-1 is the fallback default in model-selection.ts
    return dbModel;
  }
  return process.env.PLANNER_MODEL || "claude-haiku-4-5-20251001";
}

interface PlannerInput {
  issueTitle: string;
  issueBody: string;
  repoContext: string;
}

function uniq<T>(values: T[]): T[] {
  const out: T[] = [];
  const seen = new Set<T>();
  for (const v of values) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function asCodeChunk(value: unknown): CodeChunk | null {
  if (!value || typeof value !== "object") return null;
  const v = value as any;
  if (v.chunk && typeof v.chunk === "object") return asCodeChunk(v.chunk);
  if (typeof v.filePath !== "string") return null;
  if (typeof v.content !== "string") return null;
  if (typeof v.startLine !== "number") return null;
  if (typeof v.endLine !== "number") return null;
  return v as CodeChunk;
}

function buildRagContext(results: unknown[]): {
  suggestedFiles: string[];
  snippets: string;
} {
  const chunks: CodeChunk[] = [];
  for (const r of results) {
    const c = asCodeChunk(r);
    if (c) chunks.push(c);
  }

  const suggestedFiles = uniq(chunks.map((c) => c.filePath)).slice(0, 8);
  const snippetChunks = chunks.slice(0, 3);

  const snippets = snippetChunks
    .map((c) => {
      const body =
        c.content.length > 800 ? `${c.content.slice(0, 800)}\n…` : c.content;
      return [`### ${c.filePath}:${c.startLine}`, "```", body, "```"].join(
        "\n",
      );
    })
    .join("\n\n");

  return { suggestedFiles, snippets };
}

const SYSTEM_PROMPT = `You are a senior tech lead planning the implementation of a GitHub issue.

Your job is to:
1. Understand the issue requirements
2. Define clear, testable acceptance criteria (Definition of Done)
3. Create a step-by-step implementation plan
4. Identify which files need to be modified or created
5. Estimate complexity
6. For M+ complexity, create a multi-file coordination plan

IMPORTANT RULES:
- Keep the scope small and focused
- Each DoD item must be verifiable
- Plan should be sequential and logical
- Only include files that NEED to change
- Be conservative with complexity estimates

## Multi-File Coordination (for M, L, XL complexity)

When the change involves 3+ files, include a "multiFilePlan" with:
1. File-by-file breakdown with dependencies
2. Shared types that span multiple files
3. Execution order respecting dependencies
4. Rollback strategy

### Dependency Layers (execute in this order):
1. **types**: Type definitions, interfaces, schemas (no deps)
2. **utils**: Utility functions (depend on types)
3. **services**: Business logic (depend on types, utils)
4. **components**: UI/handlers (depend on services)
5. **tests**: Test files (depend on all above)

## Command Execution (optional)

If the task requires running shell commands (installing packages, migrations, etc.), include:
- "commands": Array of commands to execute
- "commandOrder": "before_diff" or "after_diff"

### Available Command Types (prefer bun_add for this project):
- bun_add: { type: "bun_add", packages: ["zod"], dev?: true }  // PREFERRED for package installation
- npm_install: { type: "npm_install", packages: ["lodash", "@types/lodash"], dev?: true }
- pnpm_add: { type: "pnpm_add", packages: ["axios"], dev?: true }
- yarn_add: { type: "yarn_add", packages: ["react"], dev?: true }
- prisma_migrate: { type: "prisma_migrate", name: "add_users_table" }
- prisma_generate: { type: "prisma_generate" }
- prisma_db_push: { type: "prisma_db_push" }
- drizzle_generate: { type: "drizzle_generate" }
- drizzle_migrate: { type: "drizzle_migrate" }
- create_directory: { type: "create_directory", path: "src/new-feature" }
- typecheck: { type: "typecheck" }
- lint_fix: { type: "lint_fix" }
- format: { type: "format" }

### When to use commands:
- Package installation: Include BEFORE diff (so code can import them)
- Prisma/Drizzle generate: Include AFTER diff (after schema changes)
- Directory creation: Include BEFORE diff
- Formatting/linting: Include AFTER diff

Respond ONLY with valid JSON matching this schema:
{
  "definitionOfDone": ["string array of acceptance criteria"],
  "plan": ["string array of implementation steps"],
  "targetFiles": ["string array of file paths"],
  "estimatedComplexity": "XS" | "S" | "M" | "L" | "XL",
  "risks": ["optional array of potential issues"],
  "commands": [  // Optional: commands to run
    { "type": "bun_add", "packages": ["zod"], "dev": false },
    { "type": "prisma_generate" }
  ],
  "commandOrder": "before_diff" | "after_diff",  // When to run commands
  "multiFilePlan": {  // Include for M+ complexity with 3+ files
    "files": [{
      "path": "src/types/user.ts",
      "changeType": "create" | "modify" | "delete",
      "dependencies": [],  // File paths this depends on
      "summary": "What changes in this file",
      "layer": "types" | "utils" | "services" | "components" | "tests"
    }],
    "sharedTypes": [{  // Types used across files
      "name": "UserProfile",
      "definition": "interface UserProfile { id: string; name: string; }",
      "usedIn": ["src/types/user.ts", "src/services/user.ts"]
    }],
    "executionOrder": ["src/types/user.ts", "src/services/user.ts"],
    "rollbackStrategy": "Delete created files, revert modified files"
  }
}

Complexity guide:
- XS: < 20 lines, single file, trivial change
- S: < 50 lines, 1-2 files, straightforward
- M: < 150 lines, 2-4 files, some logic (include multiFilePlan)
- L: > 150 lines, multiple files, complex logic (include multiFilePlan)
- XL: Major feature, architectural changes (include multiFilePlan)`;

export class PlannerAgent extends BaseAgent<PlannerInput, PlannerOutput> {
  constructor() {
    // Use a placeholder model - actual model is set at runtime in run()
    // This allows the DB config to be loaded before we read the model
    super({
      model: "claude-haiku-4-5-20251015", // placeholder, overridden in run()
      temperature: 0.3,
      maxTokens: 4096,
    });
  }

  async run(input: PlannerInput): Promise<PlannerOutput> {
    // Get model from DB config at runtime (after initModelConfig has run)
    const model = getPlannerModel();
    this.config.model = model;
    console.log(`[Planner] Using model: ${model}`);
    let ragSuggestedFiles: string[] = [];
    let ragSnippets = "";

    if (ragService.isInitialized()) {
      try {
        const results = await ragService.search(
          `${input.issueTitle}\n\n${input.issueBody}`,
        );
        const ctx = buildRagContext(results);
        ragSuggestedFiles = ctx.suggestedFiles;
        ragSnippets = ctx.snippets;
      } catch (e) {
        console.warn("[Planner] RAG search failed, continuing without it:", e);
      }
    }

    const ragContext =
      ragSuggestedFiles.length || ragSnippets
        ? [
            "## RAG Suggestions",
            ragSuggestedFiles.length
              ? `### Suggested Files\n${ragSuggestedFiles.map((f) => `- ${f}`).join("\n")}`
              : "",
            ragSnippets ? `### Relevant Snippets\n${ragSnippets}` : "",
          ]
            .filter(Boolean)
            .join("\n\n")
        : "";

    const userPrompt = `
## Issue Title
${input.issueTitle}

## Issue Description
${input.issueBody || "No description provided"}

${ragContext}

## Repository Context
${input.repoContext}

---

Analyze this issue and provide your implementation plan as JSON.
`.trim();

    const response = await this.complete(SYSTEM_PROMPT, userPrompt);

    console.log(`[Planner] Response type: ${typeof response}`);
    console.log(
      `[Planner] Response preview: ${String(response).slice(0, 500)}...`,
    );

    if (typeof response === "object" && response !== null) {
      try {
        const validated = PlannerOutputSchema.parse(response);
        return {
          ...validated,
          targetFiles: uniq([
            ...(validated.targetFiles ?? []),
            ...ragSuggestedFiles,
          ]),
        };
      } catch (validationError) {
        console.error(
          "[Planner] Schema validation failed for object response:",
          validationError,
        );
        throw validationError;
      }
    }

    let parsed: PlannerOutput;
    try {
      parsed = this.parseJSON<PlannerOutput>(response);
      console.log(
        `[Planner] Parsed result keys: ${Object.keys(parsed || {}).join(", ")}`,
      );
    } catch (parseError) {
      console.error("[Planner] JSON parse failed:", parseError);
      console.error(
        "[Planner] Response preview:",
        String(response).slice(0, 500),
      );
      throw parseError;
    }

    try {
      const validated = PlannerOutputSchema.parse(parsed);
      return {
        ...validated,
        targetFiles: uniq([
          ...(validated.targetFiles ?? []),
          ...ragSuggestedFiles,
        ]),
      };
    } catch (validationError) {
      console.error("[Planner] Schema validation failed:", validationError);
      console.error(
        "[Planner] Parsed data:",
        JSON.stringify(parsed, null, 2).slice(0, 500),
      );
      throw validationError;
    }
  }
}
