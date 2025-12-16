import { getDb } from "../../integrations/db";
import {
  type FixPattern,
  type CodebaseConvention,
  type FailureMode,
  type LearningSummary,
  FixPatternSchema,
  CodebaseConventionSchema,
  FailureModeSchema,
  createFixPattern,
  createConvention,
  createFailureMode,
  updateFixPatternStats,
  updateConventionConfidence,
  applyFixPatternDecay,
  extractErrorPattern,
  categorizeError,
} from "./learning-types";

// =============================================================================
// LEARNING MEMORY STORE
// Persists cross-task learning patterns to database
// =============================================================================

const MAX_PATTERNS_PER_REPO = 100;
const MAX_CONVENTIONS_PER_REPO = 50;
const MAX_FAILURES_PER_REPO = 50;
const MIN_SUCCESS_RATE = 0.3; // Remove patterns below this

/**
 * Safely parse JSONB data from database.
 * Some Postgres drivers return jsonb columns as strings instead of objects.
 */
function parseJsonbData<T>(data: unknown): T {
  if (typeof data === "string") {
    return JSON.parse(data) as T;
  }
  return data as T;
}

export class LearningMemoryStore {
  // =========================================================================
  // FIX PATTERNS
  // =========================================================================

  /**
   * Store a new fix pattern or update existing one
   */
  async storeFixPattern(
    repo: string,
    error: string,
    fix: string,
    taskId?: string,
  ): Promise<FixPattern> {
    const errorPattern = extractErrorPattern(error);
    const errorCategory = categorizeError(error);

    // Check for existing similar pattern
    const existing = await this.findSimilarFixPattern(repo, errorPattern);

    if (existing) {
      // Update existing pattern
      const updated = updateFixPatternStats(existing, true, {
        error: error.slice(0, 500),
        fix: fix.slice(0, 1000),
        taskId,
      });
      await this.saveFixPattern(updated);
      return updated;
    }

    // Create new pattern
    const pattern = createFixPattern(
      repo,
      errorPattern,
      errorCategory,
      this.summarizeFix(fix),
      this.inferFixType(fix),
      { error: error.slice(0, 500), fix: fix.slice(0, 1000), taskId },
    );

    await this.saveFixPattern(pattern);
    await this.enforcePatternLimit(repo);

    return pattern;
  }

  /**
   * Record a fix failure (pattern didn't work)
   */
  async recordFixFailure(repo: string, error: string): Promise<void> {
    const errorPattern = extractErrorPattern(error);
    const existing = await this.findSimilarFixPattern(repo, errorPattern);

    if (existing) {
      const updated = updateFixPatternStats(existing, false);
      await this.saveFixPattern(updated);
    }
  }

  /**
   * Find fix patterns matching an error
   */
  async findFixPatterns(
    repo: string,
    error: string,
    limit: number = 5,
  ): Promise<FixPattern[]> {
    const patterns = await this.getFixPatternsForRepo(repo);
    const errorCategory = categorizeError(error);
    const errorLower = error.toLowerCase();

    // Score and rank patterns
    const scored = patterns
      .map((pattern) => {
        let score = 0;

        // Category match
        if (pattern.errorCategory === errorCategory) {
          score += 0.3;
        }

        // Pattern similarity (simple keyword matching)
        const patternWords = pattern.errorPattern.toLowerCase().split(/\s+/);
        const errorWords = errorLower.split(/\s+/);
        const commonWords = patternWords.filter((w) =>
          errorWords.some((ew) => ew.includes(w) || w.includes(ew)),
        );
        score += (commonWords.length / patternWords.length) * 0.4;

        // Success rate
        score += pattern.successRate * 0.3;

        // Apply decay
        const daysSinceUse = pattern.lastUsedAt
          ? (Date.now() - new Date(pattern.lastUsedAt).getTime()) /
            (1000 * 60 * 60 * 24)
          : 30;
        const decayed = applyFixPatternDecay(pattern, daysSinceUse);
        score *= decayed.successRate / Math.max(pattern.successRate, 0.01);

        return { pattern, score };
      })
      .filter((s) => s.score > 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map((s) => s.pattern);
  }

  /**
   * List fix patterns for a repo (best-effort ranking)
   */
  async listFixPatterns(repo: string, limit: number = 20): Promise<FixPattern[]> {
    const patterns = await this.getFixPatternsForRepo(repo);
    return patterns
      .sort(
        (a, b) =>
          b.successRate - a.successRate ||
          b.successCount - a.successCount ||
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .slice(0, limit);
  }

  // =========================================================================
  // CODEBASE CONVENTIONS
  // =========================================================================

  /**
   * Store or update a convention
   */
  async storeConvention(
    repo: string,
    category: CodebaseConvention["category"],
    pattern: string,
    examples: string[] = [],
    source: CodebaseConvention["source"] = "inferred",
  ): Promise<CodebaseConvention> {
    // Check for existing similar convention
    const existing = await this.findSimilarConvention(repo, category, pattern);

    if (existing) {
      const updated = updateConventionConfidence(existing, true);
      updated.examples = [
        ...new Set([...examples, ...existing.examples]),
      ].slice(0, 3);
      await this.saveConvention(updated);
      return updated;
    }

    // Create new convention
    const convention = createConvention(
      repo,
      category,
      pattern,
      examples,
      source,
    );
    await this.saveConvention(convention);
    await this.enforceConventionLimit(repo);

    return convention;
  }

  /**
   * Get conventions for a repo
   */
  async getConventions(
    repo: string,
    minConfidence: number = 0.4,
  ): Promise<CodebaseConvention[]> {
    const conventions = await this.getConventionsForRepo(repo);
    return conventions
      .filter((c) => c.confidence >= minConfidence)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Record convention violation (reduces confidence)
   */
  async recordConventionViolation(
    repo: string,
    conventionId: string,
  ): Promise<void> {
    const convention = await this.getConventionById(conventionId);
    if (convention) {
      const updated = updateConventionConfidence(convention, false);
      await this.saveConvention(updated);
    }
  }

  // =========================================================================
  // FAILURE MODES
  // =========================================================================

  /**
   * Store a failure mode
   */
  async storeFailure(
    repo: string,
    issueType: string,
    issuePatterns: string[],
    attemptedApproach: string,
    whyFailed: string,
    errorMessages: string[],
    avoidanceStrategy: string,
    alternativeApproach?: string,
  ): Promise<FailureMode> {
    // Check for existing similar failure
    const existing = await this.findSimilarFailure(
      repo,
      issueType,
      attemptedApproach,
    );

    if (existing) {
      const updated: FailureMode = {
        ...existing,
        occurrenceCount: existing.occurrenceCount + 1,
        errorMessages: [
          ...new Set([...errorMessages, ...existing.errorMessages]),
        ].slice(0, 3),
        updatedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      };
      await this.saveFailure(updated);
      return updated;
    }

    // Create new failure mode
    const failure = createFailureMode(
      repo,
      issueType,
      issuePatterns,
      attemptedApproach,
      whyFailed,
      errorMessages,
      avoidanceStrategy,
      alternativeApproach,
    );

    await this.saveFailure(failure);
    await this.enforceFailureLimit(repo);

    return failure;
  }

  /**
   * Check for known failure modes
   */
  async checkFailures(
    repo: string,
    issueType: string,
    approach?: string,
  ): Promise<FailureMode[]> {
    const failures = await this.getFailuresForRepo(repo);

    return failures.filter((f) => {
      // Match by issue type
      if (f.issueType.toLowerCase() !== issueType.toLowerCase()) {
        return false;
      }

      // Match by approach if provided
      if (approach) {
        const approachWords = approach.toLowerCase().split(/\s+/);
        const failureWords = f.attemptedApproach.toLowerCase().split(/\s+/);
        const overlap = approachWords.filter((w) => failureWords.includes(w));
        if (overlap.length < 2) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * List recent failure modes for a repo
   */
  async listFailures(repo: string, limit: number = 20): Promise<FailureMode[]> {
    const failures = await this.getFailuresForRepo(repo);
    return failures
      .sort(
        (a, b) =>
          new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
      )
      .slice(0, limit);
  }

  // =========================================================================
  // SUMMARY & CLEANUP
  // =========================================================================

  /**
   * Get learning summary for a repo
   */
  async getSummary(repo: string): Promise<LearningSummary> {
    const [patterns, conventions, failures] = await Promise.all([
      this.getFixPatternsForRepo(repo),
      this.getConventionsForRepo(repo),
      this.getFailuresForRepo(repo),
    ]);

    return {
      repo,
      fixPatternCount: patterns.length,
      conventionCount: conventions.length,
      failureModeCount: failures.length,
      totalTasksLearned: patterns.reduce((sum, p) => sum + p.successCount, 0),
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Cleanup old/low-quality patterns
   */
  async cleanup(repo: string): Promise<{ removed: number }> {
    let removed = 0;

    // Remove low success rate patterns
    const patterns = await this.getFixPatternsForRepo(repo);
    for (const pattern of patterns) {
      if (
        pattern.successRate < MIN_SUCCESS_RATE &&
        pattern.successCount + pattern.failureCount >= 3
      ) {
        await this.deleteFixPattern(pattern.id);
        removed++;
      }
    }

    // Remove low confidence conventions
    const conventions = await this.getConventionsForRepo(repo);
    for (const convention of conventions) {
      if (convention.confidence < 0.2 && convention.source === "inferred") {
        await this.deleteConvention(convention.id);
        removed++;
      }
    }

    return { removed };
  }

  // =========================================================================
  // HELPER METHODS
  // =========================================================================

  private summarizeFix(diff: string): string {
    const lines = diff.split("\n");
    const addedLines = lines.filter(
      (l) => l.startsWith("+") && !l.startsWith("+++"),
    );
    const removedLines = lines.filter(
      (l) => l.startsWith("-") && !l.startsWith("---"),
    );

    if (addedLines.length > 0 && removedLines.length === 0) {
      return `Added ${addedLines.length} line(s)`;
    }
    if (removedLines.length > 0 && addedLines.length === 0) {
      return `Removed ${removedLines.length} line(s)`;
    }
    return `Modified ${addedLines.length} added, ${removedLines.length} removed`;
  }

  private inferFixType(diff: string): FixPattern["fixType"] {
    const diffLower = diff.toLowerCase();

    if (diffLower.includes("import ") || diffLower.includes("from '")) {
      return "add_import";
    }
    if (
      diffLower.includes(": string") ||
      diffLower.includes(": number") ||
      diffLower.includes("interface ")
    ) {
      return "fix_type";
    }
    if (
      diffLower.includes("?") ||
      diffLower.includes("if (") ||
      diffLower.includes("!== null")
    ) {
      return "add_null_check";
    }
    if (diffLower.includes("export ")) {
      return "add_export";
    }

    return "other";
  }

  // =========================================================================
  // DATABASE OPERATIONS
  // =========================================================================

  private async saveFixPattern(pattern: FixPattern): Promise<void> {
    const sql = getDb();
    await sql`
      INSERT INTO learning_fix_patterns (id, repo, data, created_at, updated_at)
      VALUES (${pattern.id}, ${pattern.repo}, ${JSON.stringify(pattern)}::jsonb, ${pattern.createdAt}, ${pattern.updatedAt})
      ON CONFLICT (id) DO UPDATE SET data = ${JSON.stringify(pattern)}::jsonb, updated_at = ${pattern.updatedAt}
    `;
  }

  private async getFixPatternsForRepo(repo: string): Promise<FixPattern[]> {
    const sql = getDb();
    const results = await sql`
      SELECT data FROM learning_fix_patterns WHERE repo = ${repo}
    `;
    return results.map((r) =>
      FixPatternSchema.parse(parseJsonbData((r as any).data)),
    );
  }

  private async findSimilarFixPattern(
    repo: string,
    errorPattern: string,
  ): Promise<FixPattern | null> {
    const patterns = await this.getFixPatternsForRepo(repo);
    return (
      patterns.find(
        (p) =>
          p.errorPattern === errorPattern ||
          p.errorPattern.includes(errorPattern) ||
          errorPattern.includes(p.errorPattern),
      ) || null
    );
  }

  private async deleteFixPattern(id: string): Promise<void> {
    const sql = getDb();
    await sql`DELETE FROM learning_fix_patterns WHERE id = ${id}`;
  }

  private async enforcePatternLimit(repo: string): Promise<void> {
    const patterns = await this.getFixPatternsForRepo(repo);
    if (patterns.length > MAX_PATTERNS_PER_REPO) {
      // Remove oldest, lowest success rate patterns
      const toRemove = patterns
        .sort(
          (a, b) =>
            a.successRate - b.successRate ||
            new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
        )
        .slice(0, patterns.length - MAX_PATTERNS_PER_REPO);

      for (const pattern of toRemove) {
        await this.deleteFixPattern(pattern.id);
      }
    }
  }

  private async saveConvention(convention: CodebaseConvention): Promise<void> {
    const sql = getDb();
    await sql`
      INSERT INTO learning_conventions (id, repo, data, created_at, updated_at)
      VALUES (${convention.id}, ${convention.repo}, ${JSON.stringify(convention)}::jsonb, ${convention.createdAt}, ${convention.updatedAt})
      ON CONFLICT (id) DO UPDATE SET data = ${JSON.stringify(convention)}::jsonb, updated_at = ${convention.updatedAt}
    `;
  }

  private async getConventionsForRepo(
    repo: string,
  ): Promise<CodebaseConvention[]> {
    const sql = getDb();
    const results = await sql`
      SELECT data FROM learning_conventions WHERE repo = ${repo}
    `;
    return results.map((r) =>
      CodebaseConventionSchema.parse(parseJsonbData((r as any).data)),
    );
  }

  private async getConventionById(
    id: string,
  ): Promise<CodebaseConvention | null> {
    const sql = getDb();
    const results = await sql`
      SELECT data FROM learning_conventions WHERE id = ${id}
    `;
    if (results.length === 0) return null;
    return CodebaseConventionSchema.parse(parseJsonbData(results[0].data));
  }

  private async findSimilarConvention(
    repo: string,
    category: CodebaseConvention["category"],
    pattern: string,
  ): Promise<CodebaseConvention | null> {
    const conventions = await this.getConventionsForRepo(repo);
    return (
      conventions.find(
        (c) =>
          c.category === category &&
          (c.pattern === pattern ||
            c.pattern.includes(pattern) ||
            pattern.includes(c.pattern)),
      ) || null
    );
  }

  private async deleteConvention(id: string): Promise<void> {
    const sql = getDb();
    await sql`DELETE FROM learning_conventions WHERE id = ${id}`;
  }

  private async enforceConventionLimit(repo: string): Promise<void> {
    const conventions = await this.getConventionsForRepo(repo);
    if (conventions.length > MAX_CONVENTIONS_PER_REPO) {
      const toRemove = conventions
        .sort((a, b) => a.confidence - b.confidence)
        .slice(0, conventions.length - MAX_CONVENTIONS_PER_REPO);

      for (const convention of toRemove) {
        await this.deleteConvention(convention.id);
      }
    }
  }

  private async saveFailure(failure: FailureMode): Promise<void> {
    const sql = getDb();
    await sql`
      INSERT INTO learning_failures (id, repo, data, created_at, updated_at)
      VALUES (${failure.id}, ${failure.repo}, ${JSON.stringify(failure)}::jsonb, ${failure.createdAt}, ${failure.updatedAt})
      ON CONFLICT (id) DO UPDATE SET data = ${JSON.stringify(failure)}::jsonb, updated_at = ${failure.updatedAt}
    `;
  }

  private async getFailuresForRepo(repo: string): Promise<FailureMode[]> {
    const sql = getDb();
    const results = await sql`
      SELECT data FROM learning_failures WHERE repo = ${repo}
    `;
    return results.map((r) =>
      FailureModeSchema.parse(parseJsonbData((r as any).data)),
    );
  }

  private async findSimilarFailure(
    repo: string,
    issueType: string,
    attemptedApproach: string,
  ): Promise<FailureMode | null> {
    const failures = await this.getFailuresForRepo(repo);
    return (
      failures.find(
        (f) =>
          f.issueType === issueType &&
          f.attemptedApproach
            .toLowerCase()
            .includes(attemptedApproach.toLowerCase().slice(0, 50)),
      ) || null
    );
  }

  private async enforceFailureLimit(repo: string): Promise<void> {
    const sql = getDb();
    const failures = await this.getFailuresForRepo(repo);
    if (failures.length > MAX_FAILURES_PER_REPO) {
      const toRemove = failures
        .sort(
          (a, b) =>
            new Date(a.lastSeenAt).getTime() - new Date(b.lastSeenAt).getTime(),
        )
        .slice(0, failures.length - MAX_FAILURES_PER_REPO);

      for (const failure of toRemove) {
        await sql`DELETE FROM learning_failures WHERE id = ${failure.id}`;
      }
    }
  }
}

// Singleton instance
let learningStore: LearningMemoryStore | null = null;

export function getLearningMemoryStore(): LearningMemoryStore {
  if (!learningStore) {
    learningStore = new LearningMemoryStore();
  }
  return learningStore;
}

export function resetLearningMemoryStore(): void {
  learningStore = null;
}
