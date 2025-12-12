## Summary

Implement Multi-Hop Retrieval that traverses relationships in the Knowledge Graph to find connected entities, enabling queries like "What files are affected if I change function X?"

## Background

Single-hop retrieval only finds directly matching entities. Multi-hop retrieval follows relationships:

```
Query: "What breaks if I change getUserById?"
                    
Single-hop: Returns just getUserById entity

Multi-hop:  getUserById 
               ↓ used_by
            UserService.getUser()
               ↓ used_by
            AuthController.login()
               ↓ used_by
            /api/auth/login endpoint

→ Returns full impact chain with 4 entities
```

## Requirements

### Relationship Types
```typescript
type RelationshipType =
  | "imports"      // A imports B
  | "exports"      // A exports B  
  | "extends"      // A extends B (class inheritance)
  | "implements"   // A implements B (interface)
  | "uses"         // A calls/references B
  | "used_by"      // Inverse of uses
  | "contains"     // File contains function
  | "depends_on"   // Package dependency
  | "supersedes";  // Temporal: A replaced B
```

### Query Interface
```typescript
interface HopQuery {
  startEntityId: string;
  relationshipTypes: RelationshipType[];  // Which edges to follow
  direction: "outbound" | "inbound" | "both";
  maxHops: number;                         // Depth limit (default: 3)
  includeInvalid: boolean;                 // Include superseded entities?
  asOfTime?: Date;                         // Point-in-time query
}

interface HopResult {
  entity: TemporalEntity;
  hopDistance: number;
  path: {
    relationship: RelationshipType;
    fromEntity: string;
    toEntity: string;
  }[];
}
```

### Implementation
1. Create `src/core/knowledge-graph/multi-hop-retriever.ts`
2. Implement BFS/DFS traversal with cycle detection
3. Support filtered traversal (only certain relationship types)
4. Respect temporal validity (don't traverse to invalid entities unless requested)
5. Optimize with graph indices

### Key Methods
```typescript
class MultiHopRetriever {
  // Find all entities reachable from start
  async traverse(query: HopQuery): Promise<HopResult[]>;
  
  // Find impact of changing an entity
  async findImpact(entityId: string, maxHops?: number): Promise<HopResult[]>;
  
  // Find all dependencies of an entity
  async findDependencies(entityId: string, maxHops?: number): Promise<HopResult[]>;
  
  // Find shortest path between two entities
  async findPath(fromId: string, toId: string): Promise<HopResult | null>;
}
```

### Database Query (PostgreSQL recursive CTE)
```sql
WITH RECURSIVE entity_graph AS (
  -- Base case: starting entity
  SELECT id, canonical_id, entity_data, 0 as hop_distance, 
         ARRAY[id] as path
  FROM knowledge_entities
  WHERE id = $1 AND valid_until IS NULL
  
  UNION ALL
  
  -- Recursive case: follow relationships
  SELECT e.id, e.canonical_id, e.entity_data, g.hop_distance + 1,
         g.path || e.id
  FROM knowledge_entities e
  JOIN entity_relationships r ON e.id = r.target_id
  JOIN entity_graph g ON r.source_id = g.id
  WHERE g.hop_distance < $2  -- max hops
    AND NOT e.id = ANY(g.path)  -- cycle detection
    AND e.valid_until IS NULL
)
SELECT * FROM entity_graph;
```

## Acceptance Criteria
- [ ] MultiHopRetriever class implemented
- [ ] BFS traversal with configurable depth
- [ ] Cycle detection to prevent infinite loops
- [ ] Temporal filtering (current vs point-in-time)
- [ ] findImpact() for change impact analysis
- [ ] findDependencies() for dependency tree
- [ ] Efficient recursive CTE query
- [ ] Unit tests for traversal scenarios

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
M - Graph traversal + recursive SQL

## Dependencies
- #232 Temporal Validity Tracker
- #231 Entity Resolution (for relationships)