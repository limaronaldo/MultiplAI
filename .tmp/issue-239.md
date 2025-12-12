## Summary

Implement input guardrails to validate GitHub issues before processing, preventing wasted compute on malformed, unsafe, or unclear requests.

## Background

From OpenAI's production track:
> "Input guardrails prevent unwanted inputs from being processed. In a production environment, ideally you would have both types of guardrails."

AutoDev currently has strong **output** guardrails (MAX_DIFF_LINES, blocked paths, complexity limits) but minimal **input** validation beyond checking for the `auto-dev` label.

## Requirements

### Validation Checks

#### 1. Content Moderation
Use OpenAI Moderations API (free) to check issue content:
```typescript
const moderation = await openai.moderations.create({
  model: "omni-moderation-latest",
  input: issue.title + " " + issue.body,
});

if (moderation.results[0].flagged) {
  return reject("Issue flagged by content moderation");
}
```

#### 2. Acceptance Criteria Check
Verify issue has clear requirements:
```typescript
interface IssueQualityCheck {
  hasAcceptanceCriteria: boolean;  // Contains "- [ ]" or "acceptance criteria"
  hasCodeReferences: boolean;       // Contains file paths or function names
  estimatedClarity: number;         // 0-100 from LLM
  missingInfo: string[];            // What's unclear
}
```

#### 3. Security-Sensitive Detection
Flag issues that modify sensitive areas:
- Authentication/authorization changes
- Environment variables or secrets
- CI/CD workflows
- Database migrations
- Payment/billing code

#### 4. Scope Validation
Reject issues that are too vague:
- "Fix the bug" (which bug?)
- "Improve performance" (where?)
- "Update the code" (what code?)

### Guardrail Response Actions

```typescript
type GuardrailAction = 
  | "pass"           // Proceed with processing
  | "warn"           // Proceed but flag for human review
  | "clarify"        // Ask for more info (comment on issue)
  | "reject";        // Do not process, add label

interface GuardrailResult {
  action: GuardrailAction;
  reason: string;
  details: {
    moderationFlags?: string[];
    missingInfo?: string[];
    securityConcerns?: string[];
    clarityScore?: number;
  };
}
```

### Implementation

```typescript
// src/core/guardrails/input-guardrails.ts
export class InputGuardrails {
  async validate(issue: GitHubIssue): Promise<GuardrailResult> {
    // 1. Content moderation
    const modResult = await this.checkModeration(issue);
    if (modResult.action === "reject") return modResult;
    
    // 2. Acceptance criteria
    const criteriaResult = await this.checkAcceptanceCriteria(issue);
    if (criteriaResult.action === "clarify") return criteriaResult;
    
    // 3. Security check
    const securityResult = await this.checkSecuritySensitive(issue);
    if (securityResult.action !== "pass") return securityResult;
    
    // 4. Clarity check
    const clarityResult = await this.checkClarity(issue);
    return clarityResult;
  }
  
  private async checkModeration(issue: GitHubIssue): Promise<GuardrailResult>;
  private async checkAcceptanceCriteria(issue: GitHubIssue): Promise<GuardrailResult>;
  private async checkSecuritySensitive(issue: GitHubIssue): Promise<GuardrailResult>;
  private async checkClarity(issue: GitHubIssue): Promise<GuardrailResult>;
}
```

### Auto-Comment for Clarification

When action is "clarify", post a comment:
```markdown
👋 AutoDev needs more information to process this issue:

**Missing details:**
- [ ] Specific file(s) to modify
- [ ] Expected behavior after the change
- [ ] How to verify the fix works

Please update the issue description and remove the `needs-info` label when ready.
```

### Configuration

```bash
# Enable/disable guardrails
INPUT_GUARDRAILS_ENABLED=true

# Thresholds
MIN_CLARITY_SCORE=60
REQUIRE_ACCEPTANCE_CRITERIA=true

# Security
SECURITY_SENSITIVE_PATHS=src/auth,src/payment,lib/secrets
AUTO_REJECT_SECURITY=false  # false = warn only
```

## Acceptance Criteria
- [ ] InputGuardrails class implemented
- [ ] Content moderation integration (Moderations API)
- [ ] Acceptance criteria detection
- [ ] Security-sensitive path detection
- [ ] Clarity scoring with LLM
- [ ] Auto-comment for clarification requests
- [ ] Configuration via environment variables
- [ ] Unit tests for each guardrail type
- [ ] Integration with webhook handler

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
S - Well-defined scope, mostly validation logic

## References
- OpenAI Moderations API (free)
- OpenAI production track: "Building guardrails"