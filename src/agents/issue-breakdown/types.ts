/**
 * Types and Zod schemas for IssueBreakdownAgent
 */

import { z } from "zod";

// =============================================================================
// XS ISSUE METADATA
// =============================================================================

export const XSIssueMetadataSchema = z.object({
  parentIssueNumber: z.number(),
  subtaskId: z.string(),
  targetFiles: z.array(z.string()),
  changeType: z.enum(["create", "modify", "delete"]),
  acceptanceCriteria: z.array(z.string()),
  dependsOn: z.array(z.string()),
  estimatedLines: z.number(),
  testRequirements: z.array(z.string()),
});

export type XSIssueMetadata = z.infer<typeof XSIssueMetadataSchema>;

// =============================================================================
// XS ISSUE DEFINITION
// =============================================================================

export const XSIssueDefinitionSchema = z.object({
  title: z.string(),
  body: z.string(),
  labels: z.array(z.string()),
  metadata: XSIssueMetadataSchema,
});

export type XSIssueDefinition = z.infer<typeof XSIssueDefinitionSchema>;

// =============================================================================
// DEPENDENCY GRAPH
// =============================================================================

export const DependencyEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
});

export type DependencyEdge = z.infer<typeof DependencyEdgeSchema>;

export const DependencyGraphSchema = z.object({
  nodes: z.array(z.string()),
  edges: z.array(DependencyEdgeSchema),
});

export type DependencyGraph = z.infer<typeof DependencyGraphSchema>;

// =============================================================================
// COMPLEXITY
// =============================================================================

export const ComplexityLevelSchema = z.enum(["XS", "S", "M", "L", "XL"]);
export type ComplexityLevel = z.infer<typeof ComplexityLevelSchema>;

export const TotalComplexitySchema = z.object({
  original: ComplexityLevelSchema,
  subtaskCount: z.number(),
  estimatedTotalLines: z.number(),
});

export type TotalComplexity = z.infer<typeof TotalComplexitySchema>;

// =============================================================================
// BREAKDOWN INPUT/OUTPUT
// =============================================================================

export const BreakdownInputSchema = z.object({
  issueNumber: z.number(),
  issueTitle: z.string(),
  issueBody: z.string(),
  repoFullName: z.string(),
  existingPlan: z.array(z.object({
    action: z.string(),
    targetFile: z.string(),
    changeType: z.string(),
    description: z.string(),
  })).optional(),
  estimatedComplexity: ComplexityLevelSchema.optional(),
});

export type BreakdownInput = z.infer<typeof BreakdownInputSchema>;

export const BreakdownOutputSchema = z.object({
  shouldBreakdown: z.boolean(),
  skipReason: z.string().optional(),
  issues: z.array(XSIssueDefinitionSchema),
  dependencies: DependencyGraphSchema,
  totalComplexity: TotalComplexitySchema,
  executionPlan: z.array(z.string()),
});

export type BreakdownOutput = z.infer<typeof BreakdownOutputSchema>;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function createNoBreakdownOutput(reason: string): BreakdownOutput {
  return {
    shouldBreakdown: false,
    skipReason: reason,
    issues: [],
    dependencies: { nodes: [], edges: [] },
    totalComplexity: { original: "XS", subtaskCount: 0, estimatedTotalLines: 0 },
    executionPlan: [],
  };
}

export function createBreakdownOutput(
  issues: XSIssueDefinition[],
  dependencies: DependencyGraph,
  originalComplexity: ComplexityLevel,
  executionPlan: string[],
): BreakdownOutput {
  const totalLines = issues.reduce(
    (sum, issue) => sum + issue.metadata.estimatedLines,
    0,
  );

  return {
    shouldBreakdown: true,
    issues,
    dependencies,
    totalComplexity: {
      original: originalComplexity,
      subtaskCount: issues.length,
      estimatedTotalLines: totalLines,
    },
    executionPlan,
  };
}
