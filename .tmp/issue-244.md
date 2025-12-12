## Summary

Integrate OpenAI's Prompt Optimizer to automatically improve AutoDev agent prompts based on task success/failure data and annotations.

## Background

From OpenAI's Prompt Optimizer documentation:
> "The prompt optimizer takes your generated output, custom annotation columns, and graders into consideration to construct an improved prompt."

AutoDev has extensive task history with success/failure signals that can be used to optimize prompts for Planner, Coder, Fixer, and Reviewer agents.

## The Evaluation Flywheel

OpenAI recommends a continuous improvement cycle:

```
    ┌─────────────┐
    │   ANALYZE   │ ← Manual review, annotation
    │  (Open/Axial│   identify failure modes
    │   Coding)   │
    └──────┬──────┘
           │
           ↓
    ┌─────────────┐
    │   MEASURE   │ ← Automated graders
    │  (Graders   │   quantify failures
    │   Evals)    │
    └──────┬──────┘
           │
           ↓
    ┌─────────────┐
    │   IMPROVE   │ ← Prompt optimization
    │  (Optimize  │   targeted improvements
    │   Prompt)   │
    └──────┬──────┘
           │
           └────→ Repeat
```

## Requirements

### Data Collection for Optimization

```typescript
interface PromptOptimizationDataset {
  promptId: string;         // e.g., "planner", "coder", "fixer"
  version: number;
  
  rows: {
    // Input
    input: Record<string, string>;  // Variables passed to prompt
    
    // Output
    output: string;                 // Model response
    
    // Annotations
    rating: "good" | "bad";
    outputFeedback?: string;        // Text critique
    
    // Custom annotations (axial codes)
    failureMode?: string;           // e.g., "wrong_files", "incomplete_diff"
    
    // Ground truth (for graders)
    expectedFiles?: string[];
    testsPassed?: boolean;
    prMerged?: boolean;
  }[];
}
```

### Failure Mode Taxonomy (Axial Codes)

| Agent | Failure Modes |
|-------|---------------|
| **Planner** | wrong_files, missing_acceptance_criteria, wrong_complexity, incomplete_plan |
| **Coder** | syntax_error, incomplete_diff, wrong_approach, missing_imports |
| **Fixer** | same_error_repeated, introduced_new_bug, wrong_fix_location |
| **Reviewer** | false_positive, false_negative, unclear_feedback |

### Graders for AutoDev

```typescript
// Grader types we need
interface AutoDevGraders {
  // String check
  filesMatch: {
    type: "string_check";
    compare: "targetFiles";
    reference: "expectedFiles";
  };
  
  // Python code execution
  diffValid: {
    type: "python";
    code: "return parse_diff(output) is not None";
  };
  
  // LLM grader (label)
  codeQuality: {
    type: "label_model";
    labels: ["excellent", "good", "needs_improvement", "poor"];
    prompt: "Evaluate the code quality...";
  };
  
  // LLM grader (score)
  planCompleteness: {
    type: "score_model";
    range: [1, 5];
    prompt: "Rate how complete this plan is...";
  };
}
```

### Integration with OpenAI Platform

```typescript
// src/core/prompt-optimization/optimizer.ts
export class PromptOptimizer {
  // Export dataset for OpenAI Platform
  async exportDataset(
    promptId: string,
    options: { minRows?: number; includeAnnotations?: boolean }
  ): Promise<DatasetExport>;
  
  // Import optimized prompt from Platform
  async importOptimizedPrompt(
    promptId: string,
    newVersion: string
  ): Promise<void>;
  
  // Track prompt versions
  async listPromptVersions(promptId: string): Promise<PromptVersion[]>;
  
  // A/B test prompts
  async startABTest(
    promptId: string,
    versionA: string,
    versionB: string,
    trafficSplit: number
  ): Promise<ABTest>;
}
```

### Workflow

1. **Collect data** from task executions (input, output, success/failure)
2. **Annotate** failures with failure modes (manual or automated)
3. **Export** dataset to OpenAI Platform
4. **Run** prompt optimizer on Platform
5. **Import** optimized prompt back to AutoDev
6. **A/B test** old vs new prompt
7. **Deploy** if metrics improve

### Database Schema

```sql
CREATE TABLE prompt_versions (
  id UUID PRIMARY KEY,
  prompt_id VARCHAR(50) NOT NULL,  -- planner, coder, fixer, reviewer
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT false,
  
  -- Performance metrics
  tasks_executed INTEGER DEFAULT 0,
  success_rate DECIMAL(5,2),
  avg_tokens INTEGER,
  
  UNIQUE(prompt_id, version)
);

CREATE TABLE prompt_optimization_data (
  id UUID PRIMARY KEY,
  prompt_id VARCHAR(50) NOT NULL,
  task_id UUID REFERENCES tasks(id),
  
  -- Input/Output
  input_variables JSONB,
  output TEXT,
  
  -- Annotations
  rating VARCHAR(10),
  output_feedback TEXT,
  failure_mode VARCHAR(50),
  
  -- Grader results
  grader_results JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### API Endpoints

```
GET  /api/prompts                         - List all prompts with versions
GET  /api/prompts/:id/versions            - List versions for prompt
POST /api/prompts/:id/export              - Export dataset for optimization
POST /api/prompts/:id/import              - Import optimized prompt
POST /api/prompts/:id/ab-test             - Start A/B test
GET  /api/prompts/:id/ab-test/results     - Get A/B test results
POST /api/prompts/:id/deploy/:version     - Deploy specific version
```

### Configuration

```bash
ENABLE_PROMPT_OPTIMIZATION=true
PROMPT_AB_TEST_TRAFFIC_SPLIT=0.5    # 50% to each version
PROMPT_MIN_SAMPLES_FOR_OPTIMIZATION=50
```

## Acceptance Criteria
- [ ] Prompt version tracking in database
- [ ] Data collection from task executions
- [ ] Annotation support for failure modes
- [ ] Dataset export for OpenAI Platform
- [ ] Prompt import from Platform
- [ ] A/B testing infrastructure
- [ ] API endpoints for prompt management
- [ ] Grader definitions for each agent
- [ ] Documentation for optimization workflow

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
M - Multiple components, Platform integration

## References
- OpenAI Prompt Optimizer documentation
- OpenAI Datasets documentation
- OpenAI Cookbook: Building resilient prompts with evals