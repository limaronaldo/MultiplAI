import type { Sql } from "postgres";
import {
  StaticMemory,
  RepoIdentifier,
} from "./static-types";
import { StaticMemoryStore } from "./static-memory-store";
import { StaticMemoryDBStore } from "./static-memory-db-store";
import { SessionMemoryStore } from "./session-memory-store";
import {
  SessionMemory,
  getAttemptSummary,
  getFailurePatterns,
} from "./session-types";
import {
  AgentType,
  ContextRequest,
  ContextIncludes,
  CompiledContext,
  CompiledContextSchema,
  DEFAULT_INCLUDES,
} from "./context-types";

/**
 * Agent system prompts - stable prefix for caching
 */
const AGENT_PROMPTS: Record<AgentType, { identity: string; instructions: string; outputFormat: string }> = {
  initializer: {
    identity: "You are an initialization agent that prepares context for coding tasks.",
    instructions: "Analyze the issue and prepare structured context for the coding agent.",
    outputFormat: "JSON with validated fields",
  },
  planner: {
    identity: "You are a senior tech lead planning the implementation of a GitHub issue.",
    instructions: "Create a detailed implementation plan with clear acceptance criteria.",
    outputFormat: "JSON with definitionOfDone, plan, targetFiles, estimatedComplexity",
  },
  coder: {
    identity: "You are an expert software engineer implementing a planned change.",
    instructions: "Follow the implementation plan exactly. Generate clean, idiomatic code.",
    outputFormat: "JSON with unified diff and commit message",
  },
  fixer: {
    identity: "You are a debugging expert fixing code that failed tests or validation.",
    instructions: "Analyze the error, understand what went wrong, and generate a corrected diff.",
    outputFormat: "JSON with corrected unified diff and explanation",
  },
  validator: {
    identity: "You are a code validator checking output before applying changes.",
    instructions: "Validate the diff format, check paths, and verify the changes are safe.",
    outputFormat: "JSON with validation result and any errors",
  },
  reviewer: {
    identity: "You are a code reviewer ensuring quality and correctness.",
    instructions: "Review the changes against the definition of done and best practices.",
    outputFormat: "JSON with verdict (APPROVE/REQUEST_CHANGES) and comments",
  },
  orchestrator: {
    identity: "You are an orchestration agent coordinating task execution.",
    instructions: "Determine the next action based on current task state.",
    outputFormat: "JSON with action and parameters",
  },
};

/**
 * MemoryManager - The Context Compiler
 *
 * Core principle: "Context is computed, not accumulated"
 *
 * This service compiles minimal, focused context for each agent call
 * by combining static memory (repo config) and session memory (task state).
 */
export class MemoryManager {
  private staticFileStore: StaticMemoryStore;
  private staticDbStore: StaticMemoryDBStore | null = null;
  private sessionStore: SessionMemoryStore | null = null;

  constructor(options: {
    configDir?: string;
    sql?: Sql;
  } = {}) {
    this.staticFileStore = new StaticMemoryStore(options.configDir);

    if (options.sql) {
      this.staticDbStore = new StaticMemoryDBStore(options.sql);
      this.sessionStore = new SessionMemoryStore(options.sql);
    }
  }

  /**
   * Compile context for an agent call
   *
   * This is the main entry point - it takes a request and returns
   * a minimal, focused context optimized for the specific agent.
   */
  async compileContext(
    request: ContextRequest,
    repo: RepoIdentifier,
    fileContents?: Record<string, string>
  ): Promise<CompiledContext> {
    // Merge default includes with request overrides
    const includes: ContextIncludes = {
      ...DEFAULT_INCLUDES[request.agentType],
      ...request.include,
    };

    // Load memories
    const staticMemory = await this.loadStaticMemory(repo);
    const sessionMemory = this.sessionStore
      ? await this.sessionStore.load(request.taskId)
      : null;

    // Get agent prompts
    const prompts = AGENT_PROMPTS[request.agentType];

    // Build compiled context
    const context: CompiledContext = {
      // Stable prefix
      systemIdentity: prompts.identity,
      agentInstructions: this.buildAgentInstructions(prompts.instructions, staticMemory),
      outputFormat: prompts.outputFormat,

      // Constraints
      constraints: {
        allowedPaths: staticMemory.constraints.allowedPaths,
        blockedPaths: staticMemory.constraints.blockedPaths,
        maxDiffLines: staticMemory.constraints.maxDiffLines,
        maxFilesPerTask: staticMemory.constraints.maxFilesPerTask,
      },

      // Task context (always included)
      task: {
        issueTitle: sessionMemory?.context.issueTitle ?? "",
        issueNumber: sessionMemory?.context.issueNumber ?? 0,
        issueBody: includes.issueBody ? sessionMemory?.context.issueBody : undefined,
      },

      // Metadata
      metadata: {
        compiledAt: new Date().toISOString(),
        agentType: request.agentType,
        attemptNumber: sessionMemory?.attempts.current ?? 0,
        tokenEstimate: 0, // Will be calculated
      },
    };

    // Add plan context if requested
    if (includes.planContext && sessionMemory?.context.definitionOfDone) {
      context.plan = {
        definitionOfDone: sessionMemory.context.definitionOfDone,
        steps: sessionMemory.context.implementationPlan?.map(s => s.description) ?? [],
        targetFiles: sessionMemory.context.targetFiles ?? [],
      };
    }

    // Add code context if requested
    if (includes.currentDiff || includes.fileContents) {
      context.code = {
        currentDiff: includes.currentDiff ? (sessionMemory?.context.currentDiff ?? "") : "",
        fileContents: includes.fileContents ? (fileContents ?? {}) : {},
      };
    }

    // Add error context if requested (for fixer)
    if (includes.previousAttempts > 0 && sessionMemory) {
      const hasErrors = sessionMemory.attempts.attempts.some(a => a.failureReason);
      if (hasErrors) {
        const lastAttempt = sessionMemory.attempts.attempts[sessionMemory.attempts.attempts.length - 1];
        context.errors = {
          lastError: lastAttempt?.failureReason ?? "",
          attemptSummary: getAttemptSummary(sessionMemory.attempts),
          failurePatterns: getFailurePatterns(sessionMemory.attempts),
        };
      }
    }

    // Add review context if requested
    if (includes.reviewFeedback && sessionMemory?.context.reviewComments) {
      context.review = {
        comments: sessionMemory.context.reviewComments.map(c => ({
          file: c.file,
          comment: c.comment,
        })),
        verdict: sessionMemory.context.reviewVerdict ?? "PENDING",
      };
    }

    // Estimate tokens
    context.metadata.tokenEstimate = this.estimateTokens(context);

    return CompiledContextSchema.parse(context);
  }

  /**
   * Load static memory (tries DB first, falls back to file)
   */
  private async loadStaticMemory(repo: RepoIdentifier): Promise<StaticMemory> {
    if (this.staticDbStore) {
      try {
        return await this.staticDbStore.load(repo);
      } catch {
        // Fall back to file store
      }
    }
    return await this.staticFileStore.load(repo);
  }

  /**
   * Build agent instructions with repo-specific customizations
   */
  private buildAgentInstructions(baseInstructions: string, staticMemory: StaticMemory): string {
    const parts = [baseInstructions];

    // Add repo-specific hints
    if (staticMemory.config.language) {
      parts.push(`Language: ${staticMemory.config.language}`);
    }
    if (staticMemory.config.framework) {
      parts.push(`Framework: ${staticMemory.config.framework}`);
    }

    // Add agent-specific overrides from config
    // (This would be expanded based on agentInstructions in RepoConfig)

    return parts.join("\n");
  }

  /**
   * Rough token estimate for context sizing
   */
  private estimateTokens(context: CompiledContext): number {
    const json = JSON.stringify(context);
    // Rough estimate: ~4 chars per token
    return Math.ceil(json.length / 4);
  }

  /**
   * Get session store for direct access
   */
  getSessionStore(): SessionMemoryStore | null {
    return this.sessionStore;
  }

  /**
   * Get static file store for direct access
   */
  getStaticFileStore(): StaticMemoryStore {
    return this.staticFileStore;
  }

  /**
   * Get static DB store for direct access
   */
  getStaticDbStore(): StaticMemoryDBStore | null {
    return this.staticDbStore;
  }

  /**
   * Invalidate all caches
   */
  invalidateAll(): void {
    this.staticFileStore.invalidateAll();
    this.staticDbStore?.invalidateAll();
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let defaultManager: MemoryManager | null = null;

/**
 * Get the default MemoryManager instance
 */
export function getMemoryManager(): MemoryManager {
  if (!defaultManager) {
    defaultManager = new MemoryManager();
  }
  return defaultManager;
}

/**
 * Initialize the MemoryManager with database connection
 */
export function initMemoryManager(sql: Sql, configDir?: string): MemoryManager {
  defaultManager = new MemoryManager({ sql, configDir });
  return defaultManager;
}

/**
 * Reset the default manager (useful for testing)
 */
export function resetMemoryManager(): void {
  defaultManager = null;
}
