import {
  defaultResolverConfig,
  type ExtractedEntity,
  type ResolvedEntity,
  type ResolverConfig,
  type EntityRelationship,
} from "./types";

function stableKey(parts: Array<string | number | null | undefined>): string {
  return parts
    .map((p) => (p === null || p === undefined ? "" : String(p)))
    .join("|");
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/[_\-\s]+/g, " ");
}

function trigrams(s: string): Map<string, number> {
  const str = `  ${s}  `;
  const grams = new Map<string, number>();
  for (let i = 0; i < str.length - 2; i++) {
    const g = str.slice(i, i + 3);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  return grams;
}

function cosineSimilarity(a: string, b: string): number {
  const aa = trigrams(a);
  const bb = trigrams(b);
  let dot = 0;
  let na = 0;
  let nb = 0;

  for (const v of aa.values()) na += v * v;
  for (const v of bb.values()) nb += v * v;
  if (na === 0 || nb === 0) return 0;

  for (const [k, av] of aa.entries()) {
    const bv = bb.get(k);
    if (bv) dot += av * bv;
  }

  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function mergeUniqueStrings(a: string[], b: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of [...a, ...b]) {
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function mergeRelationships(
  a: EntityRelationship[],
  b: EntityRelationship[],
): EntityRelationship[] {
  const out: EntityRelationship[] = [];
  const seen = new Set<string>();
  for (const rel of [...a, ...b]) {
    const key = stableKey([rel.type, rel.targetId]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(rel);
  }
  return out;
}

function entityAlias(e: ExtractedEntity): string {
  const fp = e.filePath ?? "";
  return stableKey([e.name, fp]);
}

function exactMatch(a: ExtractedEntity, b: ExtractedEntity): boolean {
  return (
    a.entityType === b.entityType &&
    a.name === b.name &&
    (a.filePath ?? null) === (b.filePath ?? null)
  );
}

function signatureMatch(a: ExtractedEntity, b: ExtractedEntity): boolean {
  if (a.entityType !== b.entityType) return false;
  const sa = a.signature ?? null;
  const sb = b.signature ?? null;
  return !!sa && sa === sb;
}

function fuzzyMatch(a: ExtractedEntity, b: ExtractedEntity): number {
  if (a.entityType !== b.entityType) return 0;
  return cosineSimilarity(normalizeName(a.name), normalizeName(b.name));
}

function inferRelationships(
  entity: ExtractedEntity,
  candidates: Array<ResolvedEntity | ExtractedEntity>,
  nameToCanonicalId: Map<string, string>,
): EntityRelationship[] {
  const content = entity.content ?? "";
  if (!content) return [];

  const relations: EntityRelationship[] = [];

  const addRel = (type: EntityRelationship["type"], targetName: string) => {
    const targetId = nameToCanonicalId.get(targetName);
    if (!targetId) return;
    if (targetId === (entity as any).canonicalId) return;
    relations.push({ type, targetId });
  };

  const escapeRegExp = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // imports: `import { X } ...` and `import X from ...`
  const importNamed = /import\s+\{([^}]+)\}\s+from\s+['"][^'"]+['"]/g;
  for (const m of content.matchAll(importNamed)) {
    const names = (m[1] ?? "")
      .split(",")
      .map((p) => p.trim().split(/\s+as\s+/)[0]?.trim())
      .filter(Boolean);
    for (const n of names) addRel("imports", n);
  }

  const importDefault = /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"][^'"]+['"]/g;
  for (const m of content.matchAll(importDefault)) {
    const n = (m[1] ?? "").trim();
    if (n) addRel("imports", n);
  }

  // extends / implements
  const extendsRe = /extends\s+([A-Za-z_$][\w$]*)/g;
  for (const m of content.matchAll(extendsRe)) {
    const n = (m[1] ?? "").trim();
    if (n) addRel("extends", n);
  }

  const implementsRe =
    /implements\s+([A-Za-z_$][\w$]*(?:\s*,\s*[A-Za-z_$][\w$]*)*)/g;
  for (const m of content.matchAll(implementsRe)) {
    const list = (m[1] ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    for (const n of list) addRel("implements", n);
  }

  // uses: best-effort identifier usage; only count known names
  for (const c of candidates) {
    if (!c.name) continue;
    const re = new RegExp(`\\\\b${escapeRegExp(c.name)}\\\\b`, "g");
    if (re.test(content)) addRel("uses", c.name);
  }

  return relations;
}

export class EntityResolver {
  private config: ResolverConfig;

  constructor(config: Partial<ResolverConfig> = {}) {
    this.config = { ...defaultResolverConfig, ...config };
  }

  resolve(
    extracted: ExtractedEntity[],
    existing: ResolvedEntity[] = [],
  ): ResolvedEntity[] {
    const resolved: ResolvedEntity[] = existing.map((e) => ({
      ...e,
      aliases: [...(e.aliases ?? [])],
      relationships: [...(e.relationships ?? [])],
      mergedFrom: [...(e.mergedFrom ?? [])],
    }));

    const byCanonical = new Map<string, ResolvedEntity>(
      resolved.map((e) => [e.canonicalId, e]),
    );

    const nameToCanonicalId = new Map<string, string>();
    for (const e of resolved) {
      nameToCanonicalId.set(e.name, e.canonicalId);
      for (const a of e.aliases) {
        const aliasName = a.split("|")[0];
        if (aliasName) nameToCanonicalId.set(aliasName, e.canonicalId);
      }
    }

    const ensureResolved = (e: ExtractedEntity): ResolvedEntity => ({
      ...e,
      canonicalId: e.id,
      aliases: [entityAlias(e)],
      relationships: [],
      mergedFrom: [e.id],
    });

    const mergeInto = (target: ResolvedEntity, incoming: ExtractedEntity) => {
      target.aliases = mergeUniqueStrings(target.aliases, [entityAlias(incoming)]);
      target.mergedFrom = mergeUniqueStrings(target.mergedFrom, [incoming.id]);
      target.metadata = { ...(incoming.metadata ?? {}), ...(target.metadata ?? {}) };
      target.content = target.content ?? incoming.content ?? null;
      target.signature = target.signature ?? incoming.signature ?? null;
      if (!target.filePath && incoming.filePath) target.filePath = incoming.filePath;
    };

    // First pass: match/merge extracted entities into canonical entities
    for (const e of extracted) {
      let match: ResolvedEntity | null = null;

      for (const candidate of resolved) {
        if (exactMatch(e, candidate) || signatureMatch(e, candidate)) {
          match = candidate;
          break;
        }
      }

      if (!match) {
        let bestScore = 0;
        let best: ResolvedEntity | null = null;
        for (const candidate of resolved) {
          const score = fuzzyMatch(e, candidate);
          if (score > bestScore) {
            bestScore = score;
            best = candidate;
          }
        }
        if (best && bestScore >= this.config.fuzzyMatchThreshold) {
          match = best;
        }
      }

      if (!match) {
        const next = ensureResolved(e);
        resolved.push(next);
        byCanonical.set(next.canonicalId, next);
        nameToCanonicalId.set(next.name, next.canonicalId);
        continue;
      }

      mergeInto(match, e);
      nameToCanonicalId.set(e.name, match.canonicalId);
      const fp = e.filePath ?? null;
      if (fp) nameToCanonicalId.set(stableKey([e.name, fp]), match.canonicalId);
    }

    // Second pass: infer relationships from content
    for (const e of resolved) {
      const inferred = inferRelationships(e, resolved, nameToCanonicalId);
      e.relationships = mergeRelationships(e.relationships, inferred);
    }

    return resolved;
  }
}
