import { Task } from "./types";
import { getNextAction, isTerminal } from "./state-machine";
import { Orchestrator } from "./orchestrator";
import { db } from "../integrations/db";

export interface TaskRunnerConfig {
  maxSteps: number;
  maxDurationMs: number;
}

const DEFAULT_CONFIG: TaskRunnerConfig = {
  maxSteps: 50,
  maxDurationMs: 15 * 60 * 1000, // 15 minutes
};

/**
 * TaskRunner advances a single task through the orchestrator until it reaches
 * a stable state (WAIT), WAITING_HUMAN, or a terminal state.
 *
 * Notes:
 * - We intentionally keep the in-memory Task object as the source of truth
 *   across steps, because some fields (e.g., orchestrationState) are not yet
 *   persisted in the DB schema.
 * - We still persist progress to the DB after each step for observability.
 */
export class TaskRunner {
  private config: TaskRunnerConfig;
  private orchestrator: Orchestrator;

  constructor(orchestrator: Orchestrator, config: Partial<TaskRunnerConfig> = {}) {
    this.orchestrator = orchestrator;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async run(task: Task): Promise<Task> {
    const start = Date.now();
    let current: Task = task;

    for (let step = 0; step < this.config.maxSteps; step++) {
      if (isTerminal(current.status) || current.status === "WAITING_HUMAN") {
        break;
      }

      const action = getNextAction(current.status);
      if (action === "WAIT") {
        break;
      }

      current = await this.orchestrator.process(current);

      // Persist progress for dashboards/observability (ignore mapped return to keep in-memory fields)
      await db.updateTask(current.id, current);

      if (Date.now() - start > this.config.maxDurationMs) {
        break;
      }
    }

    return current;
  }
}

