import { readFile, writeFile, mkdir, readdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import {
  StaticMemory,
  StaticMemorySchema,
  RepoIdentifier,
  RepoConfig,
  RepoConfigSchema,
  RepoContext,
  RepoContextSchema,
  RepoConstraints,
  RepoConstraintsSchema,
  repoToString,
} from "./static-types";

/**
 * Default constraints applied to all repos
 */
const DEFAULT_CONSTRAINTS: RepoConstraints = {
  allowedPaths: ["src/", "lib/", "tests/", "test/", "app/", "components/", "utils/"],
  blockedPaths: [".env", ".env.*", "secrets/", ".github/workflows/", "*.pem", "*.key"],
  ignoredPatterns: ["node_modules/", "dist/", "build/", ".git/"],
  maxDiffLines: 300,
  maxFilesPerTask: 10,
  allowedComplexities: ["XS", "S"],
};

/**
 * Default config for repos without explicit configuration
 */
const DEFAULT_CONFIG: Partial<RepoConfig> = {
  defaultBranch: "main",
  language: "typescript",
};

/**
 * StaticMemoryStore - Manages immutable per-repo configuration
 *
 * Static memory is loaded once when a task starts and remains
 * unchanged throughout the task lifecycle.
 *
 * Storage layout:
 * {configDir}/
 *   {owner}/
 *     {repo}/
 *       config.json      - RepoConfig
 *       context.json     - RepoContext
 *       constraints.json - RepoConstraints
 */
export class StaticMemoryStore {
  private cache: Map<string, StaticMemory> = new Map();
  private configDir: string;

  constructor(configDir: string = "./config/repos") {
    this.configDir = configDir;
  }

  /**
   * Load static memory for a repository
   * Returns cached version if available, otherwise loads from disk
   */
  async load(repo: RepoIdentifier): Promise<StaticMemory> {
    const key = repoToString(repo);

    // Return cached if available
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    // Load from disk or create defaults
    const memory = await this.loadFromDisk(repo);
    this.cache.set(key, memory);

    return memory;
  }

  /**
   * Load static memory from configuration files
   */
  private async loadFromDisk(repo: RepoIdentifier): Promise<StaticMemory> {
    const repoDir = join(this.configDir, repo.owner, repo.repo);

    // Load each component, using defaults if not found
    const config = await this.loadConfig(repoDir);
    const context = await this.loadContext(repoDir);
    const constraints = await this.loadConstraints(repoDir);

    const memory: StaticMemory = {
      repo,
      config,
      context,
      constraints,
      loadedAt: new Date().toISOString(),
    };

    // Validate the complete memory object
    return StaticMemorySchema.parse(memory);
  }

  /**
   * Load repo configuration
   */
  private async loadConfig(repoDir: string): Promise<RepoConfig> {
    const configPath = join(repoDir, "config.json");

    if (existsSync(configPath)) {
      try {
        const content = await readFile(configPath, "utf-8");
        const parsed = JSON.parse(content);
        return RepoConfigSchema.parse({ ...DEFAULT_CONFIG, ...parsed });
      } catch (error) {
        console.warn(`Failed to load config from ${configPath}:`, error);
      }
    }

    // Return minimal default config
    return RepoConfigSchema.parse({
      name: "unknown",
      ...DEFAULT_CONFIG,
    });
  }

  /**
   * Load repo context (detected patterns)
   */
  private async loadContext(repoDir: string): Promise<RepoContext> {
    const contextPath = join(repoDir, "context.json");

    if (existsSync(contextPath)) {
      try {
        const content = await readFile(contextPath, "utf-8");
        return RepoContextSchema.parse(JSON.parse(content));
      } catch (error) {
        console.warn(`Failed to load context from ${contextPath}:`, error);
      }
    }

    return RepoContextSchema.parse({});
  }

  /**
   * Load repo constraints
   */
  private async loadConstraints(repoDir: string): Promise<RepoConstraints> {
    const constraintsPath = join(repoDir, "constraints.json");

    if (existsSync(constraintsPath)) {
      try {
        const content = await readFile(constraintsPath, "utf-8");
        const parsed = JSON.parse(content);
        return RepoConstraintsSchema.parse({ ...DEFAULT_CONSTRAINTS, ...parsed });
      } catch (error) {
        console.warn(`Failed to load constraints from ${constraintsPath}:`, error);
      }
    }

    return RepoConstraintsSchema.parse(DEFAULT_CONSTRAINTS);
  }

  /**
   * Save static memory configuration to disk
   * Used for initial setup or updates (admin operation)
   */
  async save(memory: StaticMemory): Promise<void> {
    const validated = StaticMemorySchema.parse(memory);
    const repoDir = join(this.configDir, validated.repo.owner, validated.repo.repo);

    // Ensure directory exists
    await mkdir(repoDir, { recursive: true });

    // Save each component separately for easier editing
    await writeFile(
      join(repoDir, "config.json"),
      JSON.stringify(validated.config, null, 2)
    );

    await writeFile(
      join(repoDir, "context.json"),
      JSON.stringify(validated.context, null, 2)
    );

    await writeFile(
      join(repoDir, "constraints.json"),
      JSON.stringify(validated.constraints, null, 2)
    );

    // Update cache
    this.cache.set(repoToString(validated.repo), validated);
  }

  /**
   * Clear cached memory for a repo
   * Forces reload on next access
   */
  invalidate(repo: RepoIdentifier): void {
    this.cache.delete(repoToString(repo));
  }

  /**
   * Clear all cached memory
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * Check if a repo has explicit configuration
   */
  hasConfig(repo: RepoIdentifier): boolean {
    const repoDir = join(this.configDir, repo.owner, repo.repo);
    return existsSync(join(repoDir, "config.json"));
  }

  /**
   * List all configured repositories
   */
  async listConfiguredRepos(): Promise<RepoIdentifier[]> {
    const repos: RepoIdentifier[] = [];

    if (!existsSync(this.configDir)) {
      return repos;
    }

    try {
      const owners = await readdir(this.configDir);

      for (const owner of owners) {
        const ownerDir = join(this.configDir, owner);
        const repoNames = await readdir(ownerDir);

        for (const repo of repoNames) {
          if (existsSync(join(ownerDir, repo, "config.json"))) {
            repos.push({ owner, repo });
          }
        }
      }
    } catch (error) {
      console.warn("Failed to list configured repos:", error);
    }

    return repos;
  }
}

// =============================================================================
// SINGLETON MANAGEMENT
// =============================================================================

let defaultStore: StaticMemoryStore | null = null;

/**
 * Get the default StaticMemoryStore instance
 */
export function getStaticMemoryStore(): StaticMemoryStore {
  if (!defaultStore) {
    defaultStore = new StaticMemoryStore();
  }
  return defaultStore;
}

/**
 * Initialize the static memory store with a custom config directory
 */
export function initStaticMemoryStore(configDir: string): StaticMemoryStore {
  defaultStore = new StaticMemoryStore(configDir);
  return defaultStore;
}

/**
 * Reset the default store (useful for testing)
 */
export function resetStaticMemoryStore(): void {
  defaultStore = null;
}
