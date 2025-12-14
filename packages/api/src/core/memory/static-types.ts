import { z } from "zod";

// =============================================================================
// STATIC MEMORY SCHEMAS
// =============================================================================

/**
 * Repository identifier schema
 */
export const RepoIdentifierSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
});

export type RepoIdentifier = z.infer<typeof RepoIdentifierSchema>;

/**
 * Repository configuration schema
 * Defines how AutoDev should behave for this repo
 */
export const RepoConfigSchema = z.object({
  // Basic info
  name: z.string(),
  defaultBranch: z.string().default("main"),

  // Tech stack detection
  language: z.enum(["typescript", "javascript", "python", "rust", "go", "other"]),
  framework: z.string().optional(),
  packageManager: z.enum(["npm", "yarn", "pnpm", "bun", "pip", "cargo", "go"]).optional(),

  // Testing configuration
  testCommand: z.string().optional(),
  buildCommand: z.string().optional(),
  lintCommand: z.string().optional(),

  // Agent-specific instructions (optional overrides)
  agentInstructions: z.object({
    planner: z.string().optional(),
    coder: z.string().optional(),
    reviewer: z.string().optional(),
  }).optional(),
});

export type RepoConfig = z.infer<typeof RepoConfigSchema>;

/**
 * Repository context schema
 * Key files and patterns detected in the repo
 */
export const RepoContextSchema = z.object({
  // Important files for understanding the repo
  entryPoints: z.array(z.string()).default([]),
  configFiles: z.array(z.string()).default([]),

  // Detected patterns
  hasTests: z.boolean().default(false),
  hasCI: z.boolean().default(false),
  hasTypeScript: z.boolean().default(false),

  // Directory structure hints
  srcDir: z.string().optional(),
  testDir: z.string().optional(),
});

export type RepoContext = z.infer<typeof RepoContextSchema>;

/**
 * Repository constraints schema
 * What AutoDev can and cannot modify
 */
export const RepoConstraintsSchema = z.object({
  // Paths AutoDev is allowed to modify
  allowedPaths: z.array(z.string()).default(["src/", "lib/", "tests/", "test/"]),

  // Paths AutoDev must NEVER touch
  blockedPaths: z.array(z.string()).default([
    ".env",
    ".env.*",
    "secrets/",
    ".github/workflows/",
    "*.pem",
    "*.key",
  ]),

  // File patterns to ignore
  ignoredPatterns: z.array(z.string()).default([
    "node_modules/",
    "dist/",
    "build/",
    ".git/",
  ]),

  // Maximum diff size (lines)
  maxDiffLines: z.number().default(300),

  // Maximum files to modify in one task
  maxFilesPerTask: z.number().default(10),

  // Complexity limits
  allowedComplexities: z.array(z.enum(["XS", "S"])).default(["XS", "S"]),
});

export type RepoConstraints = z.infer<typeof RepoConstraintsSchema>;

/**
 * Complete Static Memory schema
 * Immutable per-repo configuration loaded at task start
 */
export const StaticMemorySchema = z.object({
  repo: RepoIdentifierSchema,
  config: RepoConfigSchema,
  context: RepoContextSchema,
  constraints: RepoConstraintsSchema,
  loadedAt: z.string().datetime(),
});

export type StaticMemory = z.infer<typeof StaticMemorySchema>;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a repo identifier string (owner/repo format)
 */
export function repoToString(repo: RepoIdentifier): string {
  return `${repo.owner}/${repo.repo}`;
}

/**
 * Parse a repo string into RepoIdentifier
 */
export function parseRepoString(repoString: string): RepoIdentifier {
  const [owner, repo] = repoString.split("/");
  return RepoIdentifierSchema.parse({ owner, repo });
}

/**
 * Check if a path is allowed based on constraints
 */
export function isPathAllowed(path: string, constraints: RepoConstraints): boolean {
  // Check blocked paths first
  for (const blocked of constraints.blockedPaths) {
    if (matchesPattern(path, blocked)) {
      return false;
    }
  }

  // Check if path is in allowed list
  for (const allowed of constraints.allowedPaths) {
    if (path.startsWith(allowed)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a path should be ignored
 */
export function isPathIgnored(path: string, constraints: RepoConstraints): boolean {
  for (const pattern of constraints.ignoredPatterns) {
    if (matchesPattern(path, pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Simple glob-like pattern matching
 * Supports * wildcards
 */
function matchesPattern(path: string, pattern: string): boolean {
  // Direct prefix match
  if (path.startsWith(pattern)) {
    return true;
  }

  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\./g, "\\.")
    .replace(/\*/g, ".*");

  try {
    return new RegExp(`^${regexPattern}`).test(path);
  } catch {
    return false;
  }
}
