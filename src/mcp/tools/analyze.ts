import { z } from "zod";
import type { MCPToolDefinition } from "../types.js";
import type { PlannerOutput } from "../../core/types.js";

export const analyzeTool: MCPToolDefinition = {
  name: "autodev.analyze",
  description: "Analyze a GitHub issue and return an execution plan preview",
  inputSchema: {
    type: "object",
    properties: {
      repo: {
        type: "string",
        description: "GitHub repo in owner/repo format",
      },
      issueNumber: {
        type: "integer",
        description: "GitHub issue number",
      },
    },
    required: ["repo", "issueNumber"],
  },
};

const AnalyzeArgsSchema = z.object({
  repo: z.string().min(1),
  issueNumber: z.coerce.number().int().positive(),
});

export interface AnalyzeDeps {
  getGitHubClient: () => {
    getIssue: (
      repo: string,
      issueNumber: number,
    ) => Promise<{ title: string; body: string; url: string }>;
    getRepoContext: (repo: string, targetFiles: string[]) => Promise<string>;
  };
  getPlannerAgent: () => {
    run: (input: {
      issueTitle: string;
      issueBody: string;
      repoContext: string;
    }) => Promise<PlannerOutput>;
  };
}

function confidenceFromComplexity(
  complexity: "XS" | "S" | "M" | "L" | "XL",
): number {
  switch (complexity) {
    case "XS":
      return 0.9;
    case "S":
      return 0.8;
    case "M":
      return 0.6;
    case "L":
      return 0.4;
    case "XL":
      return 0.2;
  }
}

function recommendationFromComplexity(
  complexity: "XS" | "S" | "M" | "L" | "XL",
): "execute" | "breakdown" | "manual" {
  switch (complexity) {
    case "XS":
    case "S":
      return "execute";
    case "M":
    case "L":
      return "breakdown";
    case "XL":
      return "manual";
  }
}

export function createAnalyzeHandler(deps: AnalyzeDeps) {
  return async (args: unknown) => {
    const { repo, issueNumber } = AnalyzeArgsSchema.parse(args);

    const github = deps.getGitHubClient();
    const planner = deps.getPlannerAgent();

    const issue = await github.getIssue(repo, issueNumber);
    const repoContext = await github.getRepoContext(repo, []);
    const plannerOutput = await planner.run({
      issueTitle: issue.title,
      issueBody: issue.body,
      repoContext,
    });

    return {
      repo,
      issueNumber,
      issueTitle: issue.title,
      issueUrl: issue.url,
      complexity: plannerOutput.estimatedComplexity,
      effort: plannerOutput.estimatedEffort,
      targetFiles: plannerOutput.targetFiles,
      plan: plannerOutput.plan,
      definitionOfDone: plannerOutput.definitionOfDone,
      risks: plannerOutput.risks || [],
      confidence: confidenceFromComplexity(plannerOutput.estimatedComplexity),
      recommendation: recommendationFromComplexity(
        plannerOutput.estimatedComplexity,
      ),
    };
  };
}
