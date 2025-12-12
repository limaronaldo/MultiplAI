## Summary

Implement a distillation pipeline to train smaller, faster models from successful AutoDev outputs, reducing cost and latency while maintaining quality.

## Background

From OpenAI's Model Optimization track:
> "Distillation is a way to transfer a stronger model's behavior to a smaller 'student' model, maintaining performance while improving speed and cost."

AutoDev generates successful diffs daily with Opus/GPT-5.2. This is valuable training data that could be used to fine-tune smaller models (like Grok Fast) to handle XS-low tasks with equal quality at 10-50x lower cost.

## Requirements

### Distillation Workflow

```
1. Collect successful task outputs (input → output pairs)
2. Filter for high-quality examples (tests passed, PR merged)
3. Create eval set to measure baseline performance
4. Fine-tune smaller model on collected examples
5. Evaluate fine-tuned model against baseline
6. Deploy if quality threshold met
```

### Data Collection

```typescript
interface DistillationExample {
  // Input
  issueTitle: string;
  issueBody: string;
  targetFiles: string[];
  fileContents: Record<string, string>;
  plan: string;
  
  // Output (from successful task)
  diff: string;
  commitMessage: string;
  
  // Metadata
  sourceModel: string;      // e.g., "claude-opus-4-5"
  complexity: string;
  effort: string;
  tokensUsed: number;
  
  // Quality signals
  testsPassed: boolean;
  reviewApproved: boolean;
  prMerged: boolean;
  humanEditsRequired: number; // Lines changed by human
}
```

### Database Schema

```sql
CREATE TABLE distillation_examples (
  id UUID PRIMARY KEY,
  task_id UUID REFERENCES tasks(id),
  
  -- Input
  issue_title TEXT NOT NULL,
  issue_body TEXT,
  target_files TEXT[],
  file_contents JSONB,
  plan TEXT,
  
  -- Output
  diff TEXT NOT NULL,
  commit_message TEXT,
  
  -- Metadata
  source_model VARCHAR(100),
  complexity VARCHAR(10),
  effort VARCHAR(20),
  tokens_used INTEGER,
  
  -- Quality signals
  tests_passed BOOLEAN,
  review_approved BOOLEAN,
  pr_merged BOOLEAN,
  human_edits INTEGER DEFAULT 0,
  
  -- Distillation status
  included_in_training BOOLEAN DEFAULT false,
  training_job_id VARCHAR(100),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_de_quality ON distillation_examples(tests_passed, review_approved, pr_merged);
CREATE INDEX idx_de_complexity ON distillation_examples(complexity, effort);
```

### Quality Filtering

Only include examples that meet criteria:
```typescript
function isHighQualityExample(example: DistillationExample): boolean {
  return (
    example.testsPassed &&
    example.reviewApproved &&
    example.prMerged &&
    example.humanEditsRequired <= 5 &&  // Minimal human cleanup
    example.tokensUsed < 10000          // Not overly complex
  );
}
```

### Fine-Tuning Integration

```typescript
// src/core/distillation/trainer.ts
export class DistillationTrainer {
  async collectExamples(
    minExamples: number = 50,
    targetComplexity?: string
  ): Promise<DistillationExample[]>;
  
  async exportToJSONL(
    examples: DistillationExample[],
    outputPath: string
  ): Promise<void>;
  
  async startFineTuning(
    baseModel: string,           // e.g., "gpt-4o-mini"
    trainingFile: string,
    validationFile?: string
  ): Promise<string>;            // Returns job ID
  
  async evaluateModel(
    modelId: string,
    evalSet: DistillationExample[]
  ): Promise<EvalResults>;
}
```

### Target Models for Distillation

| Source Model | Target Model | Use Case |
|--------------|--------------|----------|
| claude-opus-4-5 | gpt-4o-mini | XS-low tasks |
| gpt-5.2 | grok-code-fast | Simple fixes |
| Multi-agent consensus | Single fine-tuned | Reduce multi-agent cost |

### API Endpoints

```
GET  /api/distillation/examples       - List collected examples
POST /api/distillation/collect        - Trigger collection from recent tasks
POST /api/distillation/train          - Start fine-tuning job
GET  /api/distillation/jobs/:id       - Get training job status
POST /api/distillation/evaluate       - Evaluate fine-tuned model
POST /api/distillation/deploy         - Deploy model to production tier
```

### Configuration

```bash
ENABLE_DISTILLATION=true
DISTILLATION_MIN_EXAMPLES=50
DISTILLATION_QUALITY_THRESHOLD=0.9    # 90% of baseline performance
DISTILLATION_AUTO_COLLECT=true        # Auto-collect from successful tasks
```

## Acceptance Criteria
- [ ] DistillationExample schema and database migration
- [ ] Auto-collection from successful tasks (on PR merge)
- [ ] Quality filtering logic
- [ ] Export to JSONL for OpenAI fine-tuning
- [ ] Fine-tuning job management
- [ ] Evaluation against baseline
- [ ] API endpoints for management
- [ ] Integration with model-selection.ts for deployment
- [ ] Documentation for distillation workflow

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
M - Multiple components, external API integration

## References
- OpenAI Fine-tuning API
- OpenAI Model Optimization track: "Distillation"
- OpenAI Cookbook: Distillation examples