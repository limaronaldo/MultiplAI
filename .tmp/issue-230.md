## Summary

Implement an Entity Extraction Agent that extracts structured entities from codebase files for the Temporal Knowledge Graph system.

## Background

Traditional RAG has limitations with stale information and no time awareness. A Temporal Knowledge Graph tracks entities with temporal validity, enabling queries like "What was the API signature last week?" or "When did this function change?"

## Requirements

### Entity Types to Extract
- **Functions**: name, signature, file, line range, dependencies
- **Classes**: name, methods, properties, inheritance
- **APIs**: endpoints, parameters, return types
- **Constants/Config**: name, value, usage locations
- **Types/Interfaces**: name, properties, used by

### Output Schema
```typescript
interface ExtractedEntity {
  id: string;
  type: "function" | "class" | "api" | "constant" | "type";
  name: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  signature?: string;
  dependencies: string[];  // references to other entity IDs
  metadata: Record<string, unknown>;
  extractedAt: Date;
  confidence: number;
}
```

### Implementation
1. Create `src/agents/entity-extractor.ts` extending BaseAgent
2. Use LLM to parse code and extract structured entities
3. Support TypeScript, JavaScript initially (extensible to other languages)
4. Include confidence scores for extraction quality

## Acceptance Criteria
- [ ] EntityExtractorAgent class implemented
- [ ] Extracts functions, classes, and types from TS/JS files
- [ ] Returns structured entities with confidence scores
- [ ] Unit tests for extraction accuracy
- [ ] Integrates with existing agent pattern (BaseAgent)

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
S - Single agent, well-defined input/output

## References
- OpenAI Cookbook: Temporal Agents with Knowledge Graphs
- Existing agents in `src/agents/`