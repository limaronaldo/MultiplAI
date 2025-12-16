/**
 * IssueBreakdownAgent Module
 *
 * Breaks M/L/XL issues into XS subtasks for AutoDev processing.
 */

// Types and schemas
export {
  XSIssueMetadataSchema,
  XSIssueDefinitionSchema,
  DependencyGraphSchema,
  ComplexityLevelSchema,
  BreakdownInputSchema,
  BreakdownOutputSchema,
  createNoBreakdownOutput,
  createBreakdownOutput,
} from "./types";

export type {
  XSIssueMetadata,
  XSIssueDefinition,
  DependencyGraph,
  DependencyEdge,
  ComplexityLevel,
  TotalComplexity,
  BreakdownInput,
  BreakdownOutput,
} from "./types";

// Template generation
export {
  generateIssueBody,
  generateXSIssue,
  generateSubtaskTitle,
} from "./template-generator";

export type { TemplateOptions } from "./template-generator";

// Boundary detection
export {
  detectBoundaries,
  analyzeSplitPoints,
  analyzeCrossFileDependencies,
  analyzeAllBoundaries,
} from "./boundary-detection";

export type {
  CodeBoundary,
  FileBoundary,
  BoundaryAnalysis,
  SplitPoint,
} from "./boundary-detection";

// Chunking
export {
  chunkPlanItems,
  chunksToIssues,
  smartChunk,
  estimateComplexityFromChunks,
} from "./chunking";

export type { ChunkingConfig, PlanItem, Chunk } from "./chunking";

// Dependency graph
export {
  buildDependencyGraph,
  addEdge,
  getDependencies,
  getDependents,
  detectCycles,
  hasCycles,
  topologicalSort,
  getExecutionLevels,
  getMaxParallelism,
  generateExecutionPlan,
  validateExecutionOrder,
  toMermaidDiagram,
} from "./dependency-graph";

export type { ExecutionLevel } from "./dependency-graph";

// Core agent
export { IssueBreakdownAgent, breakdownIssue, shouldBreakdown } from "./agent";

// GitHub integration
export {
  createSubtaskIssues,
  linkDependencies,
  getSubtasksStatus,
  areAllSubtasksComplete,
  getNextSubtask,
} from "./github-integration";

export type {
  CreatedIssue,
  BreakdownResult,
  SubtaskStatus,
} from "./github-integration";

// Webhook handler
export {
  handleIssueWebhook,
  handleBreakdownRequest,
  triggerBreakdown,
} from "./webhook-handler";

export type {
  IssueWebhookPayload,
  BreakdownWebhookResult,
} from "./webhook-handler";
