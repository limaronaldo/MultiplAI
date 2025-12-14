/**
 * Input Guardrails
 *
 * Validates GitHub issues before processing to prevent wasted compute
 * on malformed, unsafe, or unclear requests.
 *
 * Checks:
 * 1. Content moderation (OpenAI Moderations API - free)
 * 2. Acceptance criteria detection
 * 3. Security-sensitive path detection
 * 4. Clarity scoring
 *
 * Issue #239
 */

import OpenAI from "openai";

export type GuardrailAction = "pass" | "warn" | "clarify" | "reject";

export interface GuardrailResult {
  action: GuardrailAction;
  reason: string;
  details: {
    moderationFlags?: string[];
    missingInfo?: string[];
    securityConcerns?: string[];
    clarityScore?: number;
  };
}

export interface GitHubIssueInput {
  title: string;
  body: string;
  labels?: string[];
}

export interface InputGuardrailsConfig {
  enabled: boolean;
  minClarityScore: number;
  requireAcceptanceCriteria: boolean;
  securitySensitivePaths: string[];
  autoRejectSecurity: boolean;
}

// Default configuration
const DEFAULT_CONFIG: InputGuardrailsConfig = {
  enabled: process.env.INPUT_GUARDRAILS_ENABLED !== "false",
  minClarityScore: parseInt(process.env.MIN_CLARITY_SCORE || "60", 10),
  requireAcceptanceCriteria:
    process.env.REQUIRE_ACCEPTANCE_CRITERIA !== "false",
  securitySensitivePaths: (
    process.env.SECURITY_SENSITIVE_PATHS ||
    "src/auth,src/payment,lib/secrets,.env,src/config/secrets"
  ).split(","),
  autoRejectSecurity: process.env.AUTO_REJECT_SECURITY === "true",
};

// Patterns that indicate vague issues
const VAGUE_PATTERNS = [
  /^fix\s+(the\s+)?bug$/i,
  /^improve\s+performance$/i,
  /^update\s+(the\s+)?code$/i,
  /^make\s+it\s+(work|better)$/i,
  /^refactor$/i,
  /^clean\s*up$/i,
];

// Patterns that indicate acceptance criteria
const ACCEPTANCE_CRITERIA_PATTERNS = [
  /- \[ \]/,
  /acceptance\s+criteria/i,
  /expected\s+behavior/i,
  /should\s+(be|do|work|return|display)/i,
  /must\s+(be|do|work|return|display)/i,
  /verify\s+that/i,
  /test\s+plan/i,
];

// Security-related keywords
const SECURITY_KEYWORDS = [
  "authentication",
  "authorization",
  "password",
  "secret",
  "token",
  "api key",
  "apikey",
  "credential",
  "oauth",
  "jwt",
  "session",
  "cookie",
  "csrf",
  "xss",
  "injection",
  "encryption",
  "decrypt",
  "private key",
  "certificate",
];

export class InputGuardrails {
  private openai: OpenAI | null = null;
  private config: InputGuardrailsConfig;

  constructor(config: Partial<InputGuardrailsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize OpenAI client for moderation (free API)
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  /**
   * Validate a GitHub issue before processing
   */
  async validate(issue: GitHubIssueInput): Promise<GuardrailResult> {
    if (!this.config.enabled) {
      return { action: "pass", reason: "Guardrails disabled", details: {} };
    }

    const content = `${issue.title}\n\n${issue.body}`;

    // 1. Content moderation (async, run first as it's quick and free)
    const modResult = await this.checkModeration(content);
    if (modResult.action === "reject") {
      return modResult;
    }

    // 2. Vague issue check
    const vagueResult = this.checkVagueIssue(issue);
    if (vagueResult.action === "clarify") {
      return vagueResult;
    }

    // 3. Acceptance criteria check
    const criteriaResult = this.checkAcceptanceCriteria(issue);
    if (
      this.config.requireAcceptanceCriteria &&
      criteriaResult.action === "clarify"
    ) {
      return criteriaResult;
    }

    // 4. Security-sensitive check
    const securityResult = this.checkSecuritySensitive(issue);
    if (securityResult.action !== "pass") {
      return securityResult;
    }

    // 5. Calculate clarity score
    const clarityScore = this.calculateClarityScore(issue);
    if (clarityScore < this.config.minClarityScore) {
      return {
        action: "clarify",
        reason: `Issue clarity score (${clarityScore}) is below minimum (${this.config.minClarityScore})`,
        details: {
          clarityScore,
          missingInfo: this.getMissingInfo(issue),
        },
      };
    }

    // All checks passed
    return {
      action: "pass",
      reason: "All guardrail checks passed",
      details: {
        clarityScore,
        moderationFlags: modResult.details.moderationFlags,
      },
    };
  }

  /**
   * Check content moderation using OpenAI's free Moderations API
   */
  private async checkModeration(content: string): Promise<GuardrailResult> {
    if (!this.openai) {
      // Skip moderation if OpenAI not configured
      return { action: "pass", reason: "Moderation skipped", details: {} };
    }

    try {
      const moderation = await this.openai.moderations.create({
        model: "omni-moderation-latest",
        input: content,
      });

      const result = moderation.results[0];
      if (result.flagged) {
        const flags = Object.entries(result.categories)
          .filter(([_, flagged]) => flagged)
          .map(([category]) => category);

        return {
          action: "reject",
          reason: `Issue flagged by content moderation: ${flags.join(", ")}`,
          details: { moderationFlags: flags },
        };
      }

      return { action: "pass", reason: "Moderation passed", details: {} };
    } catch (error) {
      // Don't block on moderation errors
      console.warn("[Guardrails] Moderation check failed:", error);
      return { action: "pass", reason: "Moderation check skipped", details: {} };
    }
  }

  /**
   * Check if issue is too vague to process
   */
  private checkVagueIssue(issue: GitHubIssueInput): GuardrailResult {
    const title = issue.title.toLowerCase().trim();

    for (const pattern of VAGUE_PATTERNS) {
      if (pattern.test(title)) {
        return {
          action: "clarify",
          reason: `Issue title "${issue.title}" is too vague`,
          details: {
            missingInfo: [
              "Specific file(s) to modify",
              "Expected behavior after the change",
              "How to verify the fix works",
            ],
          },
        };
      }
    }

    // Also check if body is too short
    if (issue.body.length < 50) {
      return {
        action: "clarify",
        reason: "Issue description is too short",
        details: {
          missingInfo: [
            "Detailed description of the issue",
            "Steps to reproduce (if applicable)",
            "Expected vs actual behavior",
          ],
        },
      };
    }

    return { action: "pass", reason: "Issue is specific enough", details: {} };
  }

  /**
   * Check if issue has acceptance criteria
   */
  private checkAcceptanceCriteria(issue: GitHubIssueInput): GuardrailResult {
    const content = `${issue.title}\n${issue.body}`;

    for (const pattern of ACCEPTANCE_CRITERIA_PATTERNS) {
      if (pattern.test(content)) {
        return {
          action: "pass",
          reason: "Issue has acceptance criteria",
          details: {},
        };
      }
    }

    return {
      action: "clarify",
      reason: "Issue is missing acceptance criteria",
      details: {
        missingInfo: [
          "Acceptance criteria (checklist of requirements)",
          "Expected behavior description",
          "How to verify the change works",
        ],
      },
    };
  }

  /**
   * Check if issue touches security-sensitive areas
   */
  private checkSecuritySensitive(issue: GitHubIssueInput): GuardrailResult {
    const content = `${issue.title}\n${issue.body}`.toLowerCase();
    const concerns: string[] = [];

    // Check for security-related keywords
    for (const keyword of SECURITY_KEYWORDS) {
      if (content.includes(keyword.toLowerCase())) {
        concerns.push(`Contains security keyword: "${keyword}"`);
      }
    }

    // Check for sensitive file paths mentioned
    for (const path of this.config.securitySensitivePaths) {
      if (content.includes(path.toLowerCase())) {
        concerns.push(`References sensitive path: "${path}"`);
      }
    }

    if (concerns.length > 0) {
      return {
        action: this.config.autoRejectSecurity ? "reject" : "warn",
        reason: "Issue touches security-sensitive areas",
        details: { securityConcerns: concerns },
      };
    }

    return { action: "pass", reason: "No security concerns", details: {} };
  }

  /**
   * Calculate a clarity score for the issue (0-100)
   */
  private calculateClarityScore(issue: GitHubIssueInput): number {
    let score = 0;
    const content = `${issue.title}\n${issue.body}`;

    // Title quality (0-20)
    if (issue.title.length >= 10) score += 5;
    if (issue.title.length >= 20) score += 5;
    if (/^(feat|fix|refactor|docs|test|chore|perf):/.test(issue.title))
      score += 10;

    // Body length (0-20)
    if (issue.body.length >= 100) score += 5;
    if (issue.body.length >= 200) score += 5;
    if (issue.body.length >= 500) score += 10;

    // Has code references (0-20)
    if (/\.(ts|tsx|js|jsx|py|rs|go)\b/.test(content)) score += 10;
    if (/`[^`]+`/.test(content)) score += 5; // Has inline code
    if (/```[\s\S]+```/.test(content)) score += 5; // Has code block

    // Has acceptance criteria (0-20)
    for (const pattern of ACCEPTANCE_CRITERIA_PATTERNS) {
      if (pattern.test(content)) {
        score += 20;
        break;
      }
    }

    // Has structured content (0-20)
    if (/## /.test(issue.body)) score += 5; // Has headers
    if (/- \[.\]/.test(issue.body)) score += 10; // Has checkboxes
    if (/\n- /.test(issue.body)) score += 5; // Has bullet points

    return Math.min(100, score);
  }

  /**
   * Get list of missing information for clarification
   */
  private getMissingInfo(issue: GitHubIssueInput): string[] {
    const missing: string[] = [];
    const content = `${issue.title}\n${issue.body}`;

    if (!/\.(ts|tsx|js|jsx|py|rs|go)\b/.test(content)) {
      missing.push("Specific file(s) to modify");
    }

    if (!/should|must|expect|verify/i.test(content)) {
      missing.push("Expected behavior after the change");
    }

    if (!ACCEPTANCE_CRITERIA_PATTERNS.some((p) => p.test(content))) {
      missing.push("Acceptance criteria or test plan");
    }

    if (issue.body.length < 100) {
      missing.push("More detailed description");
    }

    return missing;
  }

  /**
   * Generate a clarification comment for GitHub
   */
  generateClarificationComment(result: GuardrailResult): string {
    const lines = [
      "👋 **AutoDev needs more information to process this issue.**",
      "",
      `**Reason:** ${result.reason}`,
      "",
    ];

    if (result.details.missingInfo && result.details.missingInfo.length > 0) {
      lines.push("**Missing details:**");
      for (const info of result.details.missingInfo) {
        lines.push(`- [ ] ${info}`);
      }
      lines.push("");
    }

    if (
      result.details.securityConcerns &&
      result.details.securityConcerns.length > 0
    ) {
      lines.push("**Security concerns:**");
      for (const concern of result.details.securityConcerns) {
        lines.push(`- ⚠️ ${concern}`);
      }
      lines.push("");
    }

    lines.push(
      "Please update the issue description and remove the `needs-info` label when ready.",
    );

    return lines.join("\n");
  }
}

// Singleton instance
let guardrails: InputGuardrails | null = null;

export function getInputGuardrails(): InputGuardrails {
  if (!guardrails) {
    guardrails = new InputGuardrails();
  }
  return guardrails;
}

/**
 * Check if input guardrails are enabled
 */
export function isGuardrailsEnabled(): boolean {
  return DEFAULT_CONFIG.enabled;
}
