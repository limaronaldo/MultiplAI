## Parent Issue
Part of #193 - Agentic Loop with Self-Correction

## Goal
Add new task states for agentic loop phases.

## Implementation
Modify `src/core/types.ts` and `src/core/state-machine.ts`:

New states:
- `REFLECTING` - analyzing failure
- `REPLANNING` - creating new plan based on feedback

Transitions:
- `TESTS_FAILED` → `REFLECTING`
- `REFLECTING` → `REPLANNING` (if rootCause is plan)
- `REFLECTING` → `FIXING` (if rootCause is code)
- `REPLANNING` → `CODING`

## Definition of Done
- [ ] Add REFLECTING and REPLANNING states
- [ ] Update state machine transitions
- [ ] Update getNextAction() for new states
- [ ] Update Task type if needed

## Dependencies
- Parent: #193
- Depends on: #217
- Next: #219

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 30 minutes
