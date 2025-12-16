/**
 * Test DeepSeek V3.2 Special Edition with different reasoning efforts
 *
 * Usage: bun run src/scripts/test-deepseek-configs.ts
 */

import { LLMClient } from "../integrations/llm";

const CONFIGS = [
  "deepseek-speciale-low",
  "deepseek-speciale-medium",
  "deepseek-speciale-high",
];

const TEST_PROMPT = `Analyze this task and return JSON only:
{"complexity": "XS"|"S"|"M"|"L"|"XL", "effort": "low"|"medium"|"high", "files": number}

Task: Add a dark mode toggle to settings page`;

async function main() {
  console.log("\n🧪 Testing DeepSeek V3.2 Speciale Configurations\n");
  console.log("=".repeat(60));

  const client = new LLMClient();

  for (const config of CONFIGS) {
    console.log(`\n📊 ${config}`);
    console.log("-".repeat(40));

    const start = Date.now();

    try {
      const result = await client.complete({
        model: config,
        maxTokens: 1000,
        temperature: 0.1,
        systemPrompt: "Output only valid JSON. No markdown.",
        userPrompt: TEST_PROMPT,
      });

      const duration = Date.now() - start;

      console.log(`Duration: ${duration}ms`);
      console.log(`Output: ${result.slice(0, 200)}`);

      // Try to parse JSON
      try {
        const cleaned = result.replace(/```json\n?|\n?```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        console.log(`✅ Valid JSON:`, parsed);
      } catch {
        console.log(`❌ Invalid JSON`);
      }
    } catch (error) {
      console.log(`❌ Error: ${error}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ Test complete!\n");
}

main().catch(console.error);
