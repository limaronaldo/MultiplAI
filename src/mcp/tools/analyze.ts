import { z } from 'zod';
import { Octokit } from '@octokit/rest';
import { PlannerAgent } from '../../agents/planner.js';
import { ClaudeProvider } from '../../providers/claude.js';
import type { ToolDefinition } from '../types.js';

/**
 * Input schema for the analyze tool
 */
export const analyzeInputSchema = z.object({
  repo: z.string().describe('Repository in owner/repo format (e.g., "octocat/hello-world")'),
  issueNumber: z.number().int().positive().describe('GitHub issue number to analyze'),
});

export type AnalyzeInput = z.infer<typeof analyzeInputSchema>;

/**
 * Output structure for the analyze tool
 */
export interface AnalyzeOutput {
  complexity: 'low' | 'medium' | 'high';
  targetFiles: string[];
  plan: string;
  confidence: number;
  recommendation: string;
  issueTitle: string;
  issueUrl: string;
}

/**
 * Fetches a GitHub issue using the Octokit client
 */
async function fetchGitHubIssue(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<{ title: string; body: string; url: string }> {
  const response = await octokit.issues.get({
    owner,
    repo,
    issue_number: issueNumber,
  });

  return {
    title: response.data.title,
    body: response.data.body || '',
    url: response.data.html_url,
  };
}

/**
 * Analyzes a GitHub issue using the PlannerAgent
 */
export async function analyzeGitHubIssue(input: AnalyzeInput): Promise<AnalyzeOutput> {
  const { repo, issueNumber } = input;

  // Parse owner/repo format
  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) {
    throw new Error(`Invalid repo format: "${repo}". Expected "owner/repo" format.`);
  }

  // Initialize Octokit with token from environment
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    throw new Error('GITHUB_TOKEN environment variable is required');
  }

  const octokit = new Octokit({ auth: githubToken });

  // Fetch the issue
  let issue: { title: string; body: string; url: string };
  try {
    issue = await fetchGitHubIssue(octokit, owner, repoName, issueNumber);
  } catch (error) {
    if (error instanceof Error && 'status' in error && (error as { status: number }).status === 404) {
      throw new Error(`Issue #${issueNumber} not found in ${repo}`);
    }
    throw new Error(`Failed to fetch issue: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Initialize the PlannerAgent
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required');
  }

  const provider = new ClaudeProvider(anthropicApiKey);
  const planner = new PlannerAgent(provider);

  // Run analysis using the PlannerAgent
  const issueContent = `# ${issue.title}\n\n${issue.body}`;
  const analysis = await planner.analyze(issueContent);

  return {
    complexity: analysis.complexity,
    targetFiles: analysis.targetFiles,
    plan: analysis.plan,
    confidence: analysis.confidence,
    recommendation: generateRecommendation(analysis.complexity, analysis.confidence),
    issueTitle: issue.title,
    issueUrl: issue.url,
  };
}

/**
 * Generates a recommendation based on complexity and confidence
 */
function generateRecommendation(complexity: string, confidence: number): string {
  if (confidence < 0.5) {
    return 'Low confidence analysis. Consider providing more context or breaking down the issue.';
  }
  if (complexity === 'high') {
    return 'Complex change detected. Consider breaking into smaller issues or requesting human review.';
  }
  if (complexity === 'medium') {
    return 'Moderate complexity. Automated implementation possible with careful review.';
  }
  return 'Simple change. Good candidate for automated implementation.';
}

/**
 * Tool definition for MCP registration
 */
export const analyzeToolDefinition: ToolDefinition = {
  name: 'analyze_issue',