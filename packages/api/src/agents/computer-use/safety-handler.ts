/**
 * Safety Check Handler for CUA Operations
 * Issue #318 - Handles safety checks from OpenAI's computer-use model
 */

import type { CUASafetyCheck, SafetyResult } from "./types";

export class SafetyHandler {
  private allowedUrls: string[];

  constructor(allowedUrls: string[] = []) {
    // Load allowed URLs from environment or use provided list
    const envUrls = process.env.CUA_ALLOWED_URLS;
    this.allowedUrls = envUrls
      ? envUrls.split(",").map((s) => s.trim())
      : allowedUrls.length > 0
        ? allowedUrls
        : ["localhost", "127.0.0.1"];
  }

  /**
   * Handle safety checks from the model response
   * @param pendingSafetyChecks - Array of pending safety checks from the model
   * @param currentUrl - The current browser URL
   * @returns SafetyResult indicating whether to proceed
   */
  async handle(
    pendingSafetyChecks: CUASafetyCheck[] | undefined,
    currentUrl: string
  ): Promise<SafetyResult> {
    if (!pendingSafetyChecks || pendingSafetyChecks.length === 0) {
      return { proceed: true };
    }

    const acknowledged: CUASafetyCheck[] = [];
    const blocked: CUASafetyCheck[] = [];

    for (const check of pendingSafetyChecks) {
      const result = this.evaluateCheck(check, currentUrl);

      if (result.blocked) {
        blocked.push(check);
      } else if (result.acknowledged) {
        acknowledged.push(check);
      }
    }

    // If any checks are blocked, do not proceed
    if (blocked.length > 0) {
      const reasons = blocked.map(
        (c) => `${c.code}: ${c.message}`
      );
      return {
        proceed: false,
        reason: `Blocked by safety checks: ${reasons.join("; ")}`,
      };
    }

    // All checks acknowledged, proceed
    return {
      proceed: true,
      acknowledged,
    };
  }

  /**
   * Evaluate a single safety check
   */
  private evaluateCheck(
    check: CUASafetyCheck,
    currentUrl: string
  ): { blocked: boolean; acknowledged: boolean } {
    switch (check.code) {
      case "malicious_instructions":
        // ALWAYS BLOCK - never acknowledge malicious instructions
        console.warn(
          `[SafetyHandler] Blocking malicious_instructions: ${check.message}`
        );
        return { blocked: true, acknowledged: false };

      case "sensitive_domain":
        // ALWAYS BLOCK - never allow access to sensitive domains
        console.warn(
          `[SafetyHandler] Blocking sensitive_domain: ${check.message}`
        );
        return { blocked: true, acknowledged: false };

      case "irrelevant_domain":
        // Check against allowlist
        if (this.isUrlAllowed(currentUrl)) {
          console.info(
            `[SafetyHandler] Acknowledging irrelevant_domain for allowed URL: ${currentUrl}`
          );
          return { blocked: false, acknowledged: true };
        } else {
          console.warn(
            `[SafetyHandler] Blocking irrelevant_domain for disallowed URL: ${currentUrl}`
          );
          return { blocked: true, acknowledged: false };
        }

      default:
        // Unknown safety check codes - block by default for safety
        console.warn(
          `[SafetyHandler] Blocking unknown safety check: ${check.code}`
        );
        return { blocked: true, acknowledged: false };
    }
  }

  /**
   * Check if a URL is in the allowlist
   */
  private isUrlAllowed(url: string): boolean {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();

      return this.allowedUrls.some((allowed) => {
        const allowedLower = allowed.toLowerCase();
        // Exact match or subdomain match
        return (
          hostname === allowedLower ||
          hostname.endsWith(`.${allowedLower}`)
        );
      });
    } catch {
      // Invalid URL - block by default
      return false;
    }
  }

  /**
   * Add URLs to the allowlist
   */
  addAllowedUrls(urls: string[]): void {
    for (const url of urls) {
      if (!this.allowedUrls.includes(url)) {
        this.allowedUrls.push(url);
      }
    }
  }

  /**
   * Get the current allowlist
   */
  getAllowedUrls(): string[] {
    return [...this.allowedUrls];
  }
}

/**
 * Get allowed URLs from environment
 */
export function getAllowedUrls(): string[] {
  const envUrls = process.env.CUA_ALLOWED_URLS;
  if (envUrls) {
    return envUrls.split(",").map((s) => s.trim());
  }
  return ["localhost", "127.0.0.1"];
}
