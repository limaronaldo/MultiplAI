/**
 * autodev.analyze handler
 * Analyzes a GitHub issue and returns the plan without executing
 */

import { PlannerAgent } from "../../agents/planner";
import { GitHubClient } from "../../integrations/github";
import type { AnalyzeInput, AnalyzeResult, MCPToolResult } from "../types";

export async function handleAnalyze(
  args: AnalyzeInput,
): Promise<MCPToolResult> {
  try {
    const github = new GitHubClient();

    // Parse repo into owner and name
    const [owner, repo] = args.repo.split("/");
    if (!owner || !repo) {
      throw new Error(
        `Invalid repo format: ${args.repo}. Expected: owner/repo`,
      );
    }

    // Fetch issue from GitHub
    const issue = await github.getIssue(owner, repo, args.issueNumber);

    // Get repo context for planner
    const repoContext = await github.getRepoContext(args.repo, []);

    // Run PlannerAgent for analysis
    const planner = new PlannerAgent();
    const plan = await planner.run({
      issueTitle: issue.title,
      issueBody: issue.body ?? "",
      repoContext,
    });

    // Determine recommendation based on complexity and confidence
    const confidence = estimateConfidence(plan);
    const recommendation = determineRecommendation(
      plan.estimatedComplexity,
      confidence,
    );

    const result: AnalyzeResult = {
      issue: {
        title: issue.title,
        body: issue.body ?? "",
      },
      analysis: {
        complexity: plan.estimatedComplexity,
        targetFiles: plan.targetFiles,
        definitionOfDone: plan.definitionOfDone,
        plan: plan.plan,
        effort: plan.estimatedEffort ?? "medium",
        confidence,
      },
      recommendation,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `Failed to analyze issue: ${message}`,
          }),
        },
      ],
      isError: true,
    };
  }
}

/**
 * Estimate confidence based on plan quality
 */
function estimateConfidence(plan: {
  targetFiles: string[];
  definitionOfDone: string[];
  plan: string[];
}): number {
  let confidence = 50; // Base confidence

  // More target files identified = higher confidence
  if (plan.targetFiles.length > 0) confidence += 15;
  if (plan.targetFiles.length > 2) confidence += 10;

  // Clear definition of done = higher confidence
  if (plan.definitionOfDone.length > 0) confidence += 10;
  if (plan.definitionOfDone.length > 2) confidence += 5;

  // Detailed plan = higher confidence
  if (plan.plan.length > 0) confidence += 10;
  if (plan.plan.length > 3) confidence += 5;

  return Math.min(confidence, 100);
}

/**
 * Determine recommendation based on complexity and confidence
 */
function determineRecommendation(
  complexity: "XS" | "S" | "M" | "L" | "XL",
  confidence: number,
): "execute" | "breakdown" | "manual" {
  // Low confidence = manual review needed
  if (confidence < 50) {
    return "manual";
  }

  // Large/XL complexity = needs breakdown
  if (complexity === "L" || complexity === "XL") {
    return "breakdown";
  }

  // Medium complexity with lower confidence = breakdown
  if (complexity === "M" && confidence < 70) {
    return "breakdown";
  }

  // XS/S or high-confidence M = execute
  return "execute";
}
