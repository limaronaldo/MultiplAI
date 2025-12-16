import type { SqlClient } from "../../integrations/db";
type Sql = SqlClient;
import {
  StaticMemory,
  StaticMemorySchema,
  RepoIdentifier,
  RepoConfigSchema,
  RepoContextSchema,
  RepoConstraints,
  RepoConstraintsSchema,
  repoToString,
} from "./static-types";

/**
 * Default constraints applied to all repos
 */
const DEFAULT_CONSTRAINTS: RepoConstraints = {
  allowedPaths: [
    "src/",
    "lib/",
    "tests/",
    "test/",
    "app/",
    "components/",
    "utils/",
  ],
  blockedPaths: [
    ".env",
    ".env.*",
    "secrets/",
    ".github/workflows/",
    "*.pem",
    "*.key",
  ],
  ignoredPatterns: ["node_modules/", "dist/", "build/", ".git/"],
  maxDiffLines: 300,
  maxFilesPerTask: 10,
  allowedComplexities: ["XS", "S"],
};

interface StaticMemoryRow {
  id: string;
  owner: string;
  repo: string;
  config: Record<string, unknown>;
  context: Record<string, unknown>;
  constraints: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

/**
 * StaticMemoryDBStore - Database-backed static memory storage
 *
 * Uses PostgreSQL for persistence, with in-memory caching
 * for performance during task execution.
 */
export class StaticMemoryDBStore {
  private cache: Map<string, StaticMemory> = new Map();
  private sql: Sql;

  constructor(sql: Sql) {
    this.sql = sql;
  }

  /**
   * Load static memory for a repository
   */
  async load(repo: RepoIdentifier): Promise<StaticMemory> {
    const key = repoToString(repo);

    // Return cached if available
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    // Load from database
    const result = await this.sql`
      SELECT config, context, constraints, created_at
      FROM static_memory
      WHERE owner = ${repo.owner} AND repo = ${repo.repo}
    `;

    let memory: StaticMemory;

    if (result.length > 0) {
      const row = result[0];
      memory = {
        repo,
        config: RepoConfigSchema.parse(row.config),
        context: RepoContextSchema.parse(row.context),
        constraints: RepoConstraintsSchema.parse({
          ...DEFAULT_CONSTRAINTS,
          ...row.constraints,
        }),
        loadedAt: new Date().toISOString(),
      };
    } else {
      // Return defaults for unconfigured repos
      memory = this.createDefaults(repo);
    }

    // Validate and cache
    const validated = StaticMemorySchema.parse(memory);
    this.cache.set(key, validated);

    return validated;
  }

  /**
   * Save static memory to database
   */
  async save(memory: StaticMemory): Promise<void> {
    const validated = StaticMemorySchema.parse(memory);

    await this.sql`
      INSERT INTO static_memory (owner, repo, config, context, constraints)
      VALUES (
        ${validated.repo.owner},
        ${validated.repo.repo},
        ${JSON.stringify(validated.config)},
        ${JSON.stringify(validated.context)},
        ${JSON.stringify(validated.constraints)}
      )
      ON CONFLICT (owner, repo)
      DO UPDATE SET
        config = EXCLUDED.config,
        context = EXCLUDED.context,
        constraints = EXCLUDED.constraints
    `;

    // Update cache
    this.cache.set(repoToString(validated.repo), validated);
  }

  /**
   * Delete static memory for a repo
   */
  async delete(repo: RepoIdentifier): Promise<void> {
    await this.sql`
      DELETE FROM static_memory WHERE owner = ${repo.owner} AND repo = ${repo.repo}
    `;
    this.cache.delete(repoToString(repo));
  }

  /**
   * Check if a repo has configuration
   */
  async exists(repo: RepoIdentifier): Promise<boolean> {
    const result = await this.sql`
      SELECT EXISTS(
        SELECT 1 FROM static_memory WHERE owner = ${repo.owner} AND repo = ${repo.repo}
      ) as exists
    `;
    return result[0]?.exists ?? false;
  }

  /**
   * List all configured repos
   */
  async listRepos(): Promise<RepoIdentifier[]> {
    const result = await this.sql`
      SELECT owner, repo FROM static_memory ORDER BY owner, repo
    `;
    return result.map((row) => ({
      owner: row.owner,
      repo: row.repo,
    }));
  }

  /**
   * Clear cache for a repo
   */
  invalidate(repo: RepoIdentifier): void {
    this.cache.delete(repoToString(repo));
  }

  /**
   * Clear all cache
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * Create default memory for unconfigured repos
   */
  private createDefaults(repo: RepoIdentifier): StaticMemory {
    return {
      repo,
      config: RepoConfigSchema.parse({
        name: repo.repo,
        defaultBranch: "main",
        language: "typescript",
      }),
      context: RepoContextSchema.parse({}),
      constraints: RepoConstraintsSchema.parse(DEFAULT_CONSTRAINTS),
      loadedAt: new Date().toISOString(),
    };
  }
}
