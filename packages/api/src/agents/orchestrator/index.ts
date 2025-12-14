// Orchestrator Agent - Coordinates complex task breakdown
// Key principle: "The agent is just a policy that transforms
// one consistent memory state into another."

export { OrchestratorAgent } from "./orchestrator-agent";

// Type exports
export type {
  OrchestratorInput,
  OrchestratorOutput,
  SubtaskDefinition,
  ExecutionPlan,
  AggregationStrategy,
  DependencyGraph,
  DependencyNode,
} from "./types";

// Schema exports (runtime values)
export {
  OrchestratorInputSchema,
  OrchestratorOutputSchema,
  SubtaskDefinitionSchema,
  ExecutionPlanSchema,
  AggregationStrategySchema,
  createSkipOutput,
  createOrchestratorOutput,
  validateSubtasks,
  buildDependencyGraph,
} from "./types";

// Breakdown logic
export {
  breakdownIntoSubtasks,
  groupRelatedChanges,
  deriveSubtaskCriteria,
  detectDependencies,
} from "./breakdown";

// Execution plan
export {
  buildExecutionPlan,
  topologicalSort,
  findParallelGroups,
  calculateCriticalPath,
  validateNoCycles,
  estimateExecutionTime,
  getExecutionProgress,
  getNextExecutableSubtasks,
  visualizeExecutionPlan,
} from "./execution-plan";
