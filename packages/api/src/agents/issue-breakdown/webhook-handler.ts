/**
 * Webhook Handler for IssueBreakdownAgent
 *
 * Handles GitHub webhooks to trigger issue breakdown when:
 * - An issue is labeled with "breakdown" or "auto-breakdown"
 * - An issue is estimated as M/L/XL complexity
 */

import { GitHubClient } from "../../integrations/github";
import { IssueBreakdownAgent } from "./agent";
import { createSubtaskIssues, linkDependencies } from "./github-integration";
import type { BreakdownInput } from "./types";

// =============================================================================
// CONFIGURATION
// =============================================================================

const BREAKDOWN_LABELS = ["breakdown", "auto-breakdown", "needs-breakdown"];
const COMPLEXITY_LABELS = ["complexity-m", "complexity-l", "complexity-xl"];

// =============================================================================
// WEBHOOK PAYLOAD TYPES
// =============================================================================

export interface IssueWebhookPayload {
  action: string;
  issue: {
    number: number;
    title: string;
    body: string | null;
    labels: Array<{ name: string }>;
    state: string;
  };
  repository: {
    full_name: string;
  };
  label?: {
    name: string;
  };
}

// =============================================================================
// WEBHOOK HANDLER
// =============================================================================

export interface BreakdownWebhookResult {
  triggered: boolean;
  reason: string;
  issuesCreated?: number;
  parentIssue?: number;
}

/**
 * Handle GitHub issue webhook for breakdown
 */
export async function handleIssueWebhook(
  payload: IssueWebhookPayload,
): Promise<BreakdownWebhookResult> {
  // Only handle 'labeled' events
  if (payload.action !== "labeled") {
    return {
      triggered: false,
      reason: `Ignoring action: ${payload.action}`,
    };
  }

  // Check if the added label triggers breakdown
  const addedLabel = payload.label?.name;
  if (!addedLabel) {
    return {
      triggered: false,
      reason: "No label in payload",
    };
  }

  const shouldBreakdown =
    BREAKDOWN_LABELS.includes(addedLabel.toLowerCase()) ||
    COMPLEXITY_LABELS.includes(addedLabel.toLowerCase());

  if (!shouldBreakdown) {
    return {
      triggered: false,
      reason: `Label "${addedLabel}" does not trigger breakdown`,
    };
  }

  // Check if issue is already broken down
  const existingLabels = payload.issue.labels.map((l) => l.name.toLowerCase());
  if (existingLabels.includes("broken-down")) {
    return {
      triggered: false,
      reason: "Issue already broken down",
    };
  }

  // Determine complexity from labels
  const complexity = getComplexityFromLabels(existingLabels);

  // Run the breakdown agent
  try {
    const result = await runBreakdown(
      payload.repository.full_name,
      payload.issue.number,
      payload.issue.title,
      payload.issue.body || "",
      complexity,
    );

    return {
      triggered: true,
      reason: "Breakdown completed successfully",
      issuesCreated: result.issuesCreated,
      parentIssue: payload.issue.number,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      triggered: false,
      reason: `Breakdown failed: ${message}`,
    };
  }
}

function getComplexityFromLabels(
  labels: string[],
): "XS" | "S" | "M" | "L" | "XL" | undefined {
  if (labels.includes("complexity-xl") || labels.includes("xl")) return "XL";
  if (labels.includes("complexity-l") || labels.includes("l")) return "L";
  if (labels.includes("complexity-m") || labels.includes("m")) return "M";
  if (labels.includes("complexity-s") || labels.includes("s")) return "S";
  if (labels.includes("complexity-xs") || labels.includes("xs")) return "XS";
  return undefined;
}

// =============================================================================
// BREAKDOWN EXECUTION
// =============================================================================

interface RunBreakdownResult {
  issuesCreated: number;
  executionPlan: string[];
}

async function runBreakdown(
  repoFullName: string,
  issueNumber: number,
  issueTitle: string,
  issueBody: string,
  estimatedComplexity?: "XS" | "S" | "M" | "L" | "XL",
): Promise<RunBreakdownResult> {
  const github = new GitHubClient();
  const agent = new IssueBreakdownAgent();

  // Prepare input
  const input: BreakdownInput = {
    issueNumber,
    issueTitle,
    issueBody,
    repoFullName,
    estimatedComplexity,
  };

  // Run breakdown agent
  const breakdownOutput = await agent.run(input);

  if (!breakdownOutput.shouldBreakdown) {
    // Add comment explaining why no breakdown
    await github.addComment(
      repoFullName,
      issueNumber,
      `**Issue Breakdown Skipped**\n\n${breakdownOutput.skipReason}`,
    );

    return {
      issuesCreated: 0,
      executionPlan: [],
    };
  }

  // Create subtask issues on GitHub
  const result = await createSubtaskIssues(
    github,
    repoFullName,
    issueNumber,
    breakdownOutput,
  );

  // Link dependencies between issues
  await linkDependencies(
    github,
    repoFullName,
    result.createdIssues,
    breakdownOutput.dependencies,
  );

  return {
    issuesCreated: result.createdIssues.length,
    executionPlan: breakdownOutput.executionPlan,
  };
}

// =============================================================================
// API ENDPOINT HANDLER
// =============================================================================

/**
 * HTTP handler for breakdown webhook endpoint
 */
export async function handleBreakdownRequest(
  request: Request,
): Promise<Response> {
  try {
    const payload = (await request.json()) as IssueWebhookPayload;
    const result = await handleIssueWebhook(payload);

    return new Response(JSON.stringify(result), {
      status: result.triggered ? 200 : 200, // Always 200 for webhooks
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// =============================================================================
// MANUAL TRIGGER
// =============================================================================

/**
 * Manually trigger breakdown for an issue (via API)
 */
export async function triggerBreakdown(
  repoFullName: string,
  issueNumber: number,
): Promise<RunBreakdownResult> {
  const github = new GitHubClient();

  // Fetch issue details
  const { owner, repo } = github.parseRepo(repoFullName);
  const response = await github.octokit.rest.issues.get({
    owner,
    repo,
    issue_number: issueNumber,
  });

  const issue = response.data;
  const labels = issue.labels.map((l) =>
    typeof l === "string" ? l : l.name || "",
  );
  const complexity = getComplexityFromLabels(labels.map((l) => l.toLowerCase()));

  return runBreakdown(
    repoFullName,
    issueNumber,
    issue.title,
    issue.body || "",
    complexity,
  );
}
