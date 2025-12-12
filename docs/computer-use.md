# Computer Use Agent (CUA) - Implementation Reference

> **Issue:** #245  
> **Status:** Planned  
> **Model:** `computer-use-preview` (OpenAI)

---

## Overview

OpenAI's Computer Use Agent (CUA) combines vision capabilities with advanced reasoning to interact with computer interfaces. AutoDev uses CUA for visual testing of UI changes after applying diffs.

### Capabilities

- Navigate web applications via screenshots
- Click buttons, fill forms, scroll pages
- Verify visual elements exist
- Capture screenshots for documentation
- Execute E2E acceptance criteria

### Limitations

- ~38% accuracy on OSWorld benchmark (not fully reliable)
- Best for browser-based tasks
- May make mistakes - requires human oversight
- Cannot handle captchas or 2FA flows

---

## Architecture

### CUA Loop

```
User Goal: "Verify the login form works"
                    ↓
┌─────────────────────────────────────────────────────────┐
│                     CUA LOOP                             │
├─────────────────────────────────────────────────────────┤
│  1. Capture screenshot of current browser state         │
│                    ↓                                    │
│  2. Send screenshot + goal to computer-use-preview      │
│                    ↓                                    │
│  3. Model returns action (click, type, scroll, etc.)    │
│                    ↓                                    │
│  4. Execute action in browser via Playwright            │
│                    ↓                                    │
│  5. Wait for page to stabilize (1 second)               │
│                    ↓                                    │
│  6. Capture new screenshot                              │
│                    ↓                                    │
│  7. Send screenshot back with previous_response_id      │
│                    ↓                                    │
│  8. Repeat until goal achieved or max actions reached   │
└─────────────────────────────────────────────────────────┘
```

### Component Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                        AutoDev                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │   Foreman   │───▶│ CUA Agent   │───▶│  Playwright │      │
│  │  (trigger)  │    │  (control)  │    │  (browser)  │      │
│  └─────────────┘    └──────┬──────┘    └─────────────┘      │
│                            │                                 │
│                            ▼                                 │
│                    ┌─────────────┐                           │
│                    │   OpenAI    │                           │
│                    │     API     │                           │
│                    │ (computer-  │                           │
│                    │  use-preview)│                           │
│                    └─────────────┘                           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Action Types

The model can return these action types:

| Action | Parameters | Description |
|--------|------------|-------------|
| `click` | `x`, `y`, `button` | Single click at coordinates |
| `double_click` | `x`, `y`, `button` | Double click at coordinates |
| `type` | `text` | Type text via keyboard |
| `keypress` | `keys[]` | Press key combination (e.g., `["Enter"]`) |
| `scroll` | `x`, `y`, `scrollX`, `scrollY` | Scroll at position |
| `drag` | `startX`, `startY`, `path[]` | Drag from start through path points |
| `wait` | - | Wait 2 seconds |
| `screenshot` | - | Capture only, no action |

### Button Types

For `click` and `double_click`:
- `left` (default)
- `right` (context menu)
- `wheel` (middle click)
- `back`
- `forward`

### Key Names

For `keypress`, use Playwright key names:
- `Enter`, `Tab`, `Escape`, `Backspace`, `Delete`
- `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`
- `Control+a`, `Meta+c`, `Shift+Tab`

---

## Safety Checks

The model may return `pending_safety_checks` requiring acknowledgment:

### Safety Check Codes

| Code | Severity | Action | Description |
|------|----------|--------|-------------|
| `malicious_instructions` | **Critical** | **Block always** | User attempting harmful actions |
| `sensitive_domain` | **High** | **Block always** | Banking, government, healthcare sites |
| `irrelevant_domain` | Medium | Check allowlist | Navigating away from task URL |

### Handling Safety Checks

```typescript
private async handleSafetyChecks(call: any): Promise<{
  proceed: boolean;
  reason?: string;
  acknowledged?: Array<{ id: string; code: string; message: string }>;
}> {
  const pendingChecks = call.pending_safety_checks ?? [];
  
  if (pendingChecks.length === 0) {
    return { proceed: true };
  }

  const acknowledged = [];
  for (const check of pendingChecks) {
    console.log(`[CUA] Safety check: ${check.code} - ${check.message}`);
    
    // NEVER acknowledge malicious or sensitive
    if (check.code === "malicious_instructions" || 
        check.code === "sensitive_domain") {
      return { 
        proceed: false, 
        reason: `Blocked by ${check.code}: ${check.message}` 
      };
    }
    
    // Check allowlist for irrelevant_domain
    if (check.code === "irrelevant_domain") {
      const allowedUrls = (process.env.CUA_ALLOWED_URLS ?? "localhost").split(",");
      const currentUrl = await this.page!.url();
      const isAllowed = allowedUrls.some(url => currentUrl.includes(url));
      
      if (isAllowed) {
        acknowledged.push({
          id: check.id,
          code: check.code,
          message: check.message,
        });
      } else {
        return { 
          proceed: false, 
          reason: `URL not in allowlist: ${currentUrl}` 
        };
      }
    }
  }

  return { proceed: true, acknowledged };
}
```

### Sending Acknowledged Checks

When resuming after safety checks:

```typescript
response = await this.client.responses.create({
  model: "computer-use-preview",
  previous_response_id: response.id,
  tools: [/* ... */],
  input: [{
    call_id: call.call_id,
    type: "computer_call_output",
    output: {
      type: "input_image",
      image_url: `data:image/png;base64,${screenshot}`,
    },
  }],
  // Include acknowledged safety checks
  acknowledged_safety_checks: [
    { id: "check-123", code: "irrelevant_domain", message: "..." }
  ],
  truncation: "auto",
});
```

---

## Implementation

### ComputerUseAgent Class

```typescript
// src/agents/computer-use.ts
import OpenAI from "openai";
import { chromium, Page, Browser } from "playwright";

interface CUAAction {
  type: "click" | "double_click" | "scroll" | "type" | "keypress" | 
        "wait" | "screenshot" | "drag";
  x?: number;
  y?: number;
  button?: "left" | "right" | "wheel" | "back" | "forward";
  text?: string;
  keys?: string[];
  scrollX?: number;
  scrollY?: number;
  startX?: number;
  startY?: number;
  path?: Array<{ x: number; y: number }>;
}

interface CUAResult {
  success: boolean;
  actions: CUAAction[];
  screenshots: string[];
  finalOutput: any;
  error?: string;
}

export class ComputerUseAgent {
  private client: OpenAI;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private maxActions: number;

  constructor(options?: { maxActions?: number }) {
    this.client = new OpenAI({
      timeout: 15 * 60 * 1000,  // 15 min timeout for CUA
    });
    this.maxActions = options?.maxActions ?? 50;
  }

  async startBrowser(url: string): Promise<void> {
    this.browser = await chromium.launch({
      headless: process.env.CUA_BROWSER_HEADLESS !== "false",
      chromiumSandbox: true,
    });
    this.page = await this.browser.newPage();
    await this.page.setViewportSize({ width: 1024, height: 768 });
    await this.page.goto(url);
  }

  async executeGoal(goal: string): Promise<CUAResult> {
    if (!this.page) throw new Error("Browser not started");
    
    const screenshot = await this.captureScreenshot();

    const response = await this.client.responses.create({
      model: "computer-use-preview",
      tools: [{
        type: "computer_use_preview",
        display_width: 1024,
        display_height: 768,
        environment: "browser",
      }],
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: goal },
          { 
            type: "input_image", 
            image_url: `data:image/png;base64,${screenshot}` 
          },
        ],
      }],
      reasoning: { summary: "concise" },
      truncation: "auto",
    });

    return this.runCUALoop(response);
  }

  private async runCUALoop(response: any): Promise<CUAResult> {
    const actions: CUAAction[] = [];
    const screenshots: string[] = [];
    let actionCount = 0;

    while (actionCount < this.maxActions) {
      const computerCalls = response.output.filter(
        (item: any) => item.type === "computer_call"
      );

      if (computerCalls.length === 0) {
        // Goal achieved or model stopped
        break;
      }

      const call = computerCalls[0];
      const action = call.action as CUAAction;

      // Handle safety checks
      const safetyResult = await this.handleSafetyChecks(call);
      if (!safetyResult.proceed) {
        return {
          success: false,
          actions,
          screenshots,
          finalOutput: response.output,
          error: `Safety check blocked: ${safetyResult.reason}`,
        };
      }

      // Execute action
      await this.executeAction(action);
      actions.push(action);
      actionCount++;

      // Capture new screenshot
      await this.page!.waitForTimeout(1000);
      const newScreenshot = await this.captureScreenshot();
      screenshots.push(newScreenshot);

      // Send back to model
      response = await this.client.responses.create({
        model: "computer-use-preview",
        previous_response_id: response.id,
        tools: [{
          type: "computer_use_preview",
          display_width: 1024,
          display_height: 768,
          environment: "browser",
        }],
        input: [{
          call_id: call.call_id,
          type: "computer_call_output",
          output: {
            type: "input_image",
            image_url: `data:image/png;base64,${newScreenshot}`,
          },
        }],
        truncation: "auto",
        ...(safetyResult.acknowledged && {
          acknowledged_safety_checks: safetyResult.acknowledged,
        }),
      });
    }

    return { 
      success: true, 
      actions, 
      screenshots, 
      finalOutput: response.output 
    };
  }

  private async executeAction(action: CUAAction): Promise<void> {
    if (!this.page) throw new Error("Browser not started");

    switch (action.type) {
      case "click":
        await this.page.mouse.click(action.x!, action.y!, { 
          button: action.button ?? "left" 
        });
        break;
        
      case "double_click":
        await this.page.mouse.dblclick(action.x!, action.y!, { 
          button: action.button ?? "left" 
        });
        break;
        
      case "type":
        await this.page.keyboard.type(action.text!);
        break;
        
      case "scroll":
        await this.page.mouse.move(action.x!, action.y!);
        await this.page.evaluate(
          ([scrollX, scrollY]) => window.scrollBy(scrollX, scrollY),
          [action.scrollX ?? 0, action.scrollY ?? 0]
        );
        break;
        
      case "keypress":
        for (const key of action.keys ?? []) {
          await this.page.keyboard.press(key);
        }
        break;
        
      case "wait":
        await this.page.waitForTimeout(2000);
        break;
        
      case "drag":
        if (action.path && action.path.length > 0) {
          await this.page.mouse.move(action.startX!, action.startY!);
          await this.page.mouse.down();
          for (const point of action.path) {
            await this.page.mouse.move(point.x, point.y);
          }
          await this.page.mouse.up();
        }
        break;
        
      case "screenshot":
        // Capture only, no action needed
        break;
    }
  }

  private async captureScreenshot(): Promise<string> {
    if (!this.page) throw new Error("Browser not started");
    const buffer = await this.page.screenshot();
    return buffer.toString("base64");
  }

  async close(): Promise<void> {
    await this.browser?.close();
  }
}
```

---

## Docker Setup

For production, run CUA in an isolated container:

### Dockerfile.cua

```dockerfile
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Install dependencies
COPY package.json bun.lockb ./
RUN bun install --production

# Copy source
COPY src/ ./src/

# Security: Run as non-root user
RUN useradd -m -s /bin/bash cuauser && \
    chown -R cuauser:cuauser /app
USER cuauser

# Environment
ENV CUA_BROWSER_HEADLESS=true
ENV CUA_ALLOWED_URLS=localhost
ENV NODE_ENV=production

EXPOSE 3001

CMD ["bun", "run", "src/services/cua-worker.ts"]
```

### Docker Compose

```yaml
version: "3.8"

services:
  autodev:
    build: .
    ports:
      - "3000:3000"
    environment:
      - CUA_WORKER_URL=http://cua-worker:3001
    depends_on:
      - cua-worker
    networks:
      - internal

  cua-worker:
    build:
      context: .
      dockerfile: Dockerfile.cua
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - CUA_ALLOWED_URLS=${CUA_ALLOWED_URLS:-localhost}
      - CUA_MAX_ACTIONS=${CUA_MAX_ACTIONS:-50}
      - CUA_BROWSER_HEADLESS=true
    security_opt:
      - seccomp:unconfined  # Required for Chromium
    cap_drop:
      - ALL
    cap_add:
      - SYS_ADMIN  # Required for Chromium sandbox
    networks:
      - internal
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: "1.0"

networks:
  internal:
    driver: bridge
```

### Security Considerations

1. **Non-root execution**: CUA worker runs as `cuauser`
2. **Resource limits**: 2GB RAM, 1 CPU max
3. **Network isolation**: Internal network only
4. **Minimal capabilities**: Only `SYS_ADMIN` for Chromium sandbox
5. **URL allowlist**: Only test approved domains

---

## Integration with Foreman

### Visual Test Runner

```typescript
// src/services/foreman.ts
export interface VisualTestCase {
  goal: string;
  expectedOutcome: string;
}

export interface VisualTestResult {
  testCase: VisualTestCase;
  passed: boolean;
  screenshots: string[];
  actions: CUAAction[];
  error?: string;
}

export class Foreman {
  private cuaAgent?: ComputerUseAgent;

  async runVisualTests(
    appUrl: string,
    testCases: VisualTestCase[]
  ): Promise<{ results: VisualTestResult[]; passRate: number }> {
    // Validate URL is allowed
    const allowedUrls = (process.env.CUA_ALLOWED_URLS ?? "").split(",");
    if (!allowedUrls.some(url => appUrl.includes(url))) {
      throw new Error(`URL not allowed for CUA: ${appUrl}`);
    }

    this.cuaAgent = new ComputerUseAgent({ 
      maxActions: parseInt(process.env.CUA_MAX_ACTIONS ?? "50") 
    });
    await this.cuaAgent.startBrowser(appUrl);

    const results: VisualTestResult[] = [];
    
    for (const testCase of testCases) {
      try {
        const result = await this.cuaAgent.executeGoal(testCase.goal);
        results.push({
          testCase,
          passed: this.evaluateResult(result, testCase.expectedOutcome),
          screenshots: result.screenshots,
          actions: result.actions,
          error: result.error,
        });
      } catch (error: any) {
        results.push({
          testCase,
          passed: false,
          screenshots: [],
          actions: [],
          error: error.message,
        });
      }
    }

    await this.cuaAgent.close();
    
    const passRate = results.length > 0 
      ? (results.filter(r => r.passed).length / results.length) * 100 
      : 0;
      
    return { results, passRate };
  }

  private evaluateResult(result: CUAResult, expected: string): boolean {
    if (!result.success) return false;
    
    // Check final text output for success indicators
    const textOutputs = result.finalOutput.filter(
      (o: any) => o.type === "text"
    );
    const combinedText = textOutputs.map((o: any) => o.text).join(" ").toLowerCase();
    
    // Simple keyword matching
    const successKeywords = ["success", "verified", "found", "visible", "complete"];
    const hasSuccess = successKeywords.some(kw => combinedText.includes(kw));
    
    // Check expected outcome
    const expectedLower = expected.toLowerCase();
    const matchesExpected = combinedText.includes(expectedLower);
    
    return hasSuccess || matchesExpected;
  }
}
```

### Usage in Orchestrator

```typescript
// In orchestrator.ts after applying diff
if (process.env.ENABLE_COMPUTER_USE === "true" && task.visualTestCases) {
  const foreman = new Foreman();
  const visualResults = await foreman.runVisualTests(
    task.appUrl ?? "http://localhost:3000",
    task.visualTestCases
  );
  
  if (visualResults.passRate < 100) {
    // Store results for review
    await db.createVisualTestRun({
      taskId: task.id,
      appUrl: task.appUrl,
      testGoals: task.visualTestCases.map(tc => tc.goal),
      status: "failed",
      passRate: visualResults.passRate,
      results: visualResults.results,
      screenshots: visualResults.results.flatMap(r => r.screenshots),
    });
    
    // Trigger fix with visual feedback
    task.lastError = `Visual tests failed: ${visualResults.passRate}% pass rate`;
    return this.updateStatus(task, "TESTS_FAILED");
  }
}
```

---

## API Endpoints

### Run Visual Tests

```typescript
// POST /api/tasks/:id/visual-test
router.post("/api/tasks/:id/visual-test", async (req, res) => {
  const { id } = req.params;
  const { appUrl, testGoals } = req.body;
  
  // Validation
  if (!appUrl || !testGoals?.length) {
    return res.status(400).json({ 
      error: "appUrl and testGoals required" 
    });
  }
  
  const task = await db.getTask(id);
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }
  
  try {
    const foreman = new Foreman();
    const results = await foreman.runVisualTests(
      appUrl, 
      testGoals.map((goal: string) => ({ goal, expectedOutcome: "success" }))
    );
    
    // Store results
    await db.createVisualTestRun({
      taskId: id,
      appUrl,
      testGoals,
      status: results.passRate === 100 ? "passed" : "failed",
      passRate: results.passRate,
      results: results.results,
      screenshots: results.results.flatMap(r => r.screenshots),
    });
    
    return res.json(results);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});
```

### Get Visual Test Results

```typescript
// GET /api/tasks/:id/visual-tests
router.get("/api/tasks/:id/visual-tests", async (req, res) => {
  const { id } = req.params;
  
  const runs = await db.getVisualTestRuns(id);
  return res.json(runs);
});
```

---

## Database Schema

```sql
-- Visual test run results
CREATE TABLE visual_test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  
  -- Configuration
  app_url TEXT NOT NULL,
  test_goals TEXT[] NOT NULL,
  
  -- Results
  status VARCHAR(50) NOT NULL,  -- 'running', 'passed', 'failed'
  pass_rate DECIMAL(5,2),
  results JSONB NOT NULL DEFAULT '[]',
  
  -- Artifacts
  screenshots TEXT[],  -- Base64 or S3 URLs
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Index for task lookup
CREATE INDEX idx_visual_test_runs_task_id ON visual_test_runs(task_id);
CREATE INDEX idx_visual_test_runs_status ON visual_test_runs(status);
```

### Migration

```typescript
// lib/migrate.ts
await db.query(`
  CREATE TABLE IF NOT EXISTS visual_test_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    app_url TEXT NOT NULL,
    test_goals TEXT[] NOT NULL,
    status VARCHAR(50) NOT NULL,
    pass_rate DECIMAL(5,2),
    results JSONB NOT NULL DEFAULT '[]',
    screenshots TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
  );
  
  CREATE INDEX IF NOT EXISTS idx_visual_test_runs_task_id 
    ON visual_test_runs(task_id);
  CREATE INDEX IF NOT EXISTS idx_visual_test_runs_status 
    ON visual_test_runs(status);
`);
```

---

## Configuration Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_COMPUTER_USE` | `false` | Enable CUA integration |
| `OPENAI_API_KEY` | (required) | OpenAI API key |
| `CUA_TIMEOUT_MS` | `900000` | 15 minute timeout |
| `CUA_MAX_ACTIONS` | `50` | Max actions per goal |
| `CUA_BROWSER_HEADLESS` | `true` | Run browser headless |
| `CUA_ALLOWED_URLS` | `localhost` | Comma-separated allowlist |

### Example .env

```bash
# Enable CUA
ENABLE_COMPUTER_USE=true
OPENAI_API_KEY=sk-...

# CUA Configuration
CUA_TIMEOUT_MS=900000
CUA_MAX_ACTIONS=50
CUA_BROWSER_HEADLESS=true
CUA_ALLOWED_URLS=localhost,staging.autodev.example.com

# For Docker deployment
CUA_WORKER_URL=http://cua-worker:3001
```

---

## Use Cases

### 1. Visual Regression After Diff

```typescript
// After applying UI changes
const testCases = [
  { goal: "Verify the homepage loads without errors", expectedOutcome: "success" },
  { goal: "Check that the new button is visible in the header", expectedOutcome: "button visible" },
  { goal: "Click the new button and verify the modal opens", expectedOutcome: "modal open" },
];

const results = await foreman.runVisualTests("http://localhost:3000", testCases);
```

### 2. Acceptance Criteria Testing

```typescript
// From issue DoD
const acceptanceCriteria = [
  "User can log in with email/password",
  "Dashboard shows user's name after login",
  "Logout button returns to homepage",
];

const testCases = acceptanceCriteria.map(criterion => ({
  goal: `Verify: ${criterion}`,
  expectedOutcome: "verified",
}));
```

### 3. Screenshot Documentation

```typescript
// Capture screenshots of new feature
const result = await cuaAgent.executeGoal(`
  Navigate to the settings page.
  Find the new "Dark Mode" toggle.
  Take a screenshot showing the toggle.
  Click the toggle to enable dark mode.
  Take another screenshot showing the dark theme.
`);

// result.screenshots contains the captured images
```

### 4. Form Validation Testing

```typescript
const testCases = [
  { 
    goal: "Try to submit the form with empty fields and verify error messages appear", 
    expectedOutcome: "validation errors" 
  },
  { 
    goal: "Fill in valid data and submit, verify success message", 
    expectedOutcome: "success" 
  },
];
```

---

## Troubleshooting

### Browser fails to start

**Error:** `Failed to launch browser`

**Solution:** Ensure Playwright dependencies are installed:
```bash
bunx playwright install chromium
bunx playwright install-deps
```

### Safety check blocks action

**Error:** `Safety check blocked: malicious_instructions`

**Solution:** Review the goal text. CUA flags potentially harmful instructions. Rephrase to be more specific about the task.

### Actions not executing correctly

**Issue:** Clicks miss targets

**Possible causes:**
1. Page not fully loaded - add `wait` action
2. Viewport size mismatch - ensure 1024x768
3. Dynamic content - model needs updated screenshot

### Timeout on complex pages

**Error:** Request timeout

**Solution:** Increase `CUA_TIMEOUT_MS` or break into smaller goals:
```typescript
// Instead of one complex goal
// "Log in, navigate to settings, change password, log out"

// Break into multiple
["Log in with test credentials", 
 "Navigate to settings page",
 "Change password to newpassword123",
 "Log out"]
```

---

## References

- [OpenAI Computer Use Documentation](https://platform.openai.com/docs/guides/computer-use)
- [OpenAI CUA Sample App](https://github.com/openai/openai-cua-sample-app)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [AutoDev Issue #245](https://github.com/limaronaldo/MultiplAI/issues/245)

---

_Last updated: 2025-12-12_
