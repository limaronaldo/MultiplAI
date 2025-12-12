## Summary

Implement an LLM judge alignment system to ensure automated evaluation graders produce results consistent with human judgment. This extends issue #238 (Evals Framework) with quality assurance for the grading process itself.

## Background

From OpenAI's "Building Resilient Prompts" cookbook:

> "After analyzing labeled samples, you can work to automate the process of evaluation by using LLMs as graders. These LLMs (referred to as "LLM judges") can quickly score outputs, check for specific criteria, and apply human-like judgment to a wide range of evaluation tasks."

The key insight: **An LLM judge is only useful if it agrees with human evaluators.** We need to measure and optimize this alignment.

---

## Alignment Metrics

### Core Metrics

| Metric | Formula | Target | Description |
|--------|---------|--------|-------------|
| **TPR** | True Positives / All Positives | > 80% | Does judge catch correct outputs? |
| **TNR** | True Negatives / All Negatives | > 80% | Does judge catch incorrect outputs? |
| **Accuracy** | (TP + TN) / Total | > 85% | Overall agreement with humans |

### Why Both TPR and TNR?

A judge that always says "PASS" would have 100% TPR but 0% TNR. We need both to be useful:

```
                    Human Label
                    PASS    FAIL
Judge Says PASS     TP      FP     ← Low TNR: misses bad outputs
Judge Says FAIL     FN      TN     ← Low TPR: misses good outputs
```

---

## Data Split Strategy

```
Human-labeled examples (100+ total)
              ↓
┌──────────────────────────────────────────────┐
│   TRAIN    │   VALIDATION   │     TEST       │
│   (20%)    │     (40%)      │    (40%)       │
│            │                │                │
│ Few-shot   │ Tune prompt    │ Final metrics  │
│ examples   │ until pass     │ (never tune)   │
└──────────────────────────────────────────────┘
```

### Why This Split?

- **Train (20%)**: Small set for few-shot examples in judge prompt
- **Validation (40%)**: Iterate on prompt until TPR/TNR targets met
- **Test (40%)**: Final evaluation - **never tune on this set**

The test set acts as holdout to detect overfitting to validation data.

---

## Implementation

### 1. Judge Configuration

```typescript
// src/core/evals/judge-config.ts
export interface JudgeConfig {
  model: string;                    // e.g., "gpt-5.2"
  targetTPR: number;                // e.g., 0.8
  targetTNR: number;                // e.g., 0.8
  trainExamples: LabeledExample[];  // 20% of data
  validationSet: LabeledExample[];  // 40% of data
  testSet: LabeledExample[];        // 40% of data
}

export interface LabeledExample {
  input: string;          // The input to the task
  output: string;         // The output being graded
  humanLabel: "pass" | "fail";
  reason?: string;        // Why human labeled this way
}
```

### 2. Judge Alignment Process

```typescript
// src/core/evals/judge-alignment.ts
export class JudgeAligner {
  private config: JudgeConfig;
  private currentPrompt: string;
  
  constructor(config: JudgeConfig) {
    this.config = config;
    this.currentPrompt = this.buildInitialPrompt();
  }

  async align(): Promise<AlignedJudge> {
    let iteration = 0;
    let metrics = await this.evaluateOnValidation();
    
    console.log(`[Judge] Initial: TPR=${metrics.tpr}, TNR=${metrics.tnr}`);
    
    while (
      (metrics.tpr < this.config.targetTPR || 
       metrics.tnr < this.config.targetTNR) && 
      iteration < 10
    ) {
      // Analyze failures
      const failures = await this.analyzeFailures(metrics);
      
      // Adjust prompt based on failure patterns
      this.currentPrompt = await this.improvePrompt(failures);
      
      // Re-evaluate
      metrics = await this.evaluateOnValidation();
      iteration++;
      
      console.log(`[Judge] Iteration ${iteration}: TPR=${metrics.tpr}, TNR=${metrics.tnr}`);
    }
    
    // Final evaluation on test set (never tuned on this)
    const finalMetrics = await this.evaluateOnTest();
    console.log(`[Judge] Final (test): TPR=${finalMetrics.tpr}, TNR=${finalMetrics.tnr}`);
    
    return new AlignedJudge({
      prompt: this.currentPrompt,
      model: this.config.model,
      metrics: finalMetrics,
    });
  }

  private buildInitialPrompt(): string {
    const fewShotExamples = this.config.trainExamples
      .slice(0, 5)  // Use top 5 from train set
      .map(ex => `
Input: ${ex.input}
Output: ${ex.output}
Grade: ${ex.humanLabel.toUpperCase()}
Reason: ${ex.reason ?? "N/A"}
`).join("\n---\n");

    return `You are a code quality judge. Grade the following output as PASS or FAIL.

## Examples

${fewShotExamples}

## Instructions

- PASS: Output correctly solves the task
- FAIL: Output has errors, is incomplete, or doesn't meet requirements

Respond with:
- Grade: PASS or FAIL
- Reason: Brief explanation
`;
  }

  private async evaluateOnValidation(): Promise<JudgeMetrics> {
    return this.evaluate(this.config.validationSet);
  }

  private async evaluateOnTest(): Promise<JudgeMetrics> {
    return this.evaluate(this.config.testSet);
  }

  private async evaluate(examples: LabeledExample[]): Promise<JudgeMetrics> {
    let tp = 0, fp = 0, fn = 0, tn = 0;
    
    for (const example of examples) {
      const judgeResult = await this.runJudge(example);
      const humanLabel = example.humanLabel;
      
      if (judgeResult === "pass" && humanLabel === "pass") tp++;
      else if (judgeResult === "pass" && humanLabel === "fail") fp++;
      else if (judgeResult === "fail" && humanLabel === "pass") fn++;
      else if (judgeResult === "fail" && humanLabel === "fail") tn++;
    }
    
    const tpr = tp / (tp + fn) || 0;  // Sensitivity
    const tnr = tn / (tn + fp) || 0;  // Specificity
    const accuracy = (tp + tn) / examples.length;
    
    return { tp, fp, fn, tn, tpr, tnr, accuracy };
  }

  private async runJudge(example: LabeledExample): Promise<"pass" | "fail"> {
    const response = await llm.complete({
      model: this.config.model,
      messages: [
        { role: "system", content: this.currentPrompt },
        { role: "user", content: `Input: ${example.input}\nOutput: ${example.output}` },
      ],
    });
    
    const grade = response.toLowerCase().includes("grade: pass") ? "pass" : "fail";
    return grade;
  }

  private async analyzeFailures(metrics: JudgeMetrics): Promise<FailureAnalysis> {
    // Identify false positives and false negatives
    // Group by failure pattern using Open Coding → Axial Coding
    // Return patterns for prompt improvement
  }

  private async improvePrompt(failures: FailureAnalysis): Promise<string> {
    // Add examples of failure cases
    // Clarify ambiguous criteria
    // Add explicit rules for edge cases
  }
}
```

### 3. Grader Types

```typescript
// src/core/evals/graders.ts
export type GraderType = 
  | "string_check"    // Exact or contains match
  | "text_similarity" // Cosine similarity threshold
  | "score_model"     // Numeric rating (1-5)
  | "label_model"     // Classification (pass/fail)
  | "python_code";    // Custom Python logic

export interface Grader {
  type: GraderType;
  evaluate(input: string, output: string): Promise<GradeResult>;
}

// String check grader
export class StringCheckGrader implements Grader {
  type: GraderType = "string_check";
  
  constructor(private criteria: {
    contains?: string[];
    notContains?: string[];
    exact?: string;
  }) {}
  
  async evaluate(input: string, output: string): Promise<GradeResult> {
    let pass = true;
    const reasons: string[] = [];
    
    if (this.criteria.exact !== undefined) {
      pass = output === this.criteria.exact;
      if (!pass) reasons.push("Does not match exact expected value");
    }
    
    if (this.criteria.contains) {
      for (const term of this.criteria.contains) {
        if (!output.includes(term)) {
          pass = false;
          reasons.push(`Missing required term: ${term}`);
        }
      }
    }
    
    if (this.criteria.notContains) {
      for (const term of this.criteria.notContains) {
        if (output.includes(term)) {
          pass = false;
          reasons.push(`Contains forbidden term: ${term}`);
        }
      }
    }
    
    return { 
      grade: pass ? "pass" : "fail", 
      reason: reasons.join("; ") || "All criteria met" 
    };
  }
}

// LLM label grader (uses aligned judge)
export class LabelModelGrader implements Grader {
  type: GraderType = "label_model";
  
  constructor(private judge: AlignedJudge) {}
  
  async evaluate(input: string, output: string): Promise<GradeResult> {
    return this.judge.grade(input, output);
  }
}
```

### 4. Failure Mode Analysis (Open/Axial Coding)

```typescript
// src/core/evals/failure-analysis.ts
export interface FailureCase {
  example: LabeledExample;
  judgeResult: "pass" | "fail";
  humanLabel: "pass" | "fail";
  errorType: "false_positive" | "false_negative";
}

export class FailureAnalyzer {
  // Step 1: Open Coding - tag each failure with descriptive labels
  async openCode(failures: FailureCase[]): Promise<TaggedFailure[]> {
    const tagged: TaggedFailure[] = [];
    
    for (const failure of failures) {
      // Use LLM to identify why the judge was wrong
      const analysis = await llm.complete({
        model: "gpt-5.2",
        messages: [
          { role: "system", content: `Analyze why this grading was incorrect.` },
          { role: "user", content: `
Input: ${failure.example.input}
Output: ${failure.example.output}
Judge said: ${failure.judgeResult}
Human said: ${failure.humanLabel}

What specific aspect did the judge miss or misunderstand?
Provide a short tag (2-4 words) describing the failure mode.
` }
        ]
      });
      
      tagged.push({
        ...failure,
        tag: analysis.trim(),
      });
    }
    
    return tagged;
  }
  
  // Step 2: Axial Coding - group tags into categories
  async axialCode(tagged: TaggedFailure[]): Promise<FailureCategory[]> {
    const tagCounts = new Map<string, number>();
    
    for (const failure of tagged) {
      tagCounts.set(failure.tag, (tagCounts.get(failure.tag) ?? 0) + 1);
    }
    
    // Group similar tags using LLM
    const categories = await llm.complete({
      model: "gpt-5.2",
      messages: [
        { role: "system", content: "Group these failure tags into 3-5 categories." },
        { role: "user", content: `Tags and counts:\n${
          Array.from(tagCounts.entries())
            .map(([tag, count]) => `- ${tag}: ${count}`)
            .join("\n")
        }` }
      ]
    });
    
    return this.parseCategories(categories);
  }
}
```

---

## AutoDev Grader Examples

| Task Output | Grader | Criteria |
|-------------|--------|----------|
| **Diff validity** | Python code | `parse_diff(output) != null` |
| **Test result** | String check | Contains "PASS" or "FAIL" |
| **Code quality** | Score model | Rating 1-5, pass if >= 3 |
| **DoD completion** | Label model | All acceptance criteria met |
| **PR description** | Label model | Clear, complete, follows template |

### Example: Diff Quality Grader

```typescript
const diffQualityGrader = new LabelModelGrader(
  await alignJudge({
    model: "gpt-5.2",
    targetTPR: 0.85,
    targetTNR: 0.85,
    trainExamples: [
      { input: "Add logging", output: validDiff, humanLabel: "pass" },
      { input: "Add logging", output: syntaxErrorDiff, humanLabel: "fail" },
      // ... more examples
    ],
    validationSet: [...],  // 40% of labeled examples
    testSet: [...],        // 40% of labeled examples
  })
);
```

---

## Configuration

```bash
# Enable evals with judge alignment
ENABLE_EVALS=true
EVAL_JUDGE_MODEL=gpt-5.2
EVAL_TARGET_TPR=0.8
EVAL_TARGET_TNR=0.8
EVAL_MAX_ALIGNMENT_ITERATIONS=10
```

---

## Database Schema

```sql
-- Store aligned judge configurations
CREATE TABLE eval_judges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  model VARCHAR(100) NOT NULL,
  prompt TEXT NOT NULL,
  
  -- Alignment metrics
  tpr DECIMAL(5,4),
  tnr DECIMAL(5,4),
  accuracy DECIMAL(5,4),
  
  -- Data split sizes
  train_count INT,
  validation_count INT,
  test_count INT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Store grading results
CREATE TABLE eval_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  judge_id UUID REFERENCES eval_judges(id),
  task_id UUID REFERENCES tasks(id),
  
  input TEXT NOT NULL,
  output TEXT NOT NULL,
  grade VARCHAR(10) NOT NULL,  -- pass/fail
  reason TEXT,
  
  -- For alignment feedback
  human_override VARCHAR(10),  -- null if human agreed
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Acceptance Criteria

- [ ] JudgeConfig and LabeledExample types
- [ ] JudgeAligner class with TPR/TNR optimization
- [ ] String check grader
- [ ] Label model grader (using aligned judge)
- [ ] Failure analysis with Open/Axial coding
- [ ] Database schema for judges and grades
- [ ] API endpoint for running evals
- [ ] Dashboard integration for reviewing grades
- [ ] Documentation for creating custom graders

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

**M** - New subsystem, requires labeled data, iterative alignment

## Dependencies

- Issue #238 (Evals Framework) - provides base infrastructure

## References

- [OpenAI Building Resilient Prompts](https://cookbook.openai.com/articles/techniques_to_improve_reliability)
- [OpenAI Datasets & Evals](https://platform.openai.com/docs/guides/evals)
