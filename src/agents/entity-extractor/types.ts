import { BaseAgent, type AgentConfig } from "../base";
import type { ExtractedEntity } from "../../core/knowledge-graph/types";

export type SupportedLanguage =
  | "typescript"
  | "javascript"
  | "python"
  | "rust"
  | "go"
  | "unknown";

export interface EntityExtractorConfig extends AgentConfig {
  supportedLanguages?: SupportedLanguage[];
}

export interface EntityExtractionInput {
  filePath: string;
  content: string;
  language?: SupportedLanguage;
}

export interface EntityExtractionResult {
  entities: ExtractedEntity[];
  language: SupportedLanguage;
  filePath: string;
}

const systemPrompt = `You extract code entities from a single source file.
Return ONLY valid JSON with the shape:
{ "entities": Array<{ "id": string, "name": string, "entityType": string, "filePath"?: string, "signature"?: string|null, "content"?: string|null, "metadata"?: object }> }.

Rules:
- entityType is one of: "function" | "class" | "interface" | "type" | "const" | "enum" | "module" | "variable"
- id must be stable for this file: use "<entityType>:<name>:<filePath>"
- Prefer signature when available; content can be null if too large.
- Do not include explanations or markdown.`;

function detectLanguage(filePath: string): SupportedLanguage {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
  if (lower.endsWith(".js") || lower.endsWith(".jsx")) return "javascript";
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".rs")) return "rust";
  if (lower.endsWith(".go")) return "go";
  return "unknown";
}

function stableId(entityType: string, name: string, filePath: string): string {
  return `${entityType}:${name}:${filePath}`;
}

export class EntityExtractorAgent extends BaseAgent<
  EntityExtractionInput,
  EntityExtractionResult
> {
  private supported: Set<SupportedLanguage>;

  constructor(config: EntityExtractorConfig = {}) {
    super(config);
    this.supported = new Set(config.supportedLanguages ?? ["unknown"]);
  }

  async run(input: EntityExtractionInput): Promise<EntityExtractionResult> {
    const language = input.language ?? detectLanguage(input.filePath);
    if (this.supported.size > 0 && !this.supported.has(language)) {
      throw new Error(
        `Unsupported language "${language}" for ${input.filePath}. Supported: ${[
          ...this.supported,
        ].join(", ")}`,
      );
    }

    const userPrompt = `File path: ${input.filePath}
Language: ${language}

Source:
\`\`\`
${input.content}
\`\`\``;

    const raw = await this.complete(systemPrompt, userPrompt);
    const parsed = this.parseJSON<{ entities: Array<Partial<ExtractedEntity>> }>(
      raw,
    );

    const entities: ExtractedEntity[] = (parsed.entities ?? [])
      .filter((e) => !!e && typeof e.name === "string" && typeof e.entityType === "string")
      .map((e) => ({
        id: typeof e.id === "string" ? e.id : stableId(e.entityType!, e.name!, input.filePath),
        name: e.name!,
        entityType: e.entityType!,
        filePath: input.filePath,
        signature: (e.signature ?? null) as string | null,
        content: (e.content ?? null) as string | null,
        metadata: (e.metadata ?? undefined) as Record<string, unknown> | undefined,
      }));

    return { entities, language, filePath: input.filePath };
  }
}

