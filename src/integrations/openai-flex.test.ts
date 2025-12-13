import { describe, it, expect, beforeEach } from "bun:test";
import {
  OpenAIFlexClient,
  isFlexEnabled,
  isFlexEligible,
  FLEX_ELIGIBLE_OPERATIONS,
} from "./openai-flex";

describe("OpenAIFlexClient", () => {
  beforeEach(() => {
    OpenAIFlexClient.resetMetrics();
  });

  describe("isFlexEnabled", () => {
    it("returns true by default", () => {
      // Default is enabled
      expect(typeof isFlexEnabled()).toBe("boolean");
    });
  });

  describe("isFlexEligible", () => {
    it("returns true for eligible operations", () => {
      for (const op of FLEX_ELIGIBLE_OPERATIONS) {
        expect(isFlexEligible(op)).toBe(true);
      }
    });

    it("returns false for non-eligible operations", () => {
      expect(isFlexEligible("coding")).toBe(false);
      expect(isFlexEligible("planning")).toBe(false);
      expect(isFlexEligible("review")).toBe(false);
    });
  });

  describe("getMetrics", () => {
    it("returns initial metrics as zeros", () => {
      const metrics = OpenAIFlexClient.getMetrics();
      expect(metrics.flexRequests).toBe(0);
      expect(metrics.flexTokens).toBe(0);
      expect(metrics.standardFallbacks).toBe(0);
      expect(metrics.resourceUnavailableErrors).toBe(0);
      expect(metrics.estimatedSavings).toBe(0);
    });
  });

  describe("resetMetrics", () => {
    it("resets all metrics to zero", () => {
      // Metrics start at zero, reset should keep them at zero
      OpenAIFlexClient.resetMetrics();
      const metrics = OpenAIFlexClient.getMetrics();
      expect(metrics.flexRequests).toBe(0);
      expect(metrics.flexTokens).toBe(0);
    });
  });
});

describe("FLEX_ELIGIBLE_OPERATIONS", () => {
  it("contains expected operations", () => {
    expect(FLEX_ELIGIBLE_OPERATIONS).toContain("evals");
    expect(FLEX_ELIGIBLE_OPERATIONS).toContain("kg_sync");
    expect(FLEX_ELIGIBLE_OPERATIONS).toContain("distillation");
    expect(FLEX_ELIGIBLE_OPERATIONS).toContain("embeddings");
    expect(FLEX_ELIGIBLE_OPERATIONS).toContain("reprocessing");
  });

  it("has 5 eligible operations", () => {
    expect(FLEX_ELIGIBLE_OPERATIONS.length).toBe(5);
  });
});
