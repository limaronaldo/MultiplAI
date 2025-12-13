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
export function createAnalyzeHandler(deps: AnalyzeDeps) {
  return async (args: unknown) => {
    try {
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
        complexity: plannerOutput.estimatedComplexity,
        targetFiles: plannerOutput.targetFiles,
        plan: plannerOutput.plan,
        confidence: confidenceFromComplexity(plannerOutput.estimatedComplexity),
        recommendation: recommendationFromComplexity(
          plannerOutput.estimatedComplexity,
        ),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  };
}
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