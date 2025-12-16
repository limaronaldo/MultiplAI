import { CoderAgent } from "../agents/coder";
import { FixerAgent } from "../agents/fixer";
import { CoderOutput, FixerOutput } from "./types";
import {
  AgentCandidate,
  CoderCandidate,
  FixerCandidate,
  MultiAgentConfig,
} from "./multi-agent-types";

/**
 * Multi-Coder Runner
 *
 * Runs multiple coder agents in parallel with different models,
 * returning all successful outputs for consensus evaluation.
 */
export class MultiCoderRunner {
  private config: MultiAgentConfig;

  constructor(config: MultiAgentConfig) {
    this.config = config;
  }

  /**
   * Run multiple coders in parallel
   */
  async run(input: {
    definitionOfDone: string[];
    plan: string[];
    targetFiles: string[];
    fileContents: Record<string, string>;
    previousDiff?: string;
    lastError?: string;
  }): Promise<CoderCandidate[]> {
    const models = this.config.coderModels.slice(0, this.config.coderCount);

    console.log(
      `[MultiCoder] Starting ${models.length} coders in parallel...`
    );
    console.log(`[MultiCoder] Models: ${models.join(", ")}`);

    const startTime = Date.now();

    // Create promises for each coder
    const promises = models.map(async (model, index) => {
      const id = `coder_${index}_${model.replace(/\//g, "_")}`;
      const agentStart = Date.now();

      try {
        // Create coder with specific model
        const coder = new CoderAgent(model);

        const output = await Promise.race([
          coder.run(input),
          this.timeout<CoderOutput>(this.config.timeout, model),
        ]);

        const duration = Date.now() - agentStart;

        // Extract token count from logs (approximation)
        const tokens = this.estimateTokens(output.diff);

        console.log(
          `[MultiCoder] ${model} completed in ${(duration / 1000).toFixed(1)}s`
        );

        return {
          id,
          model,
          output,
          duration,
          tokens,
        } as CoderCandidate;
      } catch (error) {
        const duration = Date.now() - agentStart;
        console.error(
          `[MultiCoder] ${model} failed after ${(duration / 1000).toFixed(1)}s:`,
          error
        );

        return {
          id,
          model,
          output: null as any,
          duration,
          tokens: 0,
          error: error instanceof Error ? error.message : String(error),
        } as CoderCandidate;
      }
    });

    // Wait for all to complete (successful or failed)
    const results = await Promise.allSettled(promises);

    const candidates: CoderCandidate[] = [];
    for (const result of results) {
      if (result.status === "fulfilled" && result.value.output) {
        candidates.push(result.value);
      }
    }

    const totalDuration = Date.now() - startTime;
    console.log(
      `[MultiCoder] ${candidates.length}/${models.length} succeeded in ${(totalDuration / 1000).toFixed(1)}s`
    );

    if (candidates.length === 0) {
      throw new Error("All coders failed - no candidates available");
    }

    return candidates;
  }

  private timeout<T>(ms: number, model: string): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Timeout after ${ms}ms for ${model}`));
      }, ms);
    });
  }

  private estimateTokens(diff: string): number {
    // Rough estimate: ~4 chars per token
    return Math.ceil(diff.length / 4);
  }
}

/**
 * Multi-Fixer Runner
 *
 * Runs multiple fixer agents in parallel with different models.
 */
export class MultiFixerRunner {
  private config: MultiAgentConfig;

  constructor(config: MultiAgentConfig) {
    this.config = config;
  }

  /**
   * Run multiple fixers in parallel
   */
  async run(input: {
    definitionOfDone: string[];
    plan: string[];
    currentDiff: string;
    errorLogs: string;
    fileContents: Record<string, string>;
  }): Promise<FixerCandidate[]> {
    const models = this.config.fixerModels.slice(0, this.config.fixerCount);

    console.log(
      `[MultiFixer] Starting ${models.length} fixers in parallel...`
    );
    console.log(`[MultiFixer] Models: ${models.join(", ")}`);

    const startTime = Date.now();

    const promises = models.map(async (model, index) => {
      const id = `fixer_${index}_${model.replace(/\//g, "_")}`;
      const agentStart = Date.now();

      try {
        const fixer = new FixerAgent(model);

        const output = await Promise.race([
          fixer.run(input),
          this.timeout<FixerOutput>(this.config.timeout, model),
        ]);

        const duration = Date.now() - agentStart;
        const tokens = this.estimateTokens(output.diff);

        console.log(
          `[MultiFixer] ${model} completed in ${(duration / 1000).toFixed(1)}s`
        );

        return {
          id,
          model,
          output,
          duration,
          tokens,
        } as FixerCandidate;
      } catch (error) {
        const duration = Date.now() - agentStart;
        console.error(
          `[MultiFixer] ${model} failed after ${(duration / 1000).toFixed(1)}s:`,
          error
        );

        return {
          id,
          model,
          output: null as any,
          duration,
          tokens: 0,
          error: error instanceof Error ? error.message : String(error),
        } as FixerCandidate;
      }
    });

    const results = await Promise.allSettled(promises);

    const candidates: FixerCandidate[] = [];
    for (const result of results) {
      if (result.status === "fulfilled" && result.value.output) {
        candidates.push(result.value);
      }
    }

    const totalDuration = Date.now() - startTime;
    console.log(
      `[MultiFixer] ${candidates.length}/${models.length} succeeded in ${(totalDuration / 1000).toFixed(1)}s`
    );

    if (candidates.length === 0) {
      throw new Error("All fixers failed - no candidates available");
    }

    return candidates;
  }

  private timeout<T>(ms: number, model: string): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Timeout after ${ms}ms for ${model}`));
      }, ms);
    });
  }

  private estimateTokens(diff: string): number {
    return Math.ceil(diff.length / 4);
  }
}
