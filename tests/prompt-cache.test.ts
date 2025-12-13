import { describe, expect, it } from "bun:test";
import {
  InMemoryPromptCache,
  keyToString,
  sha256,
  type CacheKey,
} from "../src/core/prompt-cache/prompt-cache";

describe("prompt-cache", () => {
  it("keyToString is stable and includes hash", () => {
    const key: CacheKey = {
      type: "repo",
      identifier: "owner/repo:HEAD",
      contentHash: sha256("x"),
    };
    expect(keyToString(key)).toContain("repo:owner/repo:HEAD:");
    expect(keyToString(key)).toContain(key.contentHash);
  });

  it("getOrSet caches within TTL and expires", async () => {
    const cache = new InMemoryPromptCache(true);
    const key: CacheKey = { type: "file", identifier: "a", contentHash: sha256("a") };

    let computes = 0;
    const v1 = await cache.getOrSet(key, 50, async () => {
      computes++;
      return "value";
    });
    const v2 = await cache.getOrSet(key, 50, async () => {
      computes++;
      return "value2";
    });

    expect(v1).toBe("value");
    expect(v2).toBe("value");
    expect(computes).toBe(1);

    await new Promise((r) => setTimeout(r, 60));
    const v3 = await cache.getOrSet(key, 50, async () => {
      computes++;
      return "value3";
    });
    expect(v3).toBe("value3");
    expect(computes).toBe(2);

    const m = cache.metrics();
    expect(m.hits).toBeGreaterThanOrEqual(1);
    expect(m.misses).toBeGreaterThanOrEqual(1);
    expect(m.evictions).toBeGreaterThanOrEqual(1);
  });
});

