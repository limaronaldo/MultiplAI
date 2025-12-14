import { createHash } from "node:crypto";

export type PromptCacheType = "system" | "repo" | "file" | "template";

export interface CacheKey {
  type: PromptCacheType;
  identifier: string;
  contentHash: string;
}

export interface PromptCacheMetrics {
  enabled: boolean;
  hits: number;
  misses: number;
  sets: number;
  evictions: number;
  entries: number;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function keyToString(key: CacheKey): string {
  return `${key.type}:${key.identifier}:${key.contentHash}`;
}

export interface PromptCache {
  enabled: boolean;
  get(key: CacheKey): string | null;
  set(key: CacheKey, value: string, ttlMs: number): void;
  getOrSet(key: CacheKey, ttlMs: number, compute: () => Promise<string>): Promise<string>;
  metrics(): PromptCacheMetrics;
}

interface Entry {
  value: string;
  expiresAt: number;
}

export class InMemoryPromptCache implements PromptCache {
  enabled: boolean;
  private store = new Map<string, Entry>();
  private hits = 0;
  private misses = 0;
  private sets = 0;
  private evictions = 0;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  get(key: CacheKey): string | null {
    if (!this.enabled) return null;
    const k = keyToString(key);
    const entry = this.store.get(k);
    if (!entry) {
      this.misses++;
      return null;
    }
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(k);
      this.evictions++;
      this.misses++;
      return null;
    }
    this.hits++;
    return entry.value;
  }

  set(key: CacheKey, value: string, ttlMs: number): void {
    if (!this.enabled) return;
    this.sets++;
    this.store.set(keyToString(key), { value, expiresAt: Date.now() + ttlMs });
  }

  async getOrSet(
    key: CacheKey,
    ttlMs: number,
    compute: () => Promise<string>,
  ): Promise<string> {
    const cached = this.get(key);
    if (cached !== null) return cached;
    const value = await compute();
    this.set(key, value, ttlMs);
    return value;
  }

  metrics(): PromptCacheMetrics {
    return {
      enabled: this.enabled,
      hits: this.hits,
      misses: this.misses,
      sets: this.sets,
      evictions: this.evictions,
      entries: this.store.size,
    };
  }
}

let singleton: PromptCache | null = null;

function envBool(name: string, defaultValue: boolean): boolean {
  const v = process.env[name];
  if (!v) return defaultValue;
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
}

export function getPromptCache(): PromptCache {
  if (singleton) return singleton;

  const enabled = envBool("ENABLE_PROMPT_CACHE", false);
  const backend = (process.env.PROMPT_CACHE_BACKEND || "memory").toLowerCase();

  if (backend !== "memory") {
    console.warn(`[PromptCache] Unsupported backend "${backend}", using memory`);
  }

  singleton = new InMemoryPromptCache(enabled);
  return singleton;
}

export function getPromptCacheTtlMs(type: PromptCacheType): number {
  const parse = (name: string, fallback: number) => {
    const v = process.env[name];
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  switch (type) {
    case "system":
      return parse("PROMPT_CACHE_SYSTEM_TTL_MS", 24 * 60 * 60 * 1000);
    case "template":
      return parse("PROMPT_CACHE_TEMPLATE_TTL_MS", 24 * 60 * 60 * 1000);
    case "repo":
      return parse("PROMPT_CACHE_REPO_TTL_MS", 60 * 60 * 1000);
    case "file":
      return parse("PROMPT_CACHE_FILE_TTL_MS", 5 * 60 * 1000);
  }
}

