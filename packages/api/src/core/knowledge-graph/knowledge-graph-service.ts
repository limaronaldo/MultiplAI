import { createHash } from "node:crypto";
import type { Task } from "../types";
import { EntityExtractorAgent } from "../../agents/entity-extractor/types";
import { EntityResolver } from "./entity-resolver";
import { TemporalTracker, type TemporalEntity } from "./temporal-tracker";
import {
  MultiHopRetriever,
  type TemporalRelationship,
  type HopResult,
} from "./multi-hop-retriever";
import type { ExtractedEntity, ResolvedEntity, RelationshipKind } from "./types";
import { knowledgeGraphSync } from "./sync-service";

export type RiskLevel = "low" | "medium" | "high";

export interface EnhancedKnowledgeContext {
  entities: ResolvedEntity[];
  dependencies: HopResult[];
  recentChanges: TemporalEntity[];
  impactRadius: number;
  summary: string;
}

export interface ImpactAnalysis {
  changedFiles: string[];
  directEntities: ResolvedEntity[];
  impactedEntities: HopResult[];
  riskLevel: RiskLevel;
  warnings: string[];
}

export interface KnowledgeGraphExtractor {
  extractFromFile(filePath: string, content: string): Promise<ExtractedEntity[]>;
}

class AgentEntityExtractor implements KnowledgeGraphExtractor {
  private agent: EntityExtractorAgent;

  constructor() {
    this.agent = new EntityExtractorAgent({
      supportedLanguages: [
        "typescript",
        "javascript",
        "python",
        "rust",
        "go",
        "unknown",
      ],
    });
  }

  async extractFromFile(filePath: string, content: string): Promise<ExtractedEntity[]> {
    const result = await this.agent.run({ filePath, content });
    return result.entities;
  }
}

function enabled(): boolean {
  const v = process.env.ENABLE_KNOWLEDGE_GRAPH;
  return v === "1" || v?.toLowerCase() === "true" || v?.toLowerCase() === "yes";
}

function stableId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function extractChangedFilesFromDiff(diff: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const line of diff.split("\n")) {
    const m = line.match(/^diff --git a\/(.+?) b\/(.+)\s*$/);
    if (m) {
      const path = m[2]!;
      if (!seen.has(path)) {
        seen.add(path);
        out.push(path);
      }
    }
  }

  if (out.length > 0) return out;

  for (const line of diff.split("\n")) {
    const m = line.match(/^\+\+\+ b\/(.+)\s*$/);
    if (!m) continue;
    const path = m[1]!;
    if (path === "/dev/null") continue;
    if (!seen.has(path)) {
      seen.add(path);
      out.push(path);
    }
  }

  return out;
}

function formatEntity(e: ResolvedEntity): string {
  const fp = e.filePath ? ` (${e.filePath})` : "";
  return `${e.entityType}:${e.name}${fp}`;
}

function relationshipToTemporal(
  type: RelationshipKind,
): Exclude<TemporalRelationship["relationshipType"], "used_by"> {
  return type;
}

export class KnowledgeGraphService {
  private extractor: KnowledgeGraphExtractor;
  private resolver: EntityResolver;
  private tracker: TemporalTracker;

  constructor(opts?: { extractor?: KnowledgeGraphExtractor }) {
    this.extractor = opts?.extractor ?? new AgentEntityExtractor();
    this.resolver = new EntityResolver();
    this.tracker = new TemporalTracker();
  }

  enabled(): boolean {
    return enabled();
  }

  async enhanceContext(
    task: Pick<Task, "githubRepo">,
    fileContents: Record<string, string>,
  ): Promise<EnhancedKnowledgeContext | null> {
    if (!this.enabled()) return null;

    const extracted: ExtractedEntity[] = [];
    for (const [filePath, content] of Object.entries(fileContents)) {
      try {
        extracted.push(...(await this.extractor.extractFromFile(filePath, content)));
      } catch {
        // Best-effort: skip extraction errors for a single file
      }
    }

    const resolved = this.resolver.resolve(extracted, []);
    const { entities, relationships, currentByCanonical } =
      await this.materializeTemporalGraph(resolved, "working");
    const retriever = new MultiHopRetriever({ entities, relationships });

    const targetEntityIds = new Set<string>();
    for (const e of resolved) {
      if (!e.filePath) continue;
      if (!fileContents[e.filePath]) continue;
      const cur = currentByCanonical.get(e.canonicalId);
      if (cur) targetEntityIds.add(cur.id);
    }

    const dependencies: HopResult[] = [];
    const depSeen = new Set<string>();
    for (const id of targetEntityIds) {
      const deps = await retriever.findDependencies(id, this.maxHops());
      for (const d of deps) {
        if (depSeen.has(d.entity.id)) continue;
        depSeen.add(d.entity.id);
        dependencies.push(d);
      }
    }

    const summaryLines: string[] = [];
    summaryLines.push(
      `Entities: ${resolved.slice(0, 25).map(formatEntity).join(", ")}${resolved.length > 25 ? "…" : ""}`,
    );
    if (dependencies.length > 0) {
      summaryLines.push(
        `Dependencies (maxHops=${this.maxHops()}): ${dependencies
          .slice(0, 25)
          .map((d) => formatEntity(d.entity.entity))
          .join(", ")}${dependencies.length > 25 ? "…" : ""}`,
      );
    }

    return {
      entities: resolved,
      dependencies,
      recentChanges: [],
      impactRadius: dependencies.length,
      summary: summaryLines.join("\n"),
    };
  }

  async analyzeImpact(
    task: Pick<Task, "githubRepo">,
    diff: string,
    fileContents: Record<string, string>,
  ): Promise<ImpactAnalysis | null> {
    if (!this.enabled()) return null;

    const changedFiles = extractChangedFilesFromDiff(diff);
    const extracted: ExtractedEntity[] = [];
    for (const filePath of changedFiles) {
      const content = fileContents[filePath];
      if (!content) continue;
      try {
        extracted.push(...(await this.extractor.extractFromFile(filePath, content)));
      } catch {
        // Best-effort
      }
    }

    const resolved = this.resolver.resolve(extracted, []);
    const { entities, relationships, currentByCanonical } =
      await this.materializeTemporalGraph(resolved, "working");
    const retriever = new MultiHopRetriever({ entities, relationships });

    const impacted: HopResult[] = [];
    const seen = new Set<string>();
    for (const e of resolved) {
      const cur = currentByCanonical.get(e.canonicalId);
      if (!cur) continue;
      const results = await retriever.findImpact(cur.id, this.maxHops());
      for (const r of results) {
        if (seen.has(r.entity.id)) continue;
        seen.add(r.entity.id);
        impacted.push(r);
      }
    }

    const riskLevel = this.calculateRisk(changedFiles.length, resolved.length, impacted.length);
    const warnings: string[] = [];
    if (riskLevel !== "low") {
      warnings.push(
        `Potentially ${riskLevel} impact: ${resolved.length} direct entities, ${impacted.length} impacted entities (maxHops=${this.maxHops()}).`,
      );
    }

    return {
      changedFiles,
      directEntities: resolved,
      impactedEntities: impacted,
      riskLevel,
      warnings,
    };
  }

  async onCommitApplied(task: Pick<Task, "githubRepo">, diff: string, commitSha: string): Promise<void> {
    if (!this.enabled()) return;
    if (!knowledgeGraphSync.enabled()) return;

    const changedFiles = extractChangedFilesFromDiff(diff);
    void knowledgeGraphSync.triggerIncrementalSync({
      repoFullName: task.githubRepo,
      commitSha,
      changedFiles,
    });
  }

  private maxHops(): number {
    const v = parseInt(process.env.KNOWLEDGE_GRAPH_MAX_HOPS || "3", 10);
    return Number.isFinite(v) && v > 0 ? v : 3;
  }

  private calculateRisk(
    changedFiles: number,
    directEntities: number,
    impactedEntities: number,
  ): RiskLevel {
    if (changedFiles >= 10) return "high";
    if (impactedEntities >= 25) return "high";
    if (directEntities >= 10 || impactedEntities >= 10) return "medium";
    return "low";
  }

  private async materializeTemporalGraph(
    entities: ResolvedEntity[],
    commitSha: string,
  ): Promise<{
    entities: TemporalEntity[];
    relationships: TemporalRelationship[];
    currentByCanonical: Map<string, TemporalEntity>;
  }> {
    const now = new Date();
    const temporalEntities: TemporalEntity[] = [];
    const currentByCanonical = new Map<string, TemporalEntity>();

    for (const e of entities) {
      const t = await this.tracker.recordVersion(e, commitSha, now);
      temporalEntities.push(t);
      currentByCanonical.set(e.canonicalId, t);
    }

    const relationships: TemporalRelationship[] = [];
    for (const e of entities) {
      const source = currentByCanonical.get(e.canonicalId);
      if (!source) continue;
      for (const rel of e.relationships ?? []) {
        const target = currentByCanonical.get(rel.targetId);
        if (!target) continue;
        relationships.push({
          id: stableId(`${source.id}:${rel.type}:${target.id}`),
          sourceId: source.id,
          targetId: target.id,
          relationshipType: relationshipToTemporal(rel.type),
          validFrom: now,
          validUntil: null,
        });
      }
    }

    return { entities: temporalEntities, relationships, currentByCanonical };
  }
}

