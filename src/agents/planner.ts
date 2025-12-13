import { BaseAgent } from "./base";
import { PlannerOutput, PlannerOutputSchema } from "../core/types";
import { RagService } from "../services/rag";

// Default planner model - can be overridden via env var
// Planner uses Kimi K2 Thinking for agentic planning with 262K context
// Cost: ~$0.15/task vs ~$0.50 with gpt-5.1-codex-max (70% savings)
const DEFAULT_PLANNER_MODEL =
  process.env.PLANNER_MODEL || "moonshotai/kimi-k2-thinking";

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
export class PlannerAgent extends BaseAgent<PlannerInput, PlannerOutput> {
  constructor() {
    // Kimi K2 Thinking - agentic reasoning model optimized for planning
    this.ragService = new RagService();
    super({
      model: DEFAULT_PLANNER_MODEL,
      temperature: 0.3,
If the task requires running shell commands (installing packages, migrations, etc.), include:
- "commands": Array of commands to execute
  }

  async run(input: PlannerInput): Promise<PlannerOutput> {
    let ragContext = "";
    const userPrompt = `
## Issue Title
${input.issueTitle}
---

Analyze this issue and provide your implementation plan as JSON.
`.trim();

    // Check if RAG is initialized and perform search
    if (this.ragService.isInitialized()) {
      const ragResults = await this.ragService.search(input.issueBody);
      if (ragResults.snippets) {
        ragContext += `\n\n## Relevant Code Snippets from RAG Search\n${ragResults.snippets}\n`;
      }
      if (ragResults.suggestedFiles) {
        ragContext += `\n## Suggested Files from RAG\n${ragResults.suggestedFiles.map(f => `- ${f}`).join('\n')}\n`;
      }
    }

    const enrichedIssueBody = (input.issueBody || "No description provided") + ragContext;

    const response = await this.complete(SYSTEM_PROMPT, userPrompt);

      `[Planner] Response preview: ${String(response).slice(0, 500)}...`,
    );

    // Handle case where response is already an object (some API responses)
    if (typeof response === "object" && response !== null) {
      console.log(
        `[Planner] Response is already an object, validating directly`,
      );

    const parsed = this.parseJSON<PlannerOutput>(response);

    // Debug: Log parsed result
    console.log(
      `[Planner] Parsed result keys: ${Object.keys(parsed || {}).join(", ")}`,
    );

    // Validate with Zod
    return PlannerOutputSchema.parse(parsed);
  }
}

  private ragService: RagService;
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
    // Kimi K2 Thinking - agentic reasoning model optimized for planning
    // No reasoningEffort param needed - Kimi handles reasoning internally
    super({
      model: DEFAULT_PLANNER_MODEL,
      temperature: 0.3,
      maxTokens: 4096,
    });
  }

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

    // Debug: Log raw response type and preview
    console.log(`[Planner] Response type: ${typeof response}`);
    console.log(
      `[Planner] Response preview: ${String(response).slice(0, 500)}...`,
    );

    // Handle case where response is already an object (some API responses)
    if (typeof response === "object" && response !== null) {
      console.log(
        `[Planner] Response is already an object, validating directly`,
      );
      return PlannerOutputSchema.parse(response);
    }

    const parsed = this.parseJSON<PlannerOutput>(response);

    // Debug: Log parsed result
    console.log(
      `[Planner] Parsed result keys: ${Object.keys(parsed || {}).join(", ")}`,
    );

    // Validate with Zod
    return PlannerOutputSchema.parse(parsed);
  }
}
