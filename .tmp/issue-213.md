## Parent Issue
Part of #193 - Agentic Loop with Self-Correction

## Goal
Create the ReflectionAgent that analyzes test failures and determines next action.

## Implementation
Create `src/agents/reflection.ts`:

- Extend BaseAgent with ReflectionInput/ReflectionOutput
- Analyze test output to diagnose failure
- Determine root cause (plan vs code vs test vs environment)
- Recommend next action (replan, fix, or abort)
- Calculate confidence score based on error clarity
- Provide specific feedback for next iteration

Prompt should:
- Analyze the gap between expected and actual behavior
- Identify if the plan was flawed or implementation was wrong
- Give actionable feedback

## Definition of Done
- [ ] Create `src/agents/reflection.ts`
- [ ] Create `prompts/reflection.md`
- [ ] Diagnose failures accurately
- [ ] Output confidence score 0-1
- [ ] Basic tests with sample failures

## Dependencies
- Parent: #193
- Depends on: #212
- Next: #214

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 1 hour
