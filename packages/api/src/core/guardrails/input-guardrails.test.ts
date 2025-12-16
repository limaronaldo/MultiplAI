import { describe, it, expect, beforeEach } from "bun:test";
import { InputGuardrails, isGuardrailsEnabled } from "./input-guardrails";

describe("InputGuardrails", () => {
  let guardrails: InputGuardrails;

  beforeEach(() => {
    // Create guardrails with moderation disabled (no API key in tests)
    guardrails = new InputGuardrails({
      enabled: true,
      minClarityScore: 60,
      requireAcceptanceCriteria: true,
      securitySensitivePaths: ["src/auth", "src/payment"],
      autoRejectSecurity: false,
    });
  });

  describe("isGuardrailsEnabled", () => {
    it("returns boolean", () => {
      expect(typeof isGuardrailsEnabled()).toBe("boolean");
    });
  });

  describe("validate", () => {
    it("passes well-formed issues", async () => {
      const result = await guardrails.validate({
        title: "feat: Add user profile page",
        body: `
## Summary
Add a new user profile page that displays user information.

## Acceptance Criteria
- [ ] Create UserProfile component in src/components/UserProfile.tsx
- [ ] Display user name, email, and avatar
- [ ] Add edit button for profile updates

## Test Plan
- Run: bun test
- Verify profile renders correctly
        `.trim(),
      });

      expect(result.action).toBe("pass");
    });

    it("rejects vague issues", async () => {
      const result = await guardrails.validate({
        title: "Fix the bug",
        body: "Please fix it.",
      });

      expect(result.action).toBe("clarify");
      expect(result.reason).toContain("vague");
    });

    it("rejects issues with very short body", async () => {
      const result = await guardrails.validate({
        title: "feat: Add new feature",
        body: "Do it",
      });

      expect(result.action).toBe("clarify");
      expect(result.reason).toContain("short");
    });

    it("warns on security-sensitive issues", async () => {
      const result = await guardrails.validate({
        title: "feat: Update authentication flow",
        body: `
## Summary
Update the authentication system to use JWT tokens.

## Changes
- Modify src/auth/login.ts
- Update password hashing

## Acceptance Criteria
- [ ] JWT tokens work correctly
- [ ] Sessions are invalidated on logout
        `.trim(),
      });

      expect(result.action).toBe("warn");
      expect(result.details.securityConcerns).toBeDefined();
      expect(result.details.securityConcerns!.length).toBeGreaterThan(0);
    });

    it("rejects security issues when autoRejectSecurity is true", async () => {
      const strictGuardrails = new InputGuardrails({
        enabled: true,
        minClarityScore: 60,
        requireAcceptanceCriteria: false,
        securitySensitivePaths: ["src/auth"],
        autoRejectSecurity: true,
      });

      const result = await strictGuardrails.validate({
        title: "feat: Update authentication",
        body: "Change the authentication flow in src/auth/login.ts. Should work correctly after changes.",
      });

      expect(result.action).toBe("reject");
    });

    it("requires acceptance criteria when configured", async () => {
      const result = await guardrails.validate({
        title: "feat: Add new button",
        body: `
## Summary
Add a new button to the dashboard.

## Details
The button will be blue and say "Click me". It goes in the header area.
        `.trim(),
      });

      expect(result.action).toBe("clarify");
      // Either missing acceptance criteria or missing file references
      expect(result.details.missingInfo).toBeDefined();
      expect(result.details.missingInfo!.length).toBeGreaterThan(0);
    });

    it("passes issues with should/must statements as criteria", async () => {
      const noChecklistGuardrails = new InputGuardrails({
        enabled: true,
        minClarityScore: 40,
        requireAcceptanceCriteria: true,
        securitySensitivePaths: [],
        autoRejectSecurity: false,
      });

      const result = await noChecklistGuardrails.validate({
        title: "feat: Add logout button",
        body: `
## Summary
Add logout button to the header.

## Requirements
The button should be visible in the header.
The button must call the logout API when clicked.
The user should be redirected to login page after logout.

## Files
- src/components/Header.tsx
        `.trim(),
      });

      expect(result.action).toBe("pass");
    });

    it("calculates clarity score correctly", async () => {
      const result = await guardrails.validate({
        title: "feat: Add user dashboard with analytics",
        body: `
## Summary
Create a comprehensive user dashboard showing analytics.

## Acceptance Criteria
- [ ] Create Dashboard component in src/components/Dashboard.tsx
- [ ] Display user statistics
- [ ] Add charts for data visualization
- [ ] Include date range selector

## Implementation
\`\`\`typescript
// Example component structure
export function Dashboard() {
  return <div>...</div>;
}
\`\`\`

## Test Plan
Run: bun test
        `.trim(),
      });

      expect(result.action).toBe("pass");
      expect(result.details.clarityScore).toBeGreaterThanOrEqual(60);
    });
  });

  describe("generateClarificationComment", () => {
    it("generates markdown comment with missing info", () => {
      const comment = guardrails.generateClarificationComment({
        action: "clarify",
        reason: "Issue is missing acceptance criteria",
        details: {
          missingInfo: ["Specific file(s) to modify", "Expected behavior"],
        },
      });

      expect(comment).toContain("AutoDev needs more information");
      expect(comment).toContain("Specific file(s) to modify");
      expect(comment).toContain("Expected behavior");
      expect(comment).toContain("needs-info");
    });

    it("includes security concerns when present", () => {
      const comment = guardrails.generateClarificationComment({
        action: "warn",
        reason: "Issue touches security-sensitive areas",
        details: {
          securityConcerns: [
            'Contains security keyword: "authentication"',
            'References sensitive path: "src/auth"',
          ],
        },
      });

      expect(comment).toContain("Security concerns");
      expect(comment).toContain("authentication");
      expect(comment).toContain("src/auth");
    });
  });

  describe("disabled guardrails", () => {
    it("passes everything when disabled", async () => {
      const disabledGuardrails = new InputGuardrails({ enabled: false });

      const result = await disabledGuardrails.validate({
        title: "x",
        body: "",
      });

      expect(result.action).toBe("pass");
      expect(result.reason).toBe("Guardrails disabled");
    });
  });
});

describe("vague issue patterns", () => {
  let guardrails: InputGuardrails;

  beforeEach(() => {
    guardrails = new InputGuardrails({
      enabled: true,
      minClarityScore: 0, // Disable clarity check for pattern tests
      requireAcceptanceCriteria: false,
      securitySensitivePaths: [],
      autoRejectSecurity: false,
    });
  });

  const vaguePatterns = [
    "Fix the bug",
    "fix bug",
    "Improve performance",
    "Update the code",
    "Make it work",
    "make it better",
    "Refactor",
    "Clean up",
    "cleanup",
  ];

  for (const title of vaguePatterns) {
    it(`rejects vague title: "${title}"`, async () => {
      const result = await guardrails.validate({
        title,
        body: "Some description here that is long enough to pass the body check.",
      });

      expect(result.action).toBe("clarify");
    });
  }
});
