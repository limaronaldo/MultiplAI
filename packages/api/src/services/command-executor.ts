import { spawn } from "child_process";
import { z } from "zod";

// ============================================
// Command Types (Allowlist)
// ============================================

export const AllowedCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("npm_install"),
    packages: z.array(z.string()),
    dev: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("bun_add"),
    packages: z.array(z.string()),
    dev: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("pnpm_add"),
    packages: z.array(z.string()),
    dev: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("yarn_add"),
    packages: z.array(z.string()),
    dev: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("prisma_migrate"),
    name: z.string(),
  }),
  z.object({
    type: z.literal("prisma_generate"),
  }),
  z.object({
    type: z.literal("prisma_db_push"),
  }),
  z.object({
    type: z.literal("drizzle_generate"),
  }),
  z.object({
    type: z.literal("drizzle_migrate"),
  }),
  z.object({
    type: z.literal("create_directory"),
    path: z.string(),
  }),
  z.object({
    type: z.literal("typecheck"),
  }),
  z.object({
    type: z.literal("lint_fix"),
  }),
  z.object({
    type: z.literal("format"),
  }),
  z.object({
    type: z.literal("custom"),
    command: z.string(),
    args: z.array(z.string()).optional(),
    allowUnsafe: z.literal(true), // Must explicitly acknowledge unsafe
  }),
]);

export type AllowedCommand = z.infer<typeof AllowedCommandSchema>;

// ============================================
// Command Result
// ============================================

export interface CommandResult {
  success: boolean;
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number | null;
  duration: number;
  error?: string;
}

// ============================================
// Security Blocklist
// ============================================

const BLOCKED_PATTERNS = [
  // Dangerous file operations
  /rm\s+(-rf?|--recursive|--force)/i,
  /rmdir/i,
  /del\s+\/[sfq]/i, // Windows delete
  /format\s+[a-z]:/i, // Windows format drive

  // Privilege escalation
  /sudo/i,
  /su\s+-/,
  /doas/i,
  /pkexec/i,
  /runas/i,

  // Remote code execution
  /curl.*\|.*sh/i,
  /wget.*\|.*sh/i,
  /curl.*\|.*bash/i,
  /wget.*\|.*bash/i,
  /\|\s*(ba)?sh/i,

  // Dangerous permissions
  /chmod\s+(777|666|[\+\-][rwx]{3})/i,
  /chown/i,
  /chgrp/i,

  // Code execution
  /\beval\b/i,
  /\bexec\b/i,
  /\$\(/, // Command substitution
  /`[^`]+`/, // Backtick execution

  // Environment manipulation
  /export\s+PATH=/i,
  /export\s+LD_/i,

  // Network attacks
  /nc\s+-[el]/i, // netcat listen/exec
  /ncat/i,
  /socat/i,

  // System modification
  /systemctl/i,
  /service\s+\w+\s+(start|stop|restart)/i,
  /\/(etc|var|usr|bin|sbin)\//i,

  // Credential theft
  /\.ssh/i,
  /\.aws/i,
  /\.env(?!\.example)/i,
  /credentials/i,
  /secrets/i,

  // Git manipulation (dangerous)
  /git\s+push\s+.*--force/i,
  /git\s+reset\s+--hard/i,

  // Process manipulation
  /kill\s+-9/i,
  /pkill/i,
  /killall/i,
];

// Package name validation (prevent injection)
const VALID_PACKAGE_NAME = /^(@[\w-]+\/)?[\w.-]+(@[\w.-]+)?$/;

// Path validation (no traversal)
const SAFE_PATH = /^[\w./-]+$/;
const PATH_TRAVERSAL = /\.\./;

// ============================================
// Command Executor Service
// ============================================

export interface CommandExecutorConfig {
  workDir: string;
  timeout: number; // ms
  allowCustomCommands: boolean;
  dryRun: boolean;
}

const DEFAULT_CONFIG: CommandExecutorConfig = {
  workDir: process.cwd(),
  timeout: 60000, // 60 seconds
  allowCustomCommands: false,
  dryRun: false,
};

export class CommandExecutor {
  private config: CommandExecutorConfig;
  private executionLog: CommandResult[] = [];

  constructor(config: Partial<CommandExecutorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute a validated command
   */
  async execute(command: AllowedCommand): Promise<CommandResult> {
    // Validate command structure
    const validated = AllowedCommandSchema.safeParse(command);
    if (!validated.success) {
      return this.createErrorResult(
        "unknown",
        [],
        `Invalid command structure: ${validated.error.message}`,
      );
    }

    // Build shell command and args
    const { cmd, args } = this.buildCommand(command);

    // Validate against blocklist
    const fullCommand = `${cmd} ${args.join(" ")}`;
    const blockReason = this.checkBlocklist(fullCommand);
    if (blockReason) {
      return this.createErrorResult(cmd, args, `Blocked: ${blockReason}`);
    }

    // Dry run mode
    if (this.config.dryRun) {
      console.log(`[DRY RUN] Would execute: ${fullCommand}`);
      const result: CommandResult = {
        success: true,
        command: cmd,
        args,
        stdout: "[DRY RUN]",
        stderr: "",
        exitCode: 0,
        duration: 0,
      };
      this.executionLog.push(result);
      return result;
    }

    // Execute command
    const result = await this.runCommand(cmd, args);

    // Log execution
    this.executionLog.push(result);
    this.logExecution(result);

    return result;
  }

  /**
   * Execute multiple commands in order
   */
  async executeAll(
    commands: AllowedCommand[],
  ): Promise<{ results: CommandResult[]; allSucceeded: boolean }> {
    const results: CommandResult[] = [];
    let allSucceeded = true;

    for (const command of commands) {
      const result = await this.execute(command);
      results.push(result);

      if (!result.success) {
        allSucceeded = false;
        break; // Stop on first failure
      }
    }

    return { results, allSucceeded };
  }

  /**
   * Build command and args from AllowedCommand
   */
  private buildCommand(command: AllowedCommand): {
    cmd: string;
    args: string[];
  } {
    switch (command.type) {
      case "npm_install":
        return {
          cmd: "npm",
          args: [
            "install",
            ...(command.dev ? ["--save-dev"] : []),
            ...this.sanitizePackages(command.packages),
          ],
        };

      case "bun_add":
        return {
          cmd: "bun",
          args: [
            "add",
            ...(command.dev ? ["--dev"] : []),
            ...this.sanitizePackages(command.packages),
          ],
        };

      case "pnpm_add":
        return {
          cmd: "pnpm",
          args: [
            "add",
            ...(command.dev ? ["--save-dev"] : []),
            ...this.sanitizePackages(command.packages),
          ],
        };

      case "yarn_add":
        return {
          cmd: "yarn",
          args: [
            "add",
            ...(command.dev ? ["--dev"] : []),
            ...this.sanitizePackages(command.packages),
          ],
        };

      case "prisma_migrate":
        return {
          cmd: "npx",
          args: [
            "prisma",
            "migrate",
            "dev",
            "--name",
            this.sanitizeName(command.name),
          ],
        };

      case "prisma_generate":
        return {
          cmd: "npx",
          args: ["prisma", "generate"],
        };

      case "prisma_db_push":
        return {
          cmd: "npx",
          args: ["prisma", "db", "push"],
        };

      case "drizzle_generate":
        return {
          cmd: "npx",
          args: ["drizzle-kit", "generate"],
        };

      case "drizzle_migrate":
        return {
          cmd: "npx",
          args: ["drizzle-kit", "migrate"],
        };

      case "create_directory":
        return {
          cmd: "mkdir",
          args: ["-p", this.sanitizePath(command.path)],
        };

      case "typecheck":
        return {
          cmd: "npx",
          args: ["tsc", "--noEmit"],
        };

      case "lint_fix":
        return {
          cmd: "npx",
          args: ["eslint", "--fix", "."],
        };

      case "format":
        return {
          cmd: "npx",
          args: ["prettier", "--write", "."],
        };

      case "custom":
        if (!this.config.allowCustomCommands) {
          throw new Error("Custom commands are disabled");
        }
        return {
          cmd: command.command,
          args: command.args || [],
        };

      default:
        throw new Error(`Unknown command type: ${(command as any).type}`);
    }
  }

  /**
   * Sanitize package names to prevent injection
   */
  private sanitizePackages(packages: string[]): string[] {
    return packages.map((pkg) => {
      if (!VALID_PACKAGE_NAME.test(pkg)) {
        throw new Error(`Invalid package name: ${pkg}`);
      }
      return pkg;
    });
  }

  /**
   * Sanitize path to prevent traversal
   */
  private sanitizePath(path: string): string {
    if (!SAFE_PATH.test(path) || PATH_TRAVERSAL.test(path)) {
      throw new Error(`Invalid path: ${path}`);
    }
    return path;
  }

  /**
   * Sanitize name (for migrations, etc.)
   */
  private sanitizeName(name: string): string {
    // Only allow alphanumeric, underscore, hyphen
    const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, "_");
    if (sanitized.length === 0 || sanitized.length > 100) {
      throw new Error(`Invalid name: ${name}`);
    }
    return sanitized;
  }

  /**
   * Check command against blocklist
   */
  private checkBlocklist(command: string): string | null {
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(command)) {
        return `Matches blocked pattern: ${pattern.source}`;
      }
    }
    return null;
  }

  /**
   * Run command with timeout
   */
  private runCommand(cmd: string, args: string[]): Promise<CommandResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let stdout = "";
      let stderr = "";

      const proc = spawn(cmd, args, {
        cwd: this.config.workDir,
        shell: false, // No shell - prevent injection
        timeout: this.config.timeout,
        env: {
          ...process.env,
          // Limit potentially dangerous env vars
          NODE_ENV: "development",
        },
      });

      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        resolve({
          success: code === 0,
          command: cmd,
          args,
          stdout: stdout.slice(0, 10000), // Limit output size
          stderr: stderr.slice(0, 10000),
          exitCode: code,
          duration: Date.now() - startTime,
        });
      });

      proc.on("error", (error) => {
        resolve({
          success: false,
          command: cmd,
          args,
          stdout,
          stderr,
          exitCode: null,
          duration: Date.now() - startTime,
          error: error.message,
        });
      });
    });
  }

  /**
   * Create error result without executing
   */
  private createErrorResult(
    cmd: string,
    args: string[],
    error: string,
  ): CommandResult {
    return {
      success: false,
      command: cmd,
      args,
      stdout: "",
      stderr: "",
      exitCode: null,
      duration: 0,
      error,
    };
  }

  /**
   * Log execution for audit trail
   */
  private logExecution(result: CommandResult): void {
    const status = result.success ? "✓" : "✗";
    const cmd = `${result.command} ${result.args.join(" ")}`;
    console.log(
      `[CommandExecutor] ${status} ${cmd} (${result.duration}ms, exit: ${result.exitCode})`,
    );

    if (!result.success && result.error) {
      console.log(`[CommandExecutor] Error: ${result.error}`);
    }
    if (!result.success && result.stderr) {
      console.log(`[CommandExecutor] Stderr: ${result.stderr.slice(0, 500)}`);
    }
  }

  /**
   * Get execution history
   */
  getExecutionLog(): CommandResult[] {
    return [...this.executionLog];
  }

  /**
   * Clear execution history
   */
  clearLog(): void {
    this.executionLog = [];
  }
}
