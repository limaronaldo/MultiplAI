/**
 * GitHub integration for issue breakdown agent
 * Handles creating XS issues and updating parent issues with breakdown summaries
 */

import { GitHubClient } from '../../integrations/github';
import { IssueBreakdown, XSIssue } from './types';

/**
 * Represents a created GitHub issue
 */
export interface CreatedIssue {
  /** GitHub issue number */
  number: number;
  /** Subtask identifier from the breakdown */
  subtaskId: string;
  /** URL to the created issue */
  url: string;
}

/**
 * Result of executing a breakdown
 */
export interface BreakdownExecutionResult {
  /** Whether the execution was successful */
  success: boolean;
  /** List of created issues */
  createdIssues: CreatedIssue[];
  /** Error message if execution failed */
  error?: string;
}

/**
 * Creates XS-sized GitHub issues from a breakdown
 *
 * @param client - GitHub client instance
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param parentIssueNumber - Parent issue number for linking
 * @param breakdown - The issue breakdown containing XS issues to create
 * @returns Array of created issues with their numbers and URLs
 */
export async function createXSIssuesOnGitHub(
  client: GitHubClient,
  owner: string,
  repo: string,
  parentIssueNumber: number,
  breakdown: IssueBreakdown
): Promise<CreatedIssue[]> {
  const createdIssues: CreatedIssue[] = [];

  for (const issue of breakdown.issues) {
    try {
      const labels = [
        'auto-dev',
        'complexity-XS',
        `parent-${parentIssueNumber}`,
      ];

      const body = formatIssueBody(issue, parentIssueNumber);

      const created = await client.createIssue(owner, repo, {
        title: issue.title,
        body,
        labels,
      });

      createdIssues.push({
        number: created.number,
        subtaskId: issue.id,
        url: created.html_url,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to create issue for subtask ${issue.id}: ${message}`
      );
    }
  }

  return createdIssues;
}

/**
 * Formats the body for an XS issue
 */
function formatIssueBody(issue: XSIssue, parentIssueNumber: number): string {
  const sections = [
    `Parent: #${parentIssueNumber}`,
    '',
    '## Description',
    issue.description,
    '',
    '## Acceptance Criteria',
    ...issue.acceptanceCriteria.map((ac) => `- [ ] ${ac}`),
    '',
    '## Files to Modify',
    ...issue.filesToModify.map((f) => `- \`${f}\``),
  ];

  if (issue.dependencies.length > 0) {
    sections.push('', '## Dependencies', ...issue.dependencies.map((d) => `- ${d}`));
  }

  return sections.join('\n');
}

/**
 * Updates the parent issue with a breakdown summary comment and adds orchestrated label
 *
 * @param client - GitHub client instance
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param parentIssueNumber - Parent issue number to update
 * @param breakdown - The issue breakdown
 * @param createdIssues - Array of created issues to reference
 */
export async function updateParentWithBreakdown(
  client: GitHubClient,
  owner: string,
  repo: string,
  parentIssueNumber: number,
  breakdown: IssueBreakdown,
  createdIssues: CreatedIssue[]
): Promise<void> {
  try {
    // Build the comment body
    const subtaskList = createdIssues
      .map((ci, index) => {
        const issue = breakdown.issues.find((i) => i.id === ci.subtaskId);
        const title = issue?.title || ci.subtaskId;
        return `${index + 1}. #${ci.number} - ${title}`;
      })
      .join('\n');

    const executionOrder = breakdown.executionOrder.join(' → ');

    const comment = [
      '## 🤖 Auto-Dev Breakdown',
      '',
      '### Subtasks',
      subtaskList,
      '',
      '### Execution Order',
      executionOrder,
      '',
      `_Total estimated effort: ${breakdown.issues.length} XS tasks_`,
    ].join('\n');

    await client.createComment(owner, repo, parentIssueNumber, comment);

    // Add the orchestrated label to the parent issue
    await client.addLabels(owner, repo, parentIssueNumber, ['auto-dev-orchestrated']);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to update parent issue: ${message}`);