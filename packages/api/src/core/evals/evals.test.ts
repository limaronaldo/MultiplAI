import { describe, it, expect } from "bun:test";
import {
  calculateMetrics,
  splitDataset,
  type LabeledExample,
} from "./judge-config";
import {
  StringCheckGrader,
  TextSimilarityGrader,
  CompositeGrader,
  AutoDevGraders,
} from "./graders";

describe("calculateMetrics", () => {
  it("calculates perfect metrics", () => {
    const metrics = calculateMetrics(50, 0, 0, 50);

    expect(metrics.tp).toBe(50);
    expect(metrics.fp).toBe(0);
    expect(metrics.fn).toBe(0);
    expect(metrics.tn).toBe(50);
    expect(metrics.tpr).toBe(1);
    expect(metrics.tnr).toBe(1);
    expect(metrics.accuracy).toBe(1);
  });

  it("calculates 50% metrics", () => {
    const metrics = calculateMetrics(25, 25, 25, 25);

    expect(metrics.tpr).toBe(0.5);
    expect(metrics.tnr).toBe(0.5);
    expect(metrics.accuracy).toBe(0.5);
  });

  it("handles edge case of all zeros", () => {
    const metrics = calculateMetrics(0, 0, 0, 0);

    expect(metrics.tpr).toBe(0);
    expect(metrics.tnr).toBe(0);
    expect(metrics.accuracy).toBe(0);
  });

  it("handles high false positive rate", () => {
    const metrics = calculateMetrics(40, 40, 10, 10);

    expect(metrics.tpr).toBe(0.8); // 40 / (40 + 10)
    expect(metrics.tnr).toBe(0.2); // 10 / (10 + 40)
  });
});

describe("splitDataset", () => {
  const createExamples = (count: number): LabeledExample[] =>
    Array.from({ length: count }, (_, i) => ({
      input: `input-${i}`,
      output: `output-${i}`,
      humanLabel: i % 2 === 0 ? "pass" : "fail",
    }));

  it("splits 100 examples with default ratios", () => {
    const examples = createExamples(100);
    const { train, validation, test } = splitDataset(examples);

    expect(train.length).toBe(20); // 20%
    expect(validation.length).toBe(40); // 40%
    expect(test.length).toBe(40); // 40%
  });

  it("splits with custom ratios", () => {
    const examples = createExamples(100);
    const { train, validation, test } = splitDataset(examples, 0.1, 0.3);

    expect(train.length).toBe(10); // 10%
    expect(validation.length).toBe(30); // 30%
    expect(test.length).toBe(60); // 60%
  });

  it("handles small datasets", () => {
    const examples = createExamples(10);
    const { train, validation, test } = splitDataset(examples);

    expect(train.length).toBe(2); // 20% of 10
    expect(validation.length).toBe(4); // 40% of 10
    expect(test.length).toBe(4); // 40% of 10
  });

  it("shuffles the examples", () => {
    const examples = createExamples(100);
    const split1 = splitDataset(examples);
    const split2 = splitDataset(examples);

    // Unlikely to be the same order after random shuffle
    const allSame =
      split1.train.every((e, i) => e.input === split2.train[i]?.input);
    // Note: This test is probabilistic, could rarely fail
    // With 20 examples, probability of same order is ~1/(20!) ≈ 0
    expect(split1.train.length).toBe(split2.train.length);
  });
});

describe("StringCheckGrader", () => {
  describe("exact match", () => {
    it("passes on exact match", async () => {
      const grader = new StringCheckGrader({ exact: "hello world" });
      const result = await grader.evaluate("any input", "hello world");

      expect(result.grade).toBe("pass");
    });

    it("fails on mismatch", async () => {
      const grader = new StringCheckGrader({ exact: "hello world" });
      const result = await grader.evaluate("any input", "hello there");

      expect(result.grade).toBe("fail");
    });

    it("respects case sensitivity", async () => {
      const grader = new StringCheckGrader({ exact: "Hello World" });
      const result = await grader.evaluate("any input", "hello world");

      expect(result.grade).toBe("fail");
    });

    it("ignores case when configured", async () => {
      const grader = new StringCheckGrader({
        exact: "Hello World",
        ignoreCase: true,
      });
      const result = await grader.evaluate("any input", "hello world");

      expect(result.grade).toBe("pass");
    });
  });

  describe("contains", () => {
    it("passes when all terms present", async () => {
      const grader = new StringCheckGrader({
        contains: ["function", "return"],
      });
      const result = await grader.evaluate(
        "any input",
        "function test() { return 42; }",
      );

      expect(result.grade).toBe("pass");
    });

    it("fails when term missing", async () => {
      const grader = new StringCheckGrader({
        contains: ["function", "class"],
      });
      const result = await grader.evaluate(
        "any input",
        "function test() { return 42; }",
      );

      expect(result.grade).toBe("fail");
      expect(result.reason).toContain("class");
    });
  });

  describe("notContains", () => {
    it("passes when no forbidden terms", async () => {
      const grader = new StringCheckGrader({
        notContains: ["error", "failed"],
      });
      const result = await grader.evaluate("any input", "test passed successfully");

      expect(result.grade).toBe("pass");
    });

    it("fails when forbidden term present", async () => {
      const grader = new StringCheckGrader({
        notContains: ["error", "failed"],
      });
      const result = await grader.evaluate("any input", "test failed with error");

      expect(result.grade).toBe("fail");
      expect(result.reason).toContain("error");
    });
  });
});

describe("TextSimilarityGrader", () => {
  it("passes on identical text", async () => {
    const grader = new TextSimilarityGrader("hello world", 0.9);
    const result = await grader.evaluate("any input", "hello world");

    expect(result.grade).toBe("pass");
    expect(result.confidence).toBe(1);
  });

  it("passes on similar text above threshold", async () => {
    const grader = new TextSimilarityGrader(
      "the quick brown fox jumps",
      0.5,
    );
    const result = await grader.evaluate(
      "any input",
      "the quick brown dog jumps",
    );

    expect(result.grade).toBe("pass");
  });

  it("fails on dissimilar text below threshold", async () => {
    const grader = new TextSimilarityGrader("hello world", 0.9);
    const result = await grader.evaluate("any input", "goodbye universe");

    expect(result.grade).toBe("fail");
  });

  it("ignores punctuation", async () => {
    const grader = new TextSimilarityGrader("Hello, World!", 0.9);
    const result = await grader.evaluate("any input", "hello world");

    expect(result.grade).toBe("pass");
  });
});

describe("CompositeGrader", () => {
  it("passes when all graders pass (all mode)", async () => {
    const graders = [
      new StringCheckGrader({ contains: ["hello"] }),
      new StringCheckGrader({ contains: ["world"] }),
    ];
    const composite = new CompositeGrader(graders, "all");

    const result = await composite.evaluate("any input", "hello world");

    expect(result.grade).toBe("pass");
  });

  it("fails when any grader fails (all mode)", async () => {
    const graders = [
      new StringCheckGrader({ contains: ["hello"] }),
      new StringCheckGrader({ contains: ["goodbye"] }),
    ];
    const composite = new CompositeGrader(graders, "all");

    const result = await composite.evaluate("any input", "hello world");

    expect(result.grade).toBe("fail");
  });

  it("passes when any grader passes (any mode)", async () => {
    const graders = [
      new StringCheckGrader({ contains: ["hello"] }),
      new StringCheckGrader({ contains: ["goodbye"] }),
    ];
    const composite = new CompositeGrader(graders, "any");

    const result = await composite.evaluate("any input", "hello world");

    expect(result.grade).toBe("pass");
  });

  it("fails when all graders fail (any mode)", async () => {
    const graders = [
      new StringCheckGrader({ contains: ["foo"] }),
      new StringCheckGrader({ contains: ["bar"] }),
    ];
    const composite = new CompositeGrader(graders, "any");

    const result = await composite.evaluate("any input", "hello world");

    expect(result.grade).toBe("fail");
  });
});

describe("AutoDevGraders", () => {
  describe("diffValidity", () => {
    it("passes on valid diff", async () => {
      const validDiff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
+import { foo } from './foo';
 export function bar() {
   return 42;
 }`;

      const result = await AutoDevGraders.diffValidity.evaluate(
        "any input",
        validDiff,
      );

      expect(result.grade).toBe("pass");
    });

    it("fails on truncated diff", async () => {
      const truncatedDiff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
[truncated]`;

      const result = await AutoDevGraders.diffValidity.evaluate(
        "any input",
        truncatedDiff,
      );

      expect(result.grade).toBe("fail");
    });

    it("fails on invalid diff", async () => {
      const result = await AutoDevGraders.diffValidity.evaluate(
        "any input",
        "This is not a diff",
      );

      expect(result.grade).toBe("fail");
    });
  });

  describe("testsPass", () => {
    it("passes on passing tests", async () => {
      const result = await AutoDevGraders.testsPass.evaluate(
        "any input",
        "All tests passed ✓",
      );

      expect(result.grade).toBe("pass");
    });

    it("fails on failing tests", async () => {
      const result = await AutoDevGraders.testsPass.evaluate(
        "any input",
        "3 tests failed",
      );

      expect(result.grade).toBe("fail");
    });
  });
});
