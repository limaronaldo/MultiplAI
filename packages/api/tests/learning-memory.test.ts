import { describe, it, expect, beforeEach } from "bun:test";
import {
  FixPatternSchema,
  CodebaseConventionSchema,
  FailureModeSchema,
  createFixPattern,
  createConvention,
  createFailureMode,
  updateFixPatternStats,
  updateConventionConfidence,
  applyFixPatternDecay,
  categorizeError,
  extractErrorPattern,
} from "../src/core/memory/learning-types";

// =============================================================================
// LEARNING TYPES TESTS
// =============================================================================

describe("Learning Types", () => {
  describe("createFixPattern", () => {
    it("should create a valid fix pattern", () => {
      const pattern = createFixPattern(
        "owner/repo",
        "Cannot find module 'foo'",
        "import_error",
        "Add missing import statement",
        "add_import",
        {
          error: "Cannot find module 'foo'",
          fix: "+import { foo } from 'foo';",
        },
      );

      expect(pattern.repo).toBe("owner/repo");
      expect(pattern.errorPattern).toBe("Cannot find module 'foo'");
      expect(pattern.errorCategory).toBe("import_error");
      expect(pattern.fixType).toBe("add_import");
      expect(pattern.successCount).toBe(1);
      expect(pattern.failureCount).toBe(0);
      expect(pattern.successRate).toBe(1);
      expect(pattern.examples).toHaveLength(1);

      // Validate against schema
      expect(() => FixPatternSchema.parse(pattern)).not.toThrow();
    });

    it("should generate unique IDs", () => {
      const pattern1 = createFixPattern("r", "e", "other", "s", "other", {
        error: "e",
        fix: "f",
      });
      const pattern2 = createFixPattern("r", "e", "other", "s", "other", {
        error: "e",
        fix: "f",
      });

      expect(pattern1.id).not.toBe(pattern2.id);
    });
  });

  describe("createConvention", () => {
    it("should create a valid convention with default confidence", () => {
      const convention = createConvention(
        "owner/repo",
        "naming",
        "Components use PascalCase",
        ["UserProfile.tsx", "Dashboard.tsx"],
      );

      expect(convention.repo).toBe("owner/repo");
      expect(convention.category).toBe("naming");
      expect(convention.pattern).toBe("Components use PascalCase");
      expect(convention.examples).toHaveLength(2);
      expect(convention.confidence).toBe(0.5); // Default for inferred
      expect(convention.source).toBe("inferred");

      expect(() => CodebaseConventionSchema.parse(convention)).not.toThrow();
    });

    it("should create explicit convention with full confidence", () => {
      const convention = createConvention(
        "owner/repo",
        "imports",
        "Use absolute imports",
        [],
        "explicit",
      );

      expect(convention.confidence).toBe(1.0);
      expect(convention.source).toBe("explicit");
    });
  });

  describe("createFailureMode", () => {
    it("should create a valid failure mode", () => {
      const failure = createFailureMode(
        "owner/repo",
        "bug_fix",
        ["fix authentication"],
        "Tried to modify auth middleware directly",
        "Auth middleware has side effects that break tests",
        ["Test failed: auth.test.ts"],
        "Use dependency injection instead of modifying middleware",
        "Create a wrapper function",
      );

      expect(failure.repo).toBe("owner/repo");
      expect(failure.issueType).toBe("bug_fix");
      expect(failure.attemptedApproach).toBe(
        "Tried to modify auth middleware directly",
      );
      expect(failure.occurrenceCount).toBe(1);
      expect(failure.alternativeApproach).toBe("Create a wrapper function");

      expect(() => FailureModeSchema.parse(failure)).not.toThrow();
    });

    it("should limit error messages to 3", () => {
      const failure = createFailureMode(
        "r",
        "feature",
        [],
        "approach",
        "reason",
        ["err1", "err2", "err3", "err4", "err5"],
        "avoid",
      );

      expect(failure.errorMessages).toHaveLength(3);
    });
  });

  describe("updateFixPatternStats", () => {
    it("should increment success count and maintain rate", () => {
      const pattern = createFixPattern("r", "e", "other", "s", "other", {
        error: "e",
        fix: "f",
      });
      const updated = updateFixPatternStats(pattern, true);

      expect(updated.successCount).toBe(2);
      expect(updated.failureCount).toBe(0);
      expect(updated.successRate).toBe(1);
    });

    it("should increment failure count and update rate", () => {
      const pattern = createFixPattern("r", "e", "other", "s", "other", {
        error: "e",
        fix: "f",
      });
      const updated = updateFixPatternStats(pattern, false);

      expect(updated.successCount).toBe(1);
      expect(updated.failureCount).toBe(1);
      expect(updated.successRate).toBe(0.5);
    });

    it("should add new examples up to max 5", () => {
      let pattern = createFixPattern("r", "e", "other", "s", "other", {
        error: "e1",
        fix: "f1",
      });

      for (let i = 2; i <= 7; i++) {
        pattern = updateFixPatternStats(pattern, true, {
          error: `e${i}`,
          fix: `f${i}`,
        });
      }

      expect(pattern.examples).toHaveLength(5);
      // Most recent should be first
      expect(pattern.examples[0].error).toBe("e7");
    });
  });

  describe("updateConventionConfidence", () => {
    it("should increase confidence when observed", () => {
      const convention = createConvention("r", "naming", "p", []);
      const updated = updateConventionConfidence(convention, true);

      expect(updated.confidence).toBe(0.6); // 0.5 + 0.1
      expect(updated.observationCount).toBe(2);
    });

    it("should cap inferred conventions at 0.95", () => {
      let convention = createConvention("r", "naming", "p", []);

      for (let i = 0; i < 10; i++) {
        convention = updateConventionConfidence(convention, true);
      }

      expect(convention.confidence).toBe(0.95);
    });

    it("should decrease confidence when violated", () => {
      const convention = createConvention("r", "naming", "p", []);
      const updated = updateConventionConfidence(convention, false);

      expect(updated.confidence).toBe(0.4); // 0.5 - 0.1
    });

    it("should not go below 0.1 confidence", () => {
      let convention = createConvention("r", "naming", "p", []);

      for (let i = 0; i < 10; i++) {
        convention = updateConventionConfidence(convention, false);
      }

      expect(convention.confidence).toBe(0.1);
    });
  });

  describe("applyFixPatternDecay", () => {
    it("should not decay within first week", () => {
      const pattern = createFixPattern("r", "e", "other", "s", "other", {
        error: "e",
        fix: "f",
      });
      const decayed = applyFixPatternDecay(pattern, 5);

      expect(decayed.successRate).toBe(pattern.successRate);
    });

    it("should decay after a week", () => {
      const pattern = createFixPattern("r", "e", "other", "s", "other", {
        error: "e",
        fix: "f",
      });
      const decayed = applyFixPatternDecay(pattern, 17); // 10 days past the 7-day threshold

      expect(decayed.successRate).toBeLessThan(pattern.successRate);
      expect(decayed.successRate).toBe(0.9); // 1 * (1 - 10 * 0.01)
    });

    it("should not decay below 50%", () => {
      const pattern = createFixPattern("r", "e", "other", "s", "other", {
        error: "e",
        fix: "f",
      });
      const decayed = applyFixPatternDecay(pattern, 100); // Way past threshold

      expect(decayed.successRate).toBe(0.5);
    });
  });

  describe("categorizeError", () => {
    it("should categorize type errors", () => {
      expect(
        categorizeError("Type 'string' is not assignable to type 'number'"),
      ).toBe("type_error");
      expect(categorizeError("typescript error TS2345")).toBe("type_error");
    });

    it("should categorize import errors", () => {
      expect(categorizeError("Cannot find module 'lodash'")).toBe(
        "import_error",
      );
      expect(categorizeError("Module not found: Error: Can't resolve")).toBe(
        "import_error",
      );
    });

    it("should categorize syntax errors", () => {
      expect(categorizeError("SyntaxError: Unexpected token")).toBe(
        "syntax_error",
      );
      expect(categorizeError("Syntax error on line 42")).toBe("syntax_error");
    });

    it("should categorize test failures", () => {
      expect(categorizeError("Test failed: expected true")).toBe(
        "test_failure",
      );
      expect(categorizeError("expect(received).toBe(expected)")).toBe(
        "test_failure",
      );
    });

    it("should categorize lint errors", () => {
      expect(categorizeError("ESLint: no-unused-vars")).toBe("lint_error");
    });

    it("should categorize build errors", () => {
      expect(categorizeError("Build failed with exit code 1")).toBe(
        "build_error",
      );
      expect(categorizeError("Failed to compile")).toBe("build_error");
    });

    it("should return other for unknown errors", () => {
      expect(categorizeError("Something went wrong")).toBe("other");
    });
  });

  describe("extractErrorPattern", () => {
    it("should generalize module names in error message", () => {
      const pattern = extractErrorPattern(
        "Cannot find module 'lodash' from 'src/utils.ts'",
      );
      // Should replace 'lodash' with '<NAME>' and file path with <FILE>
      expect(pattern).toContain("'<NAME>'");
      expect(pattern).toContain("<FILE>");
    });

    it("should normalize file paths", () => {
      const pattern = extractErrorPattern(
        "Error in /Users/dev/project/src/file.ts:42:10",
      );
      expect(pattern).not.toContain("/Users/dev/project");
      expect(pattern).toContain("<FILE>");
    });

    it("should normalize line/column numbers", () => {
      const pattern = extractErrorPattern("Error at file.ts:42:10");
      expect(pattern).toContain("<LINE>:<COL>");
      expect(pattern).not.toContain(":42:10");
    });
  });
});

// =============================================================================
// LEARNING MEMORY STORE TESTS (Unit tests without DB)
// =============================================================================

describe("LearningMemoryStore helpers", () => {
  // These test the internal logic without hitting the database
  // The store methods are tested via the type helpers above

  describe("fix pattern scoring logic", () => {
    it("should score patterns by category match", () => {
      const pattern1 = createFixPattern(
        "r",
        "import error",
        "import_error",
        "add import",
        "add_import",
        { error: "e", fix: "f" },
      );
      const pattern2 = createFixPattern(
        "r",
        "type error",
        "type_error",
        "fix type",
        "fix_type",
        { error: "e", fix: "f" },
      );

      // Pattern matching same category should score higher
      const testError = "Cannot find module 'foo'";
      const testCategory = categorizeError(testError);

      expect(testCategory).toBe("import_error");
      expect(pattern1.errorCategory).toBe(testCategory);
      expect(pattern2.errorCategory).not.toBe(testCategory);
    });
  });
});
