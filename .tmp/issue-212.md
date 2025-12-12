## Parent Issue
Part of #193 - Agentic Loop with Self-Correction

## Goal
Define TypeScript types for the reflection and agentic loop system.

## Implementation
Create `src/core/agentic/types.ts`:

```typescript
export interface ReflectionInput {
  originalIssue: string;
  plan: string[];
  diff: string;
  testOutput: string;
  attemptNumber: number;
  previousAttempts: AttemptRecord[];
}

export interface ReflectionOutput {
  diagnosis: string;
  rootCause: "plan" | "code" | "test" | "environment";
  recommendation: "replan" | "fix" | "abort";
  feedback: string;
  confidence: number;
}

export interface AttemptRecord {
  iteration: number;
  action: "plan" | "code" | "fix";
  result: "success" | "failure";
  error?: string;
  timestamp: Date;
}

export interface LoopConfig {
  maxIterations: number;
  maxReplans: number;
  confidenceThreshold: number;
}

export interface LoopResult {
  success: boolean;
  iterations: number;
  replans: number;
  finalDiff?: string;
  reason?: string;
}
```

## Definition of Done
- [ ] Create `src/core/agentic/types.ts`
- [ ] Export all types
- [ ] Add Zod schemas for validation
- [ ] Types pass typecheck

## Dependencies
- Parent: #193
- Next: #213

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 30 minutes
