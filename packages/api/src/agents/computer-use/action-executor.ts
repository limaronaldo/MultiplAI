/**
 * Action Executor for Browser Automation
 * Issue #317 - Translates CUA actions to Playwright commands
 */

import type { Page } from "playwright";
import type { CUAAction } from "./types";

export class ActionExecutor {
  constructor(private page: Page) {}

  /**
   * Execute a CUA action on the browser page
   */
  async execute(action: CUAAction): Promise<void> {
    switch (action.type) {
      case "click":
        await this.page.mouse.click(action.x, action.y, {
          button: action.button ?? "left",
        });
        break;

      case "double_click":
        await this.page.mouse.dblclick(action.x, action.y);
        break;

      case "type":
        await this.page.keyboard.type(action.text);
        break;

      case "scroll":
        await this.page.mouse.move(action.x, action.y);
        await this.page.evaluate(
          ([scrollX, scrollY]) => {
            window.scrollBy(scrollX, scrollY);
          },
          [action.scrollX ?? 0, action.scrollY ?? 0]
        );
        break;

      case "keypress":
        for (const key of action.keys) {
          await this.page.keyboard.press(key);
        }
        break;

      case "wait":
        await this.page.waitForTimeout(action.duration ?? 2000);
        break;

      case "drag":
        await this.executeDrag(action);
        break;

      case "screenshot":
        // No-op - screenshots are handled separately by BrowserManager
        break;

      default:
        throw new Error(`Unknown action type: ${(action as any).type}`);
    }
  }

  /**
   * Execute a drag action with optional path
   */
  private async executeDrag(action: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    path?: Array<{ x: number; y: number }>;
  }): Promise<void> {
    const { startX, startY, endX, endY, path } = action;

    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();

    if (path && path.length > 0) {
      // Follow the specified path
      for (const point of path) {
        await this.page.mouse.move(point.x, point.y);
      }
    }

    await this.page.mouse.move(endX, endY);
    await this.page.mouse.up();
  }

  /**
   * Execute multiple actions in sequence
   */
  async executeAll(actions: CUAAction[]): Promise<void> {
    for (const action of actions) {
      await this.execute(action);
    }
  }
}
