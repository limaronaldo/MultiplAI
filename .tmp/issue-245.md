## Summary

Integrate OpenAI's Computer Use Agent (CUA) to enable visual testing of UI changes, automated browser testing, and screenshot-based validation.

## Background

From OpenAI's Computer Use documentation:

> "Computer use is a practical application of our Computer-Using Agent (CUA) model, which combines vision capabilities with advanced reasoning to simulate controlling computer interfaces and performing tasks."

AutoDev could use CUA to:
1. Visually verify UI changes after applying diffs
2. Run E2E tests by interacting with the actual application
3. Capture screenshots for documentation
4. Validate that changes don't break the UI

---

## CUA Loop Architecture

```
User Goal: "Verify the new button appears on the homepage"
                    ↓
┌─────────────────────────────────────────────────────────┐
│                     CUA LOOP                             │
├─────────────────────────────────────────────────────────┤
│  1. Send screenshot + goal to computer-use-preview      │
│                    ↓                                    │
│  2. Model returns action (click, type, scroll, wait)    │
│                    ↓                                    │
│  3. Execute action in browser (Playwright)              │
│                    ↓                                    │
│  4. Capture new screenshot                              │
│                    ↓                                    │
│  5. Send screenshot back to model                       │
│                    ↓                                    │
│  6. Repeat until goal achieved or model stops           │
└─────────────────────────────────────────────────────────┘
```

---

## Core Implementation

### 1. ComputerUseAgent Class

```typescript
// src/agents/computer-use.ts
import OpenAI from "openai";
import { chromium, Page, Browser } from "playwright";

interface CUAAction {
  type: "click" | "double_click" | "scroll" | "type" | "keypress" | "wait" | "screenshot" | "drag";
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

  private async handleSafetyChecks(call: any): Promise<{
    proceed: boolean;
    reason?: string;
    acknowledged?: Array<{ id: string; code: string; message: string }>;
  }> {
    const pendingChecks = call.pending_safety_checks ?? [];
    
    if (pendingChecks.length === 0) {
      return { proceed: true };
    }

    // Safety check codes:
    // - malicious_instructions: User trying to do something harmful
    // - irrelevant_domain: Navigating away from allowed URLs
    // - sensitive_domain: Banking, government, healthcare sites
    
    const acknowledged = [];
    for (const check of pendingChecks) {
      console.log(`[CUA] Safety check: ${check.code} - ${check.message}`);
      
      // Only acknowledge irrelevant_domain if URL is in allowlist
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
      
      // Never acknowledge malicious_instructions or sensitive_domain
      if (check.code === "malicious_instructions" || check.code === "sensitive_domain") {
        return { 
          proceed: false, 
          reason: `Blocked by ${check.code}: ${check.message}` 
        };
      }
    }

    return { proceed: true, acknowledged };
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
        // Just capture, don't do anything
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

## Docker Setup for Sandboxed Execution

For production, run CUA in an isolated Docker container:

### Dockerfile.cua

```dockerfile
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app

# Install dependencies
COPY package.json bun.lockb ./
RUN npm install

# Copy source
COPY src/ ./src/

# Security: Run as non-root user
RUN useradd -m cuauser
USER cuauser

# Environment
ENV CUA_BROWSER_HEADLESS=true
ENV CUA_ALLOWED_URLS=localhost

CMD ["bun", "run", "src/services/cua-worker.ts"]
```

### Docker Compose

```yaml
services:
  cua-worker:
    build:
      context: .
      dockerfile: Dockerfile.cua
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - CUA_ALLOWED_URLS=localhost,staging.example.com
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
```

---

## Integration with Foreman

```typescript
// src/services/foreman.ts
export class Foreman {
  private cuaAgent?: ComputerUseAgent;

  async runVisualTests(
    appUrl: string,
    testCases: VisualTestCase[]
  ): Promise<VisualTestResults> {
    // Validate URL is allowed
    const allowedUrls = (process.env.CUA_ALLOWED_URLS ?? "").split(",");
    if (!allowedUrls.some(url => appUrl.includes(url))) {
      throw new Error(`URL not allowed for CUA: ${appUrl}`);
    }

    this.cuaAgent = new ComputerUseAgent({ maxActions: 50 });
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
      } catch (error) {
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
    return { 
      results, 
      passRate: this.calculatePassRate(results) 
    };
  }

  private evaluateResult(
    result: CUAResult, 
    expected: string
  ): boolean {
    // Check if final output indicates success
    const textOutputs = result.finalOutput.filter(
      (o: any) => o.type === "text"
    );
    const combinedText = textOutputs.map((o: any) => o.text).join(" ");
    
    // Simple keyword matching for now
    // Could use LLM to evaluate semantic similarity
    return combinedText.toLowerCase().includes("success") ||
           combinedText.toLowerCase().includes("verified") ||
           combinedText.toLowerCase().includes("found");
  }

  private calculatePassRate(results: VisualTestResult[]): number {
    const passed = results.filter(r => r.passed).length;
    return results.length > 0 ? (passed / results.length) * 100 : 0;
  }
}
```

---

## Use Cases for AutoDev

### 1. Visual Regression Testing

```typescript
// After applying diff, verify UI hasn't broken
const cua = new ComputerUseAgent();
await cua.startBrowser("http://localhost:3000");
const result = await cua.executeGoal(
  "Navigate to the homepage and verify the main navigation is visible and functional"
);
```

### 2. E2E Test Execution

```typescript
// Run acceptance criteria as visual tests
const result = await cua.executeGoal(`
  Test the user login flow:
  1. Click the "Login" button
  2. Enter email "test@example.com"
  3. Enter password "password123"
  4. Click "Submit"
  5. Verify you see the dashboard
`);
```

### 3. Screenshot Documentation

```typescript
// Capture screenshots of new features
const result = await cua.executeGoal(
  "Navigate to the new settings page and take a screenshot showing the dark mode toggle"
);
```

---

## Safety Considerations

### Security Checklist

1. **Sandboxed browser**: Always use Chromium sandbox mode
2. **No credentials**: Never expose real auth tokens to CUA
3. **Allowlist URLs**: Only test known/safe URLs via `CUA_ALLOWED_URLS`
4. **Handle safety checks**: Never acknowledge `malicious_instructions` or `sensitive_domain`
5. **Timeout limits**: Cap CUA loop iterations (`maxActions: 50`)
6. **Docker isolation**: Run in isolated container with limited resources
7. **Non-root user**: Execute as non-privileged user in Docker

### Safety Check Types

| Code | Description | Action |
|------|-------------|--------|
| `malicious_instructions` | User trying harmful actions | **Block always** |
| `irrelevant_domain` | Navigating away from task | Check allowlist |
| `sensitive_domain` | Banking, gov, healthcare | **Block always** |

---

## Configuration

```bash
# Environment variables
ENABLE_COMPUTER_USE=true
OPENAI_API_KEY=sk-...
CUA_TIMEOUT_MS=900000              # 15 minutes
CUA_MAX_ACTIONS=50                 # Max actions per goal
CUA_BROWSER_HEADLESS=true
CUA_ALLOWED_URLS=localhost,staging.example.com
```

---

## Database Schema

```sql
CREATE TABLE visual_test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id),
  
  -- Test configuration
  app_url TEXT NOT NULL,
  test_goals TEXT[] NOT NULL,
  
  -- Results
  status VARCHAR(50),  -- running, passed, failed
  pass_rate DECIMAL(5,2),
  results JSONB,
  
  -- Artifacts
  screenshots TEXT[],  -- Base64 or S3 URLs
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Index for task lookup
CREATE INDEX idx_visual_test_runs_task_id ON visual_test_runs(task_id);
```

---

## API Endpoint

```typescript
// POST /api/tasks/:id/visual-test
router.post("/api/tasks/:id/visual-test", async (req, res) => {
  const { id } = req.params;
  const { appUrl, testGoals } = req.body;
  
  const task = await db.getTask(id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  
  const foreman = new Foreman();
  const results = await foreman.runVisualTests(appUrl, testGoals);
  
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
});
```

---

## Acceptance Criteria

- [ ] ComputerUseAgent class implementation
- [ ] Playwright browser integration  
- [ ] CUA loop with action execution (all 8 action types)
- [ ] Safety check handling (malicious, irrelevant, sensitive)
- [ ] Integration with Foreman
- [ ] Screenshot capture and storage
- [ ] API endpoint for visual test runs
- [ ] Configuration via environment variables
- [ ] Docker setup for sandboxed execution
- [ ] Documentation for visual testing workflow

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`
- Manual: <steps if applicable>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

## Complexity

**L** - New capability, external API, browser automation

## Limitations (from OpenAI)

- Model is 38.1% accurate on OSWorld (not fully reliable)
- Best for browser-based tasks
- May make mistakes, needs human oversight
- Requires explicit acknowledgment for safety checks

## References

- [OpenAI Computer Use Documentation](https://platform.openai.com/docs/guides/computer-use)
- [OpenAI CUA Sample App](https://github.com/openai/openai-cua-sample-app)
- [Playwright Documentation](https://playwright.dev/docs/intro)
