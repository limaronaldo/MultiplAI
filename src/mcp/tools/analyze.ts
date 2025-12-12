import { z } from 'zod';
import { Octokit } from '@octokit/rest';

/**
 * Tool definition type for MCP registration
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
  handler: (input: unknown) => Promise<unknown>;
}

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
 * Simple analysis based on issue content
 * This provides a basic implementation that can be enhanced with PlannerAgent later
 */
function analyzeIssueContent(title: string, body: string): { complexity: 'low' | 'medium' | 'high'; targetFiles: string[]; plan: string; confidence: number } {
  const content = `${title} ${body}`.toLowerCase();
  const lines = body.split('\n').filter(line => line.trim());
  
  // Estimate complexity based on content length and keywords
  let complexity: 'low' | 'medium' | 'high' = 'low';
  if (content.includes('refactor') || content.includes('breaking') || content.includes('migration') || lines.length > 20) {
    complexity = 'high';
  } else if (content.includes('feature') || content.includes('add') || content.includes('implement') || lines.length > 10) {
    complexity = 'medium';
  }
  
  // Extract potential file paths from content
  const filePattern = /[\w-]+\.[a-z]{2,4}/gi;
  const targetFiles = [...new Set(content.match(filePattern) || [])];
  
  // Generate a basic plan
  const plan = `Analyze and address: ${title}`;
  
  // Confidence based on how much information is available
  const confidence = Math.min(0.9, 0.3 + (lines.length * 0.05));
  
  return { complexity, targetFiles, plan, confidence };
}

/**
 * Analyzes a GitHub issue
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

  // Run analysis
  const analysis = analyzeIssueContent(issue.title, issue.body);

  // Generate recommendation
  let recommendation: string;
  if (analysis.confidence < 0.5) {
    recommendation = 'Low confidence analysis. Consider providing more context or breaking down the issue.';
  } else if (analysis.complexity === 'high') {
    recommendation = 'Complex change detected. Consider breaking into smaller issues or requesting human review.';
  } else if (analysis.complexity === 'medium') {
    recommendation = 'Moderate complexity. Automated implementation possible with careful review.';
  } else {
    recommendation = 'Simple change. Good candidate for automated implementation.';
  }

  return {
    complexity: analysis.complexity,