## Summary

Implement a comprehensive evaluation framework to measure and track AutoDev task quality over time, enabling data-driven improvements and model comparisons.

## Background

From OpenAI's production track:
> "Evals are how you measure and improve your AI app's behavior. They help verify correctness, enforce guardrails, and track quality over time so you can ship with confidence."

AutoDev currently lacks systematic evaluation of:
- Code quality of generated diffs
- Success rates by complexity/effort
- Model performance comparisons
- Fix loop frequency

## Requirements

### Metrics to Track

```typescript
interface TaskEvalMetrics {
  taskId: string;
  
  // Success metrics
  succeeded: boolean;
  attemptsRequired: number;
  fixLoopsTriggered: number;
  
  // Quality metrics
  diffLinesGenerated: number;
  diffLinesNeeded: number;  // After human cleanup
  codeQualityScore: number; // 0-100, from grader
  
  // Efficiency metrics  
  totalTokensUsed: number;
  totalCostUsd: number;
  totalDurationMs: number;
  
  // Model info
  modelsUsed: string[];
  finalModel: string;
  
  // Context
  complexity: "XS" | "S" | "M" | "L" | "XL";
  effort: "low" | "medium" | "high";
  repo: string;
}
```

### Eval Types

1. **Correctness Evals**
   - Did tests pass?
   - Did review approve?
   - Was PR merged without changes?

2. **Quality Evals**
   - Diff size vs optimal (human benchmark)
   - Code style compliance
   - No unnecessary changes

3. **Efficiency Evals**
   - Tokens per successful task
   - Cost per successful task
   - Time to completion

### Database Schema

```sql
CREATE TABLE task_evals (
  id UUID PRIMARY KEY,
  task_id UUID REFERENCES tasks(id),
  
  -- Success
  succeeded BOOLEAN NOT NULL,
  attempts_required INTEGER,
  fix_loops INTEGER,
  
  -- Quality
  diff_lines_generated INTEGER,
  diff_lines_final INTEGER,
  code_quality_score DECIMAL(5,2),
  
  -- Efficiency
  total_tokens INTEGER,
  total_cost_usd DECIMAL(10,4),
  total_duration_ms INTEGER,
  
  -- Context
  models_used TEXT[],
  final_model VARCHAR(100),
  complexity VARCHAR(10),
  effort VARCHAR(20),
  
  evaluated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE eval_benchmarks (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  metric VARCHAR(50) NOT NULL,
  threshold DECIMAL(10,4),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### API Endpoints

```
GET  /api/evals/tasks/:taskId     - Get eval for specific task
GET  /api/evals/summary           - Aggregated metrics
GET  /api/evals/by-model          - Compare model performance
GET  /api/evals/by-complexity     - Metrics by task complexity
GET  /api/evals/trends            - Performance over time
POST /api/evals/benchmark         - Create/run benchmark
```

### Dashboard Integration

Add to autodev-dashboard:
- Success rate chart (by day, week, month)
- Model comparison table
- Cost per task trend
- Fix loop frequency

## Implementation

1. Create `src/core/evals/` directory
2. Implement `EvalCollector` - gathers metrics during task execution
3. Implement `EvalAnalyzer` - computes aggregates and trends
4. Add database migration for eval tables
5. Add API endpoints to router
6. Create dashboard components

## Acceptance Criteria
- [ ] TaskEvalMetrics collected for every completed task
- [ ] Database schema and migrations
- [ ] API endpoints for querying evals
- [ ] Summary endpoint with aggregates
- [ ] Model comparison endpoint
- [ ] Basic dashboard visualization
- [ ] Unit tests for eval collection

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
M - Multiple components, dashboard integration

## References
- OpenAI Evals API pattern
- OpenAI production track: "Constructing Evals"