## Summary

Implement Entity Resolution that deduplicates extracted entities and links them to existing entities in the Knowledge Graph.

## Background

When extracting entities from multiple files or across time, the same logical entity may be extracted multiple times. Entity Resolution:
1. Identifies when two extractions refer to the same entity
2. Merges metadata from multiple sources
3. Creates relationships between related entities

## Requirements

### Resolution Strategies
- **Exact Match**: Same name + same file path
- **Signature Match**: Same function signature, different location (moved/renamed file)
- **Fuzzy Match**: Similar names with high cosine similarity (refactored names)
- **Relationship Inference**: If A imports B, create dependency edge

### Output
```typescript
interface ResolvedEntity extends ExtractedEntity {
  canonicalId: string;        // Stable ID across extractions
  aliases: string[];          // Previous names/locations
  relationships: {
    type: "imports" | "extends" | "implements" | "uses" | "supersedes";
    targetId: string;
  }[];
  mergedFrom: string[];       // IDs of extracted entities that were merged
}
```

### Implementation
1. Create `src/core/knowledge-graph/entity-resolver.ts`
2. Use embedding similarity for fuzzy matching
3. Track entity lineage (what was merged into what)
4. Handle rename detection (file moved, function renamed)

## Acceptance Criteria
- [ ] EntityResolver class implemented
- [ ] Exact and signature matching working
- [ ] Fuzzy matching with configurable threshold
- [ ] Relationship inference from imports/extends
- [ ] Merge history tracked
- [ ] Unit tests for resolution scenarios

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
S - Algorithmic but bounded scope

## Dependencies
- #230 Entity Extraction Agent