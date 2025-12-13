import { z } from "zod";
import { BaseAgent } from "./base";

// ============================================
// Input/Output Types
// ============================================

export interface BreakdownInput {
  issueTitle: string;
  issueBody: string;
  repoContext: string;
  estimatedComplexity: "M" | "L" | "XL";
}

export const SubIssueSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  targetFiles: z.array(z.string()),
  dependsOn: z.array(z.string()), // IDs of prerequisite sub-issues
  acceptanceCriteria: z.array(z.string()),
  complexity: z.enum(["XS", "S"]),
});

export type SubIssue = z.infer<typeof SubIssueSchema>;

export const BreakdownOutputSchema = z.object({
  subIssues: z.array(SubIssueSchema),
  executionOrder: z.array(z.string()), // IDs in execution order
  parallelGroups: z.array(z.array(z.string())).optional(), // Groups that can run in parallel
  reasoning: z.string(),
});

export type BreakdownOutput = z.infer<typeof BreakdownOutputSchema>;

// ============================================
// Breakdown Agent
// ============================================

const BREAKDOWN_SYSTEM_PROMPT = `You are an expert software architect who breaks down complex issues into smaller, independent sub-tasks.

Your job is to analyze a GitHub issue and decompose it into multiple XS or S complexity sub-issues that can be implemented independently.

## Guidelines

1. **Each sub-issue must be XS or S complexity**:
   - XS: Single file change, < 50 lines, 15-30 min
   - S: 1-3 files, < 150 lines, 30-60 min

2. **Sub-issues must be independent when possible**:
   - Minimize dependencies between sub-issues
   - If dependencies exist, clearly specify them
   - Group independent sub-issues that can run in parallel

3. **Each sub-issue needs clear scope**:
   - Specific target files
   - Clear acceptance criteria
   - Self-contained description

4. **Maintain consistency**:
   - Use consistent naming conventions
   - Follow the existing codebase patterns
   - Ensure sub-issues build on each other logically

5. **Consider the dependency order**:
   - Data models before APIs
   - Utilities before features that use them
   - Core functionality before edge cases

## Output Format

Return a JSON object with:
- subIssues: Array of sub-issues with id, title, description, targetFiles, dependsOn, acceptanceCriteria, complexity
- executionOrder: Array of sub-issue IDs in the order they should be executed
- parallelGroups: Optional array of arrays - each inner array contains IDs that can run in parallel
- reasoning: Brief explanation of the decomposition strategy`;

export class BreakdownAgent extends BaseAgent<BreakdownInput, BreakdownOutput> {
  constructor() {
    super({
      maxTokens: 16384,
      temperature: 0.3,
    });
  }

  async run(input: BreakdownInput): Promise<BreakdownOutput> {
    const userPrompt = this.buildUserPrompt(input);
    const response = await this.complete(BREAKDOWN_SYSTEM_PROMPT, userPrompt);
    const output = this.parseJSON<BreakdownOutput>(response);

    // Validate with Zod
    const validated = BreakdownOutputSchema.parse(output);

    // Validate dependencies are valid
    this.validateDependencies(validated);

    return validated;
  }

  private buildUserPrompt(input: BreakdownInput): string {
    return `## Issue to Decompose

**Title:** ${input.issueTitle}

**Description:**
${input.issueBody}

**Estimated Complexity:** ${input.estimatedComplexity}

## Repository Context
${input.repoContext}

## Task

Break this issue down into XS/S sub-issues. Return a JSON object with:
1. subIssues - array of sub-issues
2. executionOrder - IDs in the order they should run
3. parallelGroups - groups of IDs that can run in parallel (optional)
4. reasoning - your decomposition strategy

Each sub-issue needs:
- id: unique identifier (e.g., "sub-1", "sub-2")
- title: clear, descriptive title
- description: detailed description of what to implement
- targetFiles: specific files to create/modify
- dependsOn: array of sub-issue IDs this depends on (empty if independent)
- acceptanceCriteria: list of criteria for completion
- complexity: "XS" or "S"

Important:
- Each sub-issue must be XS or S complexity
- Minimize dependencies between sub-issues
- Be specific about target files
- Include clear acceptance criteria`;
  }

  private validateDependencies(output: BreakdownOutput): void {
    const subIssueIds = new Set(output.subIssues.map((s) => s.id));

    // Check all dependencies reference valid sub-issues
    for (const subIssue of output.subIssues) {
      for (const depId of subIssue.dependsOn) {
        if (!subIssueIds.has(depId)) {
          throw new Error(
            `Sub-issue "${subIssue.id}" depends on non-existent sub-issue "${depId}"`,
          );
        }
        if (depId === subIssue.id) {
          throw new Error(`Sub-issue "${subIssue.id}" cannot depend on itself`);
        }
      }
    }

    // Check execution order contains all sub-issues
    const orderIds = new Set(output.executionOrder);
    for (const subIssue of output.subIssues) {
      if (!orderIds.has(subIssue.id)) {
        throw new Error(
          `Sub-issue "${subIssue.id}" not found in execution order`,
        );
      }
    }

    // Check for circular dependencies
    this.checkCircularDependencies(output.subIssues);
  }

  private checkCircularDependencies(subIssues: SubIssue[]): void {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const subIssueMap = new Map(subIssues.map((s) => [s.id, s]));

    const visit = (id: string, path: string[]): void => {
      if (visiting.has(id)) {
        throw new Error(
          `Circular dependency detected: ${[...path, id].join(" -> ")}`,
        );
      }
      if (visited.has(id)) return;

      visiting.add(id);
      const subIssue = subIssueMap.get(id);
      if (subIssue) {
        for (const depId of subIssue.dependsOn) {
          visit(depId, [...path, id]);
        }
      }
      visiting.delete(id);
      visited.add(id);
    };

    for (const subIssue of subIssues) {
      visit(subIssue.id, []);
    }
  }
}
