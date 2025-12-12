## Summary

Integrate the Temporal Knowledge Graph with AutoDev's orchestrator to enhance context retrieval for coding and fixing tasks.

## Background

Once the Knowledge Graph is populated, AutoDev can use it to:
1. Provide better context to Coder/Fixer agents
2. Predict impact of changes before applying diffs
3. Avoid breaking changes by understanding dependencies
4. Learn from historical patterns with temporal awareness

## Requirements

### Integration Points

#### 1. Pre-Coding Context Enhancement
Before CoderAgent runs, query Knowledge Graph for:
- Target file entities and their dependencies
- Recent changes to related entities
- Known patterns for similar changes

```typescript
// In orchestrator.ts
async function enhanceContextWithKnowledgeGraph(task: Task): Promise<EnhancedContext> {
  const targetEntities = await knowledgeGraph.getEntitiesForFiles(task.targetFiles);
  const dependencies = await multiHopRetriever.findDependencies(targetEntities);
  const recentChanges = await temporalTracker.getRecentChanges(targetEntities, 7); // last 7 days
  
  return {
    entities: targetEntities,
    dependencies,
    recentChanges,
    impactRadius: dependencies.length,
  };
}
```

#### 2. Pre-Apply Impact Analysis
Before applying a diff, analyze potential impact:

```typescript
async function analyzeImpact(diff: string, task: Task): Promise<ImpactAnalysis> {
  const modifiedEntities = await entityExtractor.extractFromDiff(diff);
  const impacted = await multiHopRetriever.findImpact(modifiedEntities);
  
  return {
    directChanges: modifiedEntities.length,
    impactedEntities: impacted.length,
    riskLevel: calculateRisk(impacted),
    warnings: generateWarnings(impacted),
  };
}
```

#### 3. Post-Apply Knowledge Update
After successfully applying changes:

```typescript
async function updateKnowledgeGraph(task: Task, commitSha: string): Promise<void> {
  // Extract entities from modified files
  const newEntities = await entityExtractor.extractFromFiles(task.targetFiles);
  
  // Resolve and update
  const resolved = await entityResolver.resolve(newEntities);
  
  // Detect invalidations
  const invalidations = await invalidationAgent.detect(resolved, commitSha);
  
  // Apply updates
  await temporalTracker.applyUpdates(resolved, invalidations, commitSha);
}
```

#### 4. Enhanced Fix Context
When FixerAgent runs, provide:
- Entity history (what changed recently)
- Related fixes (temporal learning)
- Dependency chain that might be affected

### New Orchestrator Methods

```typescript
class Orchestrator {
  // Existing methods...
  
  // New Knowledge Graph integration
  private knowledgeGraph: KnowledgeGraphService;
  
  async runCodingWithKnowledge(task: Task): Promise<CoderOutput> {
    const context = await this.enhanceContextWithKnowledgeGraph(task);
    const coderOutput = await this.runCoding(task, context);
    
    // Analyze impact before proceeding
    const impact = await this.analyzeImpact(coderOutput.diff, task);
    if (impact.riskLevel === "high") {
      task.warnings = impact.warnings;
    }
    
    return coderOutput;
  }
  
  async onTaskComplete(task: Task, commitSha: string): Promise<void> {
    await this.updateKnowledgeGraph(task, commitSha);
  }
}
```

### Configuration

```bash
# Environment variables
ENABLE_KNOWLEDGE_GRAPH=true
KNOWLEDGE_GRAPH_MAX_HOPS=3
KNOWLEDGE_GRAPH_SYNC_ON_PUSH=true
```

## Acceptance Criteria
- [ ] KnowledgeGraphService class integrating all components
- [ ] Pre-coding context enhancement working
- [ ] Impact analysis before diff application
- [ ] Post-apply knowledge graph updates
- [ ] Enhanced fixer context with entity history
- [ ] Feature flag to enable/disable (ENABLE_KNOWLEDGE_GRAPH)
- [ ] Integration tests with mock knowledge graph

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

## Complexity
M - Integration across multiple components

## Dependencies
- #230 Entity Extraction Agent
- #231 Entity Resolution
- #232 Temporal Validity Tracker
- #233 Invalidation Agent
- #234 Multi-Hop Retrieval
- #235 Database Schema