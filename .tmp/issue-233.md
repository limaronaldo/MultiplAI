## Summary

Implement an Invalidation Agent that detects when new information contradicts existing knowledge and marks outdated entities as superseded.

## Background

When code changes, some facts become invalid:
- Function signature changes → old signature invalid
- File renamed → old path invalid  
- Constant value changed → old value invalid
- Function deleted → entity should be marked as ended

The Invalidation Agent automatically detects these contradictions and updates temporal validity.

## Requirements

### Invalidation Triggers
1. **Direct Contradiction**: New entity has same canonicalId but different value
2. **Deletion**: Entity existed in commit N but not in commit N+1
3. **Semantic Change**: LLM detects breaking change in behavior
4. **Cascade**: If A depends on B and B is invalidated, flag A for review

### Invalidation Types
```typescript
type InvalidationReason = 
  | "deleted"           // Entity no longer exists
  | "superseded"        // New version exists
  | "signature_change"  // Breaking API change
  | "semantic_change"   // Behavior changed
  | "cascade"           // Dependency was invalidated
  | "manual";           // Human marked as invalid

interface InvalidationEvent {
  entityId: string;
  reason: InvalidationReason;
  supersededBy?: string;
  detectedAt: Date;
  commitSha: string;
  confidence: number;
  details: string;
}
```

### Implementation
1. Create `src/agents/invalidation-agent.ts` extending BaseAgent
2. Compare old vs new entity states
3. Use LLM for semantic change detection
4. Emit invalidation events for downstream processing
5. Support cascade invalidation with configurable depth

### Agent Flow
```
Input: {
  oldEntities: TemporalEntity[],   // Current knowledge
  newEntities: ResolvedEntity[],   // Fresh extraction
  commitSha: string
}

Output: {
  invalidations: InvalidationEvent[],
  updates: TemporalEntity[],       // Entities that need version bump
  unchanged: string[]              // Entity IDs with no changes
}
```

## Acceptance Criteria
- [ ] InvalidationAgent class implemented
- [ ] Detects deletions (entity missing from new extraction)
- [ ] Detects supersession (same entity, different content)
- [ ] LLM-based semantic change detection
- [ ] Cascade invalidation for dependencies
- [ ] Confidence scoring for invalidation decisions
- [ ] Integration with TemporalTracker

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
M - Agent + comparison logic + LLM calls

## Dependencies
- #230 Entity Extraction Agent
- #231 Entity Resolution
- #232 Temporal Validity Tracker