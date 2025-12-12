## Parent Issue
Part of #193 - Agentic Loop with Self-Correction

## Goal
Create end-to-end tests for the agentic loop with complex test cases.

## Implementation
Create `tests/agentic-loop.test.ts`:

Test cases:
1. Simple fix (no replan needed)
2. Replan after reflection identifies plan issue
3. Multiple iterations until success
4. Abort when confidence too low
5. Max iterations exceeded

Mock agents for deterministic testing.

## Definition of Done
- [ ] Create test file
- [ ] Test simple fix path
- [ ] Test replan path
- [ ] Test abort conditions
- [ ] Test max iterations
- [ ] All tests pass

## Dependencies
- Parent: #193
- Depends on: #220

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 1 hour
