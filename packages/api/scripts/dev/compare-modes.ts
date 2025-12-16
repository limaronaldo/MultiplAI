/**
 * Script to compare Single vs Multi agent modes for Issue #1
 *
 * Usage:
 *   npx ts-node scripts/compare-modes.ts
 *
 * This script will:
 * 1. Run Issue #1 in SINGLE mode (Opus 4.5)
 * 2. Run Issue #1 in MULTI mode (3 coders: Sonnet 4.5, Gemini 3 Pro, GPT-5.1 Codex)
 * 3. Compare results and estimate costs
 */

// Model pricing (per 1M tokens) - OpenRouter prices as of Dec 2024
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic via OpenRouter
  "anthropic/claude-opus-4.5": { input: 15.0, output: 75.0 },
  "anthropic/claude-sonnet-4.5": { input: 3.0, output: 15.0 },
  // Google via OpenRouter
  "google/gemini-3-pro-preview": { input: 2.0, output: 12.0 },
  // OpenAI via OpenRouter
  "openai/gpt-5.1-codex-max": { input: 1.25, output: 10.0 },
  // Direct Anthropic API
  "claude-opus-4-5-20251101": { input: 15.0, output: 75.0 },
  "claude-sonnet-4-5-20250929": { input: 3.0, output: 15.0 },
};

interface TokenUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

interface TestResult {
  mode: "single" | "multi";
  duration: number; // ms
  tokenUsage: TokenUsage[];
  totalCost: number;
  prCreated: boolean;
  prUrl?: string;
  codeQuality: {
    linesChanged: number;
    filesModified: number;
    reviewerVerdict?: string;
  };
}

function calculateCost(usage: TokenUsage): number {
  const pricing = MODEL_PRICING[usage.model];
  if (!pricing) {
    console.warn(`Unknown model pricing: ${usage.model}`);
    return 0;
  }
  const inputCost = (usage.inputTokens / 1_000_000) * pricing.input;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

function printComparison(
  single: TestResult,
  multi: TestResult,
  previous?: TestResult,
) {
  console.log("\n" + "=".repeat(80));
  console.log("                    COMPARISON: Issue #1 Processing");
  console.log("=".repeat(80));

  // Table header
  console.log("\n| Metric | Single (Opus 4.5) | Multi (3 models) | Previous |");
  console.log("|--------|-------------------|------------------|----------|");

  // Duration
  console.log(
    `| Duration | ${(single.duration / 1000).toFixed(1)}s | ${(multi.duration / 1000).toFixed(1)}s | ${previous ? (previous.duration / 1000).toFixed(1) + "s" : "N/A"} |`,
  );

  // Cost
  console.log(
    `| Total Cost | ${formatCost(single.totalCost)} | ${formatCost(multi.totalCost)} | ${previous ? formatCost(previous.totalCost) : "N/A"} |`,
  );

  // Tokens
  const singleTokens = single.tokenUsage.reduce(
    (sum, u) => sum + u.inputTokens + u.outputTokens,
    0,
  );
  const multiTokens = multi.tokenUsage.reduce(
    (sum, u) => sum + u.inputTokens + u.outputTokens,
    0,
  );
  const prevTokens = previous?.tokenUsage.reduce(
    (sum, u) => sum + u.inputTokens + u.outputTokens,
    0,
  );
  console.log(
    `| Total Tokens | ${singleTokens.toLocaleString()} | ${multiTokens.toLocaleString()} | ${prevTokens ? prevTokens.toLocaleString() : "N/A"} |`,
  );

  // Code quality
  console.log(
    `| Lines Changed | ${single.codeQuality.linesChanged} | ${multi.codeQuality.linesChanged} | ${previous?.codeQuality.linesChanged || "N/A"} |`,
  );
  console.log(
    `| Files Modified | ${single.codeQuality.filesModified} | ${multi.codeQuality.filesModified} | ${previous?.codeQuality.filesModified || "N/A"} |`,
  );
  console.log(
    `| Reviewer Verdict | ${single.codeQuality.reviewerVerdict || "N/A"} | ${multi.codeQuality.reviewerVerdict || "N/A"} | ${previous?.codeQuality.reviewerVerdict || "N/A"} |`,
  );

  // Cost breakdown
  console.log("\n### Cost Breakdown - Single Mode");
  for (const usage of single.tokenUsage) {
    const cost = calculateCost(usage);
    console.log(
      `  - ${usage.model}: ${usage.inputTokens + usage.outputTokens} tokens = ${formatCost(cost)}`,
    );
  }

  console.log("\n### Cost Breakdown - Multi Mode");
  for (const usage of multi.tokenUsage) {
    const cost = calculateCost(usage);
    console.log(
      `  - ${usage.model}: ${usage.inputTokens + usage.outputTokens} tokens = ${formatCost(cost)}`,
    );
  }

  // Analysis
  console.log("\n### Analysis");
  const costDiff = multi.totalCost - single.totalCost;
  const costPercent = (multi.totalCost / single.totalCost - 1) * 100;
  console.log(
    `- Multi mode is ${costPercent > 0 ? "MORE" : "LESS"} expensive by ${formatCost(Math.abs(costDiff))} (${Math.abs(costPercent).toFixed(1)}%)`,
  );

  const timeDiff = multi.duration - single.duration;
  console.log(
    `- Multi mode is ${timeDiff > 0 ? "SLOWER" : "FASTER"} by ${Math.abs(timeDiff / 1000).toFixed(1)}s`,
  );

  console.log("\n" + "=".repeat(80));
}

// Previous run data (from LEARNINGS.md)
const PREVIOUS_RUN: TestResult = {
  mode: "multi",
  duration: 170000, // ~170s total (from logs)
  tokenUsage: [
    {
      model: "claude-sonnet-4-5-20250929",
      inputTokens: 2000,
      outputTokens: 400,
    }, // Planner
    {
      model: "anthropic/claude-sonnet-4.5",
      inputTokens: 3000,
      outputTokens: 2000,
    }, // Coder (winner)
    { model: "z-ai/glm-4.6v", inputTokens: 3000, outputTokens: 1500 }, // Coder 2
    {
      model: "claude-opus-4-5-20251101",
      inputTokens: 5000,
      outputTokens: 1500,
    }, // Consensus
  ],
  totalCost: 0, // Will be calculated
  prCreated: true,
  prUrl: "https://github.com/limaronaldo/MultiplAI/pull/10",
  codeQuality: {
    linesChanged: 150,
    filesModified: 3,
    reviewerVerdict: "REJECTED (incomplete diff)",
  },
};

// Calculate previous run cost
PREVIOUS_RUN.totalCost = PREVIOUS_RUN.tokenUsage.reduce(
  (sum, u) => sum + calculateCost(u),
  0,
);

// Estimated usage for new runs
const ESTIMATED_SINGLE: TestResult = {
  mode: "single",
  duration: 60000, // Estimated 60s
  tokenUsage: [
    {
      model: "claude-sonnet-4-5-20250929",
      inputTokens: 2000,
      outputTokens: 400,
    }, // Planner
    {
      model: "anthropic/claude-opus-4.5",
      inputTokens: 4000,
      outputTokens: 3000,
    }, // Coder (Opus)
    {
      model: "claude-opus-4-5-20251101",
      inputTokens: 5000,
      outputTokens: 1500,
    }, // Reviewer
  ],
  totalCost: 0,
  prCreated: false,
  codeQuality: {
    linesChanged: 0,
    filesModified: 0,
  },
};

const ESTIMATED_MULTI: TestResult = {
  mode: "multi",
  duration: 90000, // Estimated 90s (parallel)
  tokenUsage: [
    {
      model: "claude-sonnet-4-5-20250929",
      inputTokens: 2000,
      outputTokens: 400,
    }, // Planner
    {
      model: "anthropic/claude-sonnet-4.5",
      inputTokens: 4000,
      outputTokens: 2500,
    }, // Coder 1
    {
      model: "google/gemini-3-pro-preview",
      inputTokens: 4000,
      outputTokens: 2500,
    }, // Coder 2
    {
      model: "openai/gpt-5.1-codex-max",
      inputTokens: 4000,
      outputTokens: 2500,
    }, // Coder 3
    {
      model: "claude-opus-4-5-20251101",
      inputTokens: 8000,
      outputTokens: 2000,
    }, // Consensus (reviews 3)
  ],
  totalCost: 0,
  prCreated: false,
  codeQuality: {
    linesChanged: 0,
    filesModified: 0,
  },
};

// Calculate estimated costs
ESTIMATED_SINGLE.totalCost = ESTIMATED_SINGLE.tokenUsage.reduce(
  (sum, u) => sum + calculateCost(u),
  0,
);
ESTIMATED_MULTI.totalCost = ESTIMATED_MULTI.tokenUsage.reduce(
  (sum, u) => sum + calculateCost(u),
  0,
);

console.log("\n### ESTIMATED COSTS (Before Running)");
console.log(
  `\nSingle Mode (Opus 4.5): ${formatCost(ESTIMATED_SINGLE.totalCost)}`,
);
for (const usage of ESTIMATED_SINGLE.tokenUsage) {
  console.log(
    `  - ${usage.model}: ~${(usage.inputTokens + usage.outputTokens).toLocaleString()} tokens`,
  );
}

console.log(
  `\nMulti Mode (3 coders): ${formatCost(ESTIMATED_MULTI.totalCost)}`,
);
for (const usage of ESTIMATED_MULTI.tokenUsage) {
  console.log(
    `  - ${usage.model}: ~${(usage.inputTokens + usage.outputTokens).toLocaleString()} tokens`,
  );
}

console.log(`\nPrevious Run: ${formatCost(PREVIOUS_RUN.totalCost)}`);

console.log("\n### COST COMPARISON");
console.log(`| Mode | Estimated Cost | Models |`);
console.log(`|------|----------------|--------|`);
console.log(
  `| Single | ${formatCost(ESTIMATED_SINGLE.totalCost)} | Opus 4.5 coder |`,
);
console.log(
  `| Multi | ${formatCost(ESTIMATED_MULTI.totalCost)} | Sonnet 4.5 + Gemini 3 + GPT-5.1 |`,
);
console.log(
  `| Previous | ${formatCost(PREVIOUS_RUN.totalCost)} | DeepSeek + GLM + Sonnet (failed) |`,
);

const savings = ESTIMATED_MULTI.totalCost - ESTIMATED_SINGLE.totalCost;
console.log(
  `\n💰 Single mode saves ~${formatCost(Math.abs(savings))} per run vs Multi mode`,
);
console.log(`   But Multi mode provides consensus voting for better quality`);

// Run the estimation
console.log("\n✅ Cost estimation complete. Ready to run actual tests.");
