import { BaseAgent } from '../base-agent.js';
import { InitializerAgent } from '../initializer/initializer-agent.js';
import {
  BreakdownInput,
  BreakdownOutput,
  XSIssueDefinition,
  DependencyGraph,
  ComplexityLevel,
} from './types.js';
import { analyzeComplexity } from './analyze-complexity.js';
import { identifyComponents } from './identify-components.js';
import { generateDependencyGraph } from './generate-dependency-graph.js';
import { createIssueTemplate } from './create-issue-template.js';
import { validateBreakdown } from './validate-breakdown.js';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Agent responsible for breaking down large issues into XS/S sized subtasks.
 * Orchestrates the 8-step breakdown process using specialized utility functions.
 */
export class IssueBreakdownAgent extends BaseAgent<BreakdownInput, BreakdownOutput> {
  readonly name = 'IssueBreakdownAgent';
  readonly description = 'Breaks down large issues into XS/S sized implementation tasks';

  private initializerAgent: InitializerAgent;

  constructor(client: Anthropic, model?: string) {
    super(client, model);
    this.initializerAgent = new InitializerAgent(client, model);
  }

  /**
   * Main orchestration method implementing the 8-step breakdown process:
   * 1. Parse and understand the issue
   * 2. Analyze complexity
   * 3. If XS/S, return as-is
   * 4. Identify components
   * 5. Generate dependency graph
   * 6. Create XS issues
   * 7. Validate breakdown
   * 8. Return structured output
   */
  async run(input: BreakdownInput): Promise<BreakdownOutput> {
    // Step 1: Parse and understand the issue (done via InitializerAgent for context)
    const initResult = await this.initializerAgent.run({
      issueNumber: input.issueNumber,
      issueTitle: input.issueTitle,
      issueBody: input.issueBody,
      repoContext: input.repoContext,
    });

    // Step 2: Analyze complexity
    const complexityAnalysis = await analyzeComplexity(
      this.client,
      {
        issueNumber: input.issueNumber,
        issueTitle: input.issueTitle,
        issueBody: input.issueBody,
      },
      initResult.repoMap,
      this.model
    );

    // Step 3: If already XS or S, no breakdown needed
    if (complexityAnalysis.level === 'XS' || complexityAnalysis.level === 'S') {
      return this.noBreakdownNeeded(input, complexityAnalysis.level, complexityAnalysis.reasoning);
    }

    // Step 4: Identify components that need modification
    const components = await identifyComponents(
      this.client,
      {
        issueNumber: input.issueNumber,
        issueTitle: input.issueTitle,
        issueBody: input.issueBody,
      },
      initResult.repoMap,
      complexityAnalysis,
      this.model
    );

    // Step 5: Generate dependency graph
    const dependencyGraph = await generateDependencyGraph(
      this.client,
      components,
      this.model
    );

    // Step 6: Create XS issue definitions
    const xsIssues = await this.generateIssues(
      input,
      components,
      dependencyGraph
    );

    // Step 7: Validate the breakdown
    const validation = await validateBreakdown(
      this.client,
      {
        issueNumber: input.issueNumber,
        issueTitle: input.issueTitle,
        issueBody: input.issueBody,
      },
      xsIssues,
      dependencyGraph,
      this.model
    );

    // Step 8: Return structured output
    const executionOrder = this.topologicalSort(xsIssues, dependencyGraph);

    return {
      originalIssue: {
        number: input.issueNumber,
        title: input.issueTitle,
        body: input.issueBody,
      },
      complexity: complexityAnalysis.level,
      needsBreakdown: true,
      xsIssues,
      dependencyGraph,
      executionOrder,
      validation,
    };
  }

  /**
   * Returns a BreakdownOutput indicating no breakdown is needed.
   */
  private noBreakdownNeeded(
    input: BreakdownInput,
    complexity: ComplexityLevel,
    reasoning: string
  ): BreakdownOutput {
    return {
      originalIssue: {
        number: input.issueNumber,
        title: input.issueTitle,
        body: input.issueBody,
      },
      complexity,
      needsBreakdown: false,
      reasoning,
    };
  }

  /**
   * Generates XSIssueDefinition array from identified components.
   */
  private async generateIssues(
    input: BreakdownInput,
    components: Array<{ name: string; description: string; files: string[]; estimatedEffort: string }>,
    dependencyGraph: DependencyGraph
  ): Promise<XSIssueDefinition[]> {
    const issues: XSIssueDefinition[] = [];

    for (let i = 0; i < components.length; i++) {
      const component = components[i];
      const dependencies = dependencyGraph.edges
        .filter(edge => edge.to === component.name)
        .map(edge => edge.from);

      const template = createIssueTemplate(
        component.name,
        component.description,
        component.files,
        dependencies,
        input.issueNumber
      );

      issues.push({
        id: `xs-${input.issueNumber}-${i + 1}`,
        title: template.title,
        body: template.body,
        labels: template.labels,
        parentIssue: input.issueNumber,
        dependencies,
        estimatedEffort: component.estimatedEffort as 'XS' | 'S',
        filesToModify: component.files,
        acceptanceCriteria: template.acceptanceCriteria,
      });
    }

    return issues;
  }

  /**
   * Performs topological sort on issues based on dependency graph.
   * Returns issue IDs in valid execution order.
   */
  private topologicalSort(
    issues: XSIssueDefinition[],
    dependencyGraph: DependencyGraph
  ): string[] {
    const issueMap = new Map(issues.map(issue => [issue.id, issue]));
    const visited = new Set<string>();
    const result: string[] = [];

    // Build adjacency list from component names to issue IDs
    const componentToIssue = new Map<string, string>();
    for (const issue of issues) {
      // Extract component name from issue title or use ID
      const componentName = dependencyGraph.nodes.find(node =>
        issue.title.toLowerCase().includes(node.toLowerCase())
      );
      if (componentName) {