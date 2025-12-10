++ b/src/core/orchestrator.ts
import { createTaskLogger } from "./logger";
  private systemLogger = createTaskLogger('system', 'orchestrator');
      this.systemLogger.info(`Multi-agent mode ENABLED`);
      this.systemLogger.info(
        `Coders: ${this.multiAgentConfig.coderCount} (${this.multiAgentConfig.coderModels.join(", ")})`,
      );
      this.systemLogger.info(
        `Fixers: ${this.multiAgentConfig.fixerCount} (${this.multiAgentConfig.fixerModels.join(", ")})`,
      );
      this.getLogger(task).info(`Task ${task.id} is in terminal state: ${task.status}`);
    this.getLogger(task).info(`Task ${task.id}: ${task.status} -> action: ${action}`);
      this.getLogger(task).error(`Error processing task ${task.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  private getLogger(task: Task) {
    return createTaskLogger(task.id, 'orchestrator');
  }

    this.getLogger(task).error(`Task ${task.id} failed: ${reason}`);
      this.getLogger(task).error(`Failed to persist event for task ${task.id}: ${error instanceof Error ? error.message : 'Unknown database error'}`);
    this.getLogger(task).info(`Task ${task.id}: ${eventType} by ${agent}`);
      this.getLogger(task).info(
      this.getLogger(task).info(`[Coding] Winner: ${result.winner.model} (${result.reason})`);
      this.getLogger(task).info(
      this.getLogger(task).info(`[Fixing] Winner: ${result.winner.model} (${result.reason})`);
      this.getLogger(task).info(`[Review] Needs discussion - creating PR for human review`);
++ b/.env.example

# Logging
LOG_TO_FILE=false  # Set to true to enable logging to file (creates logs/ directory)