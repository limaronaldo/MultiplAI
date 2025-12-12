## Parent Issue
Part of #193 - Agentic Loop with Self-Correction

## Goal
Create iteration memory to track what was tried and prevent repeating mistakes.

## Implementation
Create `src/core/agentic/iteration-memory.ts`:

- `IterationMemory` class:
  - `addAttempt(record: AttemptRecord)` - record an attempt
  - `getAttempts(): AttemptRecord[]` - get all attempts
  - `getFailedApproaches(): string[]` - list failed strategies
  - `hasTriedApproach(approach: string): boolean` - check if tried
  - `getSummary(): string` - human-readable summary for prompts
- In-memory storage per task
- Include in agent prompts to avoid repeating mistakes

## Definition of Done
- [ ] Create `src/core/agentic/iteration-memory.ts`
- [ ] Track all attempts with details
- [ ] Detect repeated approaches
- [ ] Generate summary for prompts
- [ ] Unit tests

## Dependencies
- Parent: #193
- Depends on: #213
- Next: #215

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 45 minutes
