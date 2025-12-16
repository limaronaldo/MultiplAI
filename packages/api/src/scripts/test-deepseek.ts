/**
 * Test script for DeepSeek V3.2 Special Edition via OpenRouter
 *
 * Usage: bun run src/scripts/test-deepseek.ts
 */

import { OpenRouterClient } from "../integrations/openrouter";

const MODEL = "deepseek/deepseek-v3.2-speciale";

async function testDeepSeek() {
  console.log(`\n🧪 Testing ${MODEL} via OpenRouter\n`);
  console.log("=".repeat(60));

  const client = new OpenRouterClient();

  // Test 1: Simple coding task
  console.log("\n📝 Test 1: Simple TypeScript function\n");

  const test1 = await client.complete({
    model: MODEL,
    maxTokens: 1000,
    temperature: 0.2,
    systemPrompt: "You are a senior TypeScript developer. Write clean, typed code.",
    userPrompt: `Write a TypeScript function that:
1. Takes an array of numbers
2. Returns the sum of all even numbers
3. Include proper typing and a brief JSDoc comment

Only output the code, no explanations.`,
  });

  console.log("Response:");
  console.log(test1);
  console.log("\n" + "-".repeat(60));

  // Test 2: Code review / analysis
  console.log("\n🔍 Test 2: Code Analysis\n");

  const codeToReview = `
function processData(data) {
  let result = [];
  for (let i = 0; i < data.length; i++) {
    if (data[i].active == true) {
      result.push(data[i].name.toUpperCase());
    }
  }
  return result;
}
`;

  const test2 = await client.complete({
    model: MODEL,
    maxTokens: 1000,
    temperature: 0.3,
    systemPrompt: "You are a code reviewer. Be concise and actionable.",
    userPrompt: `Review this JavaScript code and suggest 3-5 specific improvements:

\`\`\`javascript
${codeToReview}
\`\`\`

Format: numbered list with before/after code snippets where helpful.`,
  });

  console.log("Response:");
  console.log(test2);
  console.log("\n" + "-".repeat(60));

  // Test 3: JSON output (important for agents)
  console.log("\n📦 Test 3: Structured JSON Output\n");

  const test3 = await client.complete({
    model: MODEL,
    maxTokens: 500,
    temperature: 0.1,
    systemPrompt: "You are an API that only outputs valid JSON. No markdown, no explanations.",
    userPrompt: `Analyze this task and output a JSON object with this exact structure:
{
  "complexity": "XS" | "S" | "M" | "L" | "XL",
  "effort": "low" | "medium" | "high",
  "estimatedFiles": number,
  "reasoning": "brief explanation"
}

Task: "Add a loading spinner to the submit button while the form is submitting"`,
  });

  console.log("Response:");
  console.log(test3);

  // Try to parse the JSON
  try {
    const parsed = JSON.parse(test3.replace(/```json\n?|\n?```/g, "").trim());
    console.log("\n✅ Valid JSON parsed:", parsed);
  } catch (e) {
    console.log("\n❌ Failed to parse JSON:", (e as Error).message);
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ All tests completed!\n");
}

// Run the tests
testDeepSeek().catch((error) => {
  console.error("\n❌ Test failed:", error);
  process.exit(1);
});
