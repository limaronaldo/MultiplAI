export interface ReflectionInput {
  code: string;
  context?: string;
}

export interface ReflectionOutput {
  feedback: string;
  suggestions: string[];
}

export interface AgentConfig {
  model?: string;
  maxTokens?: number;
  temperature?: number;
++ b/prompts/reflection.md
# Test Failure Analysis and Reflection Prompt

## Purpose
This prompt guides the analysis of test failures, identification of root causes, and determination of next actions to improve code quality and prevent regressions.

## Instructions for Analyzing Test Failures
1. Review the test output logs, error messages, and stack traces.
2. Identify the failing test case, including the test name, expected vs. actual behavior, and any relevant input data.
3. Examine the code under test and related dependencies for potential issues.
4. Check for environmental factors such as system configuration, dependencies versions, or timing issues.
5. Reproduce the failure locally if possible to confirm the issue.

## Root Cause Categories
- **Code Bug**: Logic error, syntax issue, or incorrect implementation in the source code.
- **Test Flakiness**: Non-deterministic behavior due to race conditions, timing, or external dependencies.
- **Environment Issue**: Problems with test setup, CI/CD configuration, or system resources.
- **Dependency Problem**: Incompatible or outdated libraries, packages, or external services.
- **Data Issue**: Incorrect test data, fixtures, or database state.
- **Configuration Error**: Misconfigured settings, environment variables, or build parameters.

## Decision Criteria for Next Actions
- If root cause is a code bug, prioritize fixing the bug and adding regression tests.
- If test is flaky, investigate and stabilize the test or mark it as skipped with a follow-up task.
- If environmental, update configurations or infrastructure to prevent recurrence.
- If dependency-related, update or pin versions and verify compatibility.
- If data-related, improve test data management and validation.
- Always assess impact on other tests and consider running full test suites.

## Example Scenarios
### Scenario 1: Code Bug
Test: `userAuthenticationTest` fails with "Expected user to be logged in, but was not".
Analysis: Login function has a typo in password validation.
Action: Fix the typo and add a unit test for password validation.

### Scenario 2: Test Flakiness
Test: `apiResponseTimeTest` intermittently fails due to timeout.
Analysis: Race condition in asynchronous API calls.
Action: Implement retry logic or adjust timeout thresholds.

### Scenario 3: Environment Issue
Test: `databaseConnectionTest` fails in CI but passes locally.
Analysis: CI environment lacks required database credentials.
Action: Update CI configuration to include necessary secrets.

### Scenario 4: Dependency Problem
Test: `externalApiIntegrationTest` fails after library update.
Analysis: Breaking changes in the external API library.
Action: Update code to handle new API version and add compatibility tests.

### Scenario 5: Data Issue
Test: `dataProcessingTest` fails with incorrect output.
Analysis: Test fixture data is outdated.
Action: Refresh test data and add data validation checks.

### Scenario 6: Configuration Error
Test: `featureFlagTest` fails unexpectedly.
Analysis: Feature flag configuration is incorrect in test environment.
Action: Correct configuration and add configuration validation.
++ b/src/agents/reflection.ts
 constructor(prompt: string) {
   super(prompt);
 }
 async execute(input: ReflectionInput): Promise<ReflectionOutput> {
   // TODO: Implement reflection logic
   throw new Error('Not implemented');
 }
 // Helper method stub
 private reflectOnInput(input: ReflectionInput): string {
   // TODO: Implement reflection helper
   throw new Error('Not implemented');
 }
 // Another helper method stub
 private generateOutput(reflection: string): ReflectionOutput {
   // TODO: Implement output generation
   throw new Error('Not implemented');
 }
++ b/src/agents/reflection.ts
interface ParsedTestOutput {
  passed: boolean;
  errors: string[];
  summary: string;
}

export function parseTestOutput(output: string): ParsedTestOutput {
  if (!output || output.trim() === '') {
    return { passed: true, errors: [], summary: 'No test output provided' };
  }

  const lines = output.split('\n');
  const errors: string[] = [];
  let passed = true;
  let summary = '';

  // Detect common test formats (basic detection)
  const isJest = lines.some(line => line.includes('PASS') || line.includes('FAIL'));
  const isMocha = lines.some(line => line.includes('✓') || line.includes('✗'));

  for (const line of lines) {
    if (line.includes('FAIL') || line.includes('Error:') || line.includes('AssertionError')) {
      errors.push(line.trim());
      passed = false;
    }
    if (line.includes('Tests:') || line.includes('Summary:')) {
      summary = line.trim();
    }
  }

  // If no summary found, create one
  if (!summary) {
    summary = `Parsed ${lines.length} lines, found ${errors.length} errors`;
  }

  return { passed, errors, summary };
}
++ b/src/agents/reflection.ts
/**
 * Scoring constants for confidence calculation.
 * These weights determine the contribution of each factor to the overall confidence score.
 * All factors are expected to be normalized between 0 and 1.
 */
const ACCURACY_WEIGHT = 0.4;
const COMPLETENESS_WEIGHT = 0.3;
const RECENCY_WEIGHT = 0.3;

/**
 * Interface for factors used in confidence calculation.
 */
interface ConfidenceFactors {
  accuracy?: number; // Normalized score for accuracy (0-1)
  completeness?: number; // Normalized score for completeness (0-1)
  recency?: number; // Normalized score for recency (0-1)
}

/**
 * Calculates a confidence score between 0 and 1 based on multiple factors.
 * Handles missing data by defaulting to 0 for undefined factors.
 * @param factors - Object containing optional accuracy, completeness, and recency scores.
 * @returns Confidence score as a number between 0 and 1.
 */
export function calculateConfidence(factors: ConfidenceFactors): number {
  const accuracy = factors.accuracy ?? 0;
  const completeness = factors.completeness ?? 0;
  const recency = factors.recency ?? 0;

  // Ensure factors are clamped between 0 and 1
  const clampedAccuracy = Math.max(0, Math.min(1, accuracy));
  const clampedCompleteness = Math.max(0, Math.min(1, completeness));
  const clampedRecency = Math.max(0, Math.min(1, recency));

  const score = ACCURACY_WEIGHT * clampedAccuracy +
                COMPLETENESS_WEIGHT * clampedCompleteness +
                RECENCY_WEIGHT * clampedRecency;

  // Clamp the final score to ensure it's between 0 and 1
  return Math.max(0, Math.min(1, score));
}
++ b/src/agents/reflection.ts
 reflections: z.array(z.string()),
 insights: z.string(),
 constructor(private llm: { call: (prompt: string) => Promise<string> }) {}
 async execute(input: string): Promise<ReflectionOutput> {
   try {
     console.log('Starting reflection execution');
     const prompt = `Reflect on the following input and provide structured reflections and insights: ${input}`;
     const response = await this.llm.call(prompt);
     const parsed = ReflectionOutputSchema.parse(JSON.parse(response));
     console.log('Reflection completed successfully');
     return parsed;
   } catch (error) {
     console.error('Error in reflection execution:', error);
     throw new Error('Failed to execute reflection');
   }
 }
++ b/src/agents/reflection.test.ts
 describe('parseTestOutput', () => {
   it('should parse successful test output', () => {
     const output = 'PASS: test1\nPASS: test2\n';
     const result = parseTestOutput(output);
     expect(result).toEqual({
       passed: 2,
       failed: 0,
       total: 2,
     });
   });
   it('should parse failed test output', () => {
     const output = 'PASS: test1\nFAIL: test2\nPASS: test3\n';
     const result = parseTestOutput(output);
     expect(result).toEqual({
       passed: 2,
       failed: 1,
       total: 3,
     });
   });
   it('should handle empty output', () => {
     const output = '';
     const result = parseTestOutput(output);
     expect(result).toEqual({
       passed: 0,
       failed: 0,
       total: 0,
     });
   });
 });
 describe('calculateConfidence', () => {
   it('should calculate high confidence for all passes', () => {
     const stats = { passed: 10, failed: 0, total: 10 };
     const confidence = calculateConfidence(stats);
     expect(confidence).toBe(1.0);
   });
   it('should calculate low confidence for many failures', () => {
     const stats = { passed: 2, failed: 8, total: 10 };
     const confidence = calculateConfidence(stats);
     expect(confidence).toBe(0.2);
   });
   it('should handle zero total tests', () => {
     const stats = { passed: 0, failed: 0, total: 0 };
     const confidence = calculateConfidence(stats);
     expect(confidence).toBe(0);
   });
 });
 describe('execute', () => {
   beforeEach(() => {
     vi.clearAllMocks();
   });
   it('should execute with mocked LLM and return result', async () => {
     const mockLLM = vi.fn().mockResolvedValue('Mocked LLM response');
     // Assuming execute takes an LLM function
     const result = await execute(mockLLM);
     expect(mockLLM).toHaveBeenCalled();
     expect(result).toBe('Mocked LLM response');
   });
   it('should handle LLM errors', async () => {
     const mockLLM = vi.fn().mockRejectedValue(new Error('LLM error'));
     await expect(execute(mockLLM)).rejects.toThrow('LLM error');
   });
 });
          `Failed to parse JSON from LLM response: ${textStr.slice(0, 200)}...`,
        );
      }
    }
  }

  /**
   * Fix unescaped newlines inside JSON string values
   */
  private fixJsonNewlines(jsonStr: string): string {
    // State machine to track if we're inside a string
    let result = "";
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < jsonStr.length; i++) {
      const char = jsonStr[i];

      if (escapeNext) {
        result += char;
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        result += char;
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        result += char;
        continue;
      }

      // If we're inside a string and hit a newline, escape it
      if (inString && (char === "\n" || char === "\r")) {
        if (char === "\r" && jsonStr[i + 1] === "\n") {
          result += "\\n";
          i++; // Skip the \n
        } else if (char === "\n") {
          result += "\\n";
        } else {
          result += "\\r";
        }
        continue;
      }

      result += char;
    }

    return result;
  }

  /**
   * More aggressive JSON fixing for edge cases
   */
  private aggressiveJsonFix(jsonStr: string): string {
    // Method 1: Try to find diff content between "diff": " and the next key
    // This handles cases where the diff contains unescaped quotes/newlines
    const diffStartMatch = jsonStr.match(/"diff"\s*:\s*"/);
    if (diffStartMatch) {
      const diffStart = diffStartMatch.index! + diffStartMatch[0].length;

      // Find where the diff ends - look for ",\s*"commitMessage or ",\s*"filesModified or "\s*}
      let diffEnd = -1;
      const endPatterns = [
        /"\s*,\s*"commitMessage/,
        /"\s*,\s*"filesModified/,
        /"\s*,\s*"fixDescription/,
        /"\s*,\s*"notes/,
        /"\s*}/,
      ];

      for (const pattern of endPatterns) {
        const match = jsonStr.slice(diffStart).match(pattern);
        if (match && match.index !== undefined) {
          const pos = diffStart + match.index;
          if (diffEnd === -1 || pos < diffEnd) {
            diffEnd = pos;
          }
        }
      }

      if (diffEnd > diffStart) {
        const rawDiff = jsonStr.slice(diffStart, diffEnd);

        // Properly escape the diff content
        const escapedDiff = rawDiff
          .replace(/\\/g, "\\\\") // Escape backslashes first
          .replace(/"/g, '\\"') // Escape quotes
          .replace(/\n/g, "\\n") // Escape newlines
          .replace(/\r/g, "\\r") // Escape carriage returns
          .replace(/\t/g, "\\t"); // Escape tabs

        // Rebuild the JSON with escaped diff
        const before = jsonStr.slice(0, diffStart);
        const after = jsonStr.slice(diffEnd);
        const fixedJson = before + escapedDiff + after;

        try {
          JSON.parse(fixedJson); // Validate it parses
          return fixedJson;
        } catch {
          // Continue to other methods
        }
      }
    }

    // Method 2: Direct extraction and reconstruction
    // Find the diff content more robustly by looking for the pattern
    const diffContentMatch = jsonStr.match(
      /"diff"\s*:\s*"([\s\S]+?)(?:"\s*,\s*"(?:commitMessage|filesModified|notes|fixDescription)|"\s*\})/,
    );

    if (diffContentMatch) {
      try {
        // Extract other fields
        const commitMatch = jsonStr.match(
          /"commitMessage"\s*:\s*"((?:[^"\\]|\\.)*)"/,
        );
        const filesMatch = jsonStr.match(
          /"filesModified"\s*:\s*\[([\s\S]*?)\]/,
        );
        const notesMatch = jsonStr.match(/"notes"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        const fixDescMatch = jsonStr.match(
          /"fixDescription"\s*:\s*"((?:[^"\\]|\\.)*)"/,
        );

        // Properly escape the diff - handle already-escaped sequences
        let diff = diffContentMatch[1];

        // First, normalize any double-escaped sequences
        diff = diff.replace(/\\\\/g, "\x00BACKSLASH\x00"); // Temp placeholder

        // Escape unescaped quotes (not preceded by backslash)
        diff = diff.replace(/(?<!\\)"/g, '\\"');

        // Escape real newlines (not \n sequences)
        diff = diff.replace(/\r\n/g, "\\n");
        diff = diff.replace(/\n/g, "\\n");
        diff = diff.replace(/\r/g, "\\r");
        diff = diff.replace(/\t/g, "\\t");

        // Restore backslashes
        diff = diff.replace(/\x00BACKSLASH\x00/g, "\\\\");

        const result: Record<string, unknown> = {
          diff: diff,
          commitMessage: commitMatch
            ? commitMatch[1]
            : "feat: implement changes",
          filesModified: filesMatch
            ? filesMatch[1]
                .split(",")
                .map((f: string) => f.trim().replace(/^["'\s]+|["'\s]+$/g, ""))
                .filter(Boolean)
            : [],
        };

        if (notesMatch) result.notes = notesMatch[1];
        if (fixDescMatch) result.fixDescription = fixDescMatch[1];

        const rebuilt = JSON.stringify(result);
        JSON.parse(rebuilt); // Validate
        return rebuilt;
      } catch {
        // Continue to method 3
      }
    }

    // Method 3: Try to fix by removing problematic characters
    try {
      // Remove any control characters except \n \r \t
      const cleaned = jsonStr.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
      JSON.parse(cleaned);
      return cleaned;
    } catch {
      // Give up
    }

    return jsonStr;
  }
}
