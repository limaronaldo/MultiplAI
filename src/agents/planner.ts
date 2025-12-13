// Default planner model - can be overridden via env var
// Planner uses Kimi K2 Thinking for agentic planning with 262K context
// Cost: ~$0.15/task vs ~$0.50 with gpt-5.1-codex-max (70% savings)
import type { CodeChunk } from "../services/rag";

// Default planner model - can be overridden via env var
// Planner uses Kimi K2 Thinking for agentic planning with 262K context
// Cost: ~$0.15/task vs ~$0.50 with gpt-5.1-codex-max (70% savings)
const DEFAULT_PLANNER_MODEL =
interface PlannerInput {
  issueTitle: string;
  issueBody: string;
  issueTitle: string;
  issueBody: string;
  repoContext: string;
  previousFeedback?: string;
  failedApproaches?: string[];
}

function uniq<T>(values: T[]): T[] {

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

Your job is to:
1. Understand the issue requirements
2. Define clear, testable acceptance criteria (Definition of Done)
3. Create a step-by-step implementation plan
4. Identify which files need to be modified or created
5. Estimate complexity
6. For M+ complexity, create a multi-file coordination plan

## Previous Context

Previous attempt failed because: {previousFeedback}

Avoid these approaches: {failedApproaches}

IMPORTANT RULES:
- Keep the scope small and focused
- Each DoD item must be verifiable
    if (c) chunks.push(c);
  }

  const suggestedFiles = uniq(chunks.map((c) => c.filePath)).slice(0, 8);
  const snippetChunks = chunks.slice(0, 3);

  return { suggestedFiles, snippets };
}

export class PlannerAgent extends BaseAgent<PlannerInput, PlannerOutput> {
  constructor() {
    // Kimi K2 Thinking - agentic reasoning model optimized for planning
- XL: Major feature, architectural changes (include multiFilePlan)`;

export class PlannerAgent extends BaseAgent<PlannerInput, PlannerOutput> {
  constructor() {
    // Kimi K2 Thinking - agentic reasoning model optimized for planning
    // No reasoningEffort param needed - Kimi handles reasoning internally
    super({
      model: DEFAULT_PLANNER_MODEL,
      temperature: 0.3,
      maxTokens: 4096,
    let ragSuggestedFiles: string[] = [];
    let ragSnippets = "";

    // Replace placeholders in system prompt
    const systemPrompt = SYSTEM_PROMPT
      .replace('{previousFeedback}', input.previousFeedback || 'None')
      .replace('{failedApproaches}', input.failedApproaches?.join(', ') || 'None');

    // Use the customized system prompt
    if (ragService.isInitialized()) {
      try {
        const results = await ragService.search(

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

    const response = await this.complete(systemPrompt, userPrompt);

    console.log(`[Planner] Response type: ${typeof response}`);
    console.log(`[Planner] Response preview: ${String(response).slice(0, 500)}...`);

    console.log(`[Planner] Response type: ${typeof response}`);
    console.log(`[Planner] Response preview: ${String(response).slice(0, 500)}...`);

    if (typeof response === "object" && response !== null) {
      const validated = PlannerOutputSchema.parse(response);
      return {
        ...validated,
        targetFiles: uniq([...(validated.targetFiles ?? []), ...ragSuggestedFiles]),
      };
    }

    const parsed = this.parseJSON<PlannerOutput>(response);
    console.log(`[Planner] Parsed result keys: ${Object.keys(parsed || {}).join(", ")}`);

    const validated = PlannerOutputSchema.parse(parsed);
    return {
      ...validated,
      targetFiles: uniq([...(validated.targetFiles ?? []), ...ragSuggestedFiles]),
    };
  }
}

