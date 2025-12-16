/**
 * Model Comparison Test
 *
 * Compares DeepSeek V3.2 Special Edition against current models
 * for typical AutoDev tasks: planning, coding, and JSON output.
 *
 * Usage: bun run src/scripts/compare-models.ts
 */

import { OpenRouterClient } from "../integrations/openrouter";

interface TestResult {
  model: string;
  task: string;
  success: boolean;
  duration: number;
  tokens: number;
  reasoningTokens?: number;
  cost: number;
  output: string;
  error?: string;
}

const MODELS_TO_TEST = [
  "deepseek/deepseek-v3.2-speciale",
  "deepseek/deepseek-r1",
  "x-ai/grok-3-mini",
];

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

async function callOpenRouter(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 2000
): Promise<{
  content: string;
  tokens: number;
  reasoningTokens: number;
  cost: number;
  duration: number;
}> {
  const start = Date.now();

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: maxTokens,
    }),
  });

  const data = await response.json();
  const duration = Date.now() - start;

  if (data.error) {
    throw new Error(data.error.message || JSON.stringify(data.error));
  }

  const content = data.choices?.[0]?.message?.content || "";
  const tokens = data.usage?.total_tokens || 0;
  const reasoningTokens = data.usage?.completion_tokens_details?.reasoning_tokens || 0;
  const cost = data.usage?.cost || 0;

  return { content, tokens, reasoningTokens, cost, duration };
}

async function runTest(
  model: string,
  taskName: string,
  systemPrompt: string,
  userPrompt: string,
  validator: (output: string) => boolean,
  maxTokens: number = 2000
): Promise<TestResult> {
  try {
    const result = await callOpenRouter(model, systemPrompt, userPrompt, maxTokens);

    return {
      model,
      task: taskName,
      success: validator(result.content),
      duration: result.duration,
      tokens: result.tokens,
      reasoningTokens: result.reasoningTokens,
      cost: result.cost,
      output: result.content.slice(0, 200) + (result.content.length > 200 ? "..." : ""),
    };
  } catch (error) {
    return {
      model,
      task: taskName,
      success: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      output: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Test 1: JSON Analysis (Planner-like)
async function testJsonAnalysis(model: string): Promise<TestResult> {
  return runTest(
    model,
    "JSON Analysis",
    "You are an API that outputs only valid JSON. No markdown, no explanations.",
    `Analyze this GitHub issue and output JSON:
{
  "complexity": "XS" | "S" | "M" | "L" | "XL",
  "effort": "low" | "medium" | "high",
  "estimatedFiles": number,
  "targetFiles": string[],
  "reasoning": "brief explanation"
}

Issue: "Add a dark mode toggle to the settings page. Should persist preference to localStorage and update CSS variables."`,
    (output) => {
      try {
        const cleaned = output.replace(/```json\n?|\n?```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        return (
          ["XS", "S", "M", "L", "XL"].includes(parsed.complexity) &&
          ["low", "medium", "high"].includes(parsed.effort) &&
          typeof parsed.estimatedFiles === "number"
        );
      } catch {
        return false;
      }
    }
  );
}

// Test 2: Code Generation (Coder-like)
async function testCodeGeneration(model: string): Promise<TestResult> {
  return runTest(
    model,
    "Code Generation",
    "You are a TypeScript developer. Output only code with no explanations.",
    `Write a React hook called useLocalStorage that:
1. Takes a key (string) and initial value (T)
2. Returns [value, setValue] tuple
3. Persists to localStorage
4. Handles SSR (check for window)

Output the complete TypeScript code.`,
    (output) => {
      return (
        output.includes("useLocalStorage") &&
        output.includes("localStorage") &&
        (output.includes("useState") || output.includes("function"))
      );
    }
  );
}

// Test 3: Unified Diff (Coder output format)
async function testDiffGeneration(model: string): Promise<TestResult> {
  return runTest(
    model,
    "Diff Generation",
    `You are a code generator that outputs unified diffs. Output ONLY the diff, no explanations.
Format:
\`\`\`diff
--- a/path/to/file
+++ b/path/to/file
@@ -line,count +line,count @@
 context
-removed
+added
\`\`\``,
    `Generate a unified diff to add a "loading" prop to this Button component:

Current file src/components/Button.tsx:
\`\`\`tsx
interface ButtonProps {
  onClick: () => void;
  children: React.ReactNode;
}

export function Button({ onClick, children }: ButtonProps) {
  return (
    <button onClick={onClick} className="btn">
      {children}
    </button>
  );
}
\`\`\`

Add a loading?: boolean prop that shows a spinner and disables the button when true.`,
    (output) => {
      return (
        output.includes("---") &&
        output.includes("+++") &&
        output.includes("@@") &&
        output.includes("loading")
      );
    },
    3000 // More tokens for diff
  );
}

async function main() {
  console.log("\n🔬 Model Comparison Test\n");
  console.log("=".repeat(80));

  if (!OPENROUTER_API_KEY) {
    console.error("❌ OPENROUTER_API_KEY not set");
    process.exit(1);
  }

  const allResults: TestResult[] = [];

  for (const model of MODELS_TO_TEST) {
    console.log(`\n📊 Testing: ${model}\n`);
    console.log("-".repeat(60));

    const results = await Promise.all([
      testJsonAnalysis(model),
      testCodeGeneration(model),
      testDiffGeneration(model),
    ]);

    for (const result of results) {
      allResults.push(result);

      const status = result.success ? "✅" : "❌";
      const reasoning = result.reasoningTokens ? ` (reasoning: ${result.reasoningTokens})` : "";

      console.log(`${status} ${result.task}`);
      console.log(`   Duration: ${result.duration}ms | Tokens: ${result.tokens}${reasoning} | Cost: $${result.cost.toFixed(5)}`);

      if (result.error) {
        console.log(`   Error: ${result.error}`);
      } else {
        console.log(`   Output: ${result.output.slice(0, 100)}...`);
      }
      console.log();
    }
  }

  // Summary table
  console.log("\n" + "=".repeat(80));
  console.log("📈 SUMMARY\n");

  const summary: Record<string, { success: number; total: number; avgDuration: number; totalCost: number; avgReasoningRatio: number }> = {};

  for (const result of allResults) {
    if (!summary[result.model]) {
      summary[result.model] = { success: 0, total: 0, avgDuration: 0, totalCost: 0, avgReasoningRatio: 0 };
    }
    summary[result.model].total++;
    if (result.success) summary[result.model].success++;
    summary[result.model].avgDuration += result.duration;
    summary[result.model].totalCost += result.cost;
    if (result.reasoningTokens && result.tokens) {
      summary[result.model].avgReasoningRatio += result.reasoningTokens / result.tokens;
    }
  }

  console.log("| Model | Success | Avg Duration | Total Cost | Reasoning % |");
  console.log("|-------|---------|--------------|------------|-------------|");

  for (const [model, stats] of Object.entries(summary)) {
    const successRate = `${stats.success}/${stats.total}`;
    const avgDuration = Math.round(stats.avgDuration / stats.total);
    const reasoningPct = stats.avgReasoningRatio > 0
      ? `${Math.round((stats.avgReasoningRatio / stats.total) * 100)}%`
      : "N/A";

    console.log(
      `| ${model.padEnd(35)} | ${successRate.padEnd(7)} | ${(avgDuration + "ms").padEnd(12)} | $${stats.totalCost.toFixed(4).padEnd(9)} | ${reasoningPct.padEnd(11)} |`
    );
  }

  console.log("\n✅ Comparison complete!\n");
}

main().catch(console.error);
