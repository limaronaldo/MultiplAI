## Goal
Implement an agentic loop where MultiplAI can iterate multiple times on planning, coding, and testing until success.

## Why This Matters
- Current: Plan once → Code once → Fix if tests fail (max 3x)
- Agentic: Plan → Code → Test → Reflect → Replan → Recode → ...
- Enables handling ambiguous requirements and complex debugging

## Implementation

### Agentic Loop Architecture
```
                    ┌──────────────────────────────────────┐
                    │                                      │
                    ▼                                      │
              ┌─────────┐                                  │
              │  PLAN   │                                  │
              └────┬────┘                                  │
                   │                                       │
                   ▼                                       │
              ┌─────────┐                                  │
              │  CODE   │                                  │
              └────┬────┘                                  │
                   │                                       │
                   ▼                                       │
              ┌─────────┐     fail                         │
              │  TEST   │──────────┐                       │
              └────┬────┘          │                       │
                   │ pass          ▼                       │
                   │         ┌──────────┐                  │
                   │         │ REFLECT  │──────────────────┘
                   │         └──────────┘   (replan needed)
                   │               │
                   │               │ (minor fix)
                   │               ▼
                   │         ┌─────────┐
                   │         │   FIX   │───┐
                   │         └─────────┘   │
                   │                       │
                   ▼                       ▼
              ┌─────────┐           ┌─────────┐
              │ REVIEW  │           │  TEST   │
              └────┬────┘           └─────────┘
                   │
                   ▼
                SUCCESS
```

### ReflectionAgent
```typescript
// src/agents/reflection.ts
interface ReflectionOutput {
  diagnosis: string;           // What went wrong
  rootCause: 'plan' | 'code' | 'test' | 'environment';
  recommendation: 'replan' | 'fix' | 'abort';
  feedback: string;            // Specific guidance for next iteration
  confidence: number;          // 0-1, abort if too low after N attempts
}

class ReflectionAgent extends BaseAgent<ReflectionInput, ReflectionOutput> {
  async run(input: {
    originalIssue: string;
    plan: string[];
    diff: string;
    testOutput: string;
    attemptNumber: number;
  }): Promise<ReflectionOutput> {
    // Analyze what went wrong
    // Determine if it's a planning issue or implementation bug
    // Provide actionable feedback
  }
}
```

### Loop Controller
```typescript
// src/core/agentic-loop.ts
interface LoopConfig {
  maxIterations: 5;
  maxReplans: 2;
  confidenceThreshold: 0.3;  // Abort if confidence drops below
}

async function agenticLoop(task: Task, config: LoopConfig): Promise<Result> {
  let iteration = 0;
  let replans = 0;
  
  while (iteration < config.maxIterations) {
    const plan = await planner.run(task, previousFeedback);
    const diff = await coder.run(plan);
    const testResult = await foreman.run(diff);
    
    if (testResult.passed) {
      return { success: true, diff };
    }
    
    const reflection = await reflector.run({
      plan, diff, testOutput: testResult.output
    });
    
    if (reflection.confidence < config.confidenceThreshold) {
      return { success: false, reason: 'Low confidence' };
    }
    
    if (reflection.recommendation === 'replan') {
      if (replans >= config.maxReplans) {
        return { success: false, reason: 'Max replans exceeded' };
      }
      replans++;
      previousFeedback = reflection.feedback;
    } else {
      // Fix attempt
      diff = await fixer.run(diff, testResult.output, reflection.feedback);
    }
    
    iteration++;
  }
}
```

### Memory Across Iterations
- Track what was tried and failed
- Prevent repeating same mistakes
- Build up context about the problem

## Definition of Done
- [ ] ReflectionAgent implemented
- [ ] Agentic loop controller
- [ ] Iteration memory (what was tried)
- [ ] Configurable limits and thresholds
- [ ] Metrics: iterations per success, replan rate
- [ ] Works on 3 complex test cases

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

## Complexity: L
## Estimate: 3-4 days