import { createHash } from "node:crypto";
import type { CodeChunk } from "./types";

export function generateChunkId(filePath: string, startLine: number): string {
  return createHash("sha256")
    .update(`${filePath}:${startLine}`)
    .digest("hex")
    .slice(0, 16);
}

function toLineStarts(content: string): number[] {
  const starts = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

function indexToLine(lineStarts: number[], idx: number): number {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const start = lineStarts[mid]!;
    const next = mid + 1 < lineStarts.length ? lineStarts[mid + 1]! : Infinity;
    if (idx < start) hi = mid - 1;
    else if (idx >= next) lo = mid + 1;
    else return mid + 1; // 1-indexed lines
  }
  return 1;
}

function scanToStatementEnd(content: string, start: number): number {
  let i = start;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escape = false;

  for (; i < content.length; i++) {
    const ch = content[i]!;
    const next = i + 1 < content.length ? content[i + 1]! : "";

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\") {
      escape = true;
      continue;
    }

    if (!inSingle && !inDouble && !inTemplate) {
      if (ch === "/" && next === "/") {
        inLineComment = true;
        i++;
        continue;
      }
      if (ch === "/" && next === "*") {
        inBlockComment = true;
        i++;
        continue;
      }
    }

    if (!inDouble && !inTemplate && ch === "'") inSingle = !inSingle;
    else if (!inSingle && !inTemplate && ch === '"') inDouble = !inDouble;
    else if (!inSingle && !inDouble && ch === "`") inTemplate = !inTemplate;

    if (!inSingle && !inDouble && !inTemplate && ch === ";") return i + 1;
  }

  return i;
}

function scanToMatchingBrace(content: string, openBraceIdx: number): number {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escape = false;

  for (let i = openBraceIdx; i < content.length; i++) {
    const ch = content[i]!;
    const next = i + 1 < content.length ? content[i + 1]! : "";

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\") {
      escape = true;
      continue;
    }

    if (!inSingle && !inDouble && !inTemplate) {
      if (ch === "/" && next === "/") {
        inLineComment = true;
        i++;
        continue;
      }
      if (ch === "/" && next === "*") {
        inBlockComment = true;
        i++;
        continue;
      }
    }

    if (!inDouble && !inTemplate && ch === "'") inSingle = !inSingle;
    else if (!inSingle && !inTemplate && ch === '"') inDouble = !inDouble;
    else if (!inSingle && !inDouble && ch === "`") inTemplate = !inTemplate;

    if (inSingle || inDouble || inTemplate) continue;

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }

  return content.length;
}

export function extractImports(content: string): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  const re = /^\s*import\b/mg;
  for (const m of content.matchAll(re)) {
    const start = m.index ?? 0;
    const end = scanToStatementEnd(content, start);
    out.push({ start, end });
  }
  return out;
}

export function extractExports(content: string): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  const re = /^\s*export\b/mg;
  for (const m of content.matchAll(re)) {
    const start = m.index ?? 0;
    const braceIdx = content.indexOf("{", start);
    const stmtEnd = scanToStatementEnd(content, start);
    const end =
      braceIdx !== -1 && braceIdx < stmtEnd ? scanToMatchingBrace(content, braceIdx) : stmtEnd;
    out.push({ start, end });
  }
  return out;
}

export function chunkTypeScript(content: string, filePath: string): CodeChunk[] {
  const lineStarts = toLineStarts(content);
  const chunks: CodeChunk[] = [];

  const pushChunk = (startIdx: number, endIdx: number) => {
    const startLine = indexToLine(lineStarts, startIdx);
    const endLine = indexToLine(lineStarts, Math.max(startIdx, endIdx - 1));
    const slice = content.slice(startIdx, endIdx).trim();
    if (!slice) return;
    chunks.push({
      id: generateChunkId(filePath, startLine),
      filePath,
      content: slice,
      startLine,
      endLine,
      language: "typescript",
    });
  };

  // imports/exports first (high signal)
  for (const s of extractImports(content)) pushChunk(s.start, s.end);
  for (const s of extractExports(content)) pushChunk(s.start, s.end);

  // top-level declarations
  const declRe =
    /^\s*(?:export\s+)?(?:async\s+)?(function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;
  for (const m of content.matchAll(declRe)) {
    const start = m.index ?? 0;
    const keyword = m[1] ?? "";
    const braceIdx = content.indexOf("{", start);
    if (keyword === "type") {
      const end = scanToStatementEnd(content, start);
      pushChunk(start, end);
      continue;
    }
    if (braceIdx !== -1) {
      const end = scanToMatchingBrace(content, braceIdx);
      pushChunk(start, end);
    }
  }

  // arrow functions assigned to const/let/var
  const arrowRe =
    /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/gm;
  for (const m of content.matchAll(arrowRe)) {
    const start = m.index ?? 0;
    const braceIdx = content.indexOf("{", start);
    const stmtEnd = scanToStatementEnd(content, start);
    const end =
      braceIdx !== -1 && braceIdx < stmtEnd ? scanToMatchingBrace(content, braceIdx) : stmtEnd;
    pushChunk(start, end);
  }

  // de-dupe by id + startLine
  const seen = new Set<string>();
  const uniq: CodeChunk[] = [];
  for (const c of chunks) {
    const key = `${c.id}:${c.startLine}:${c.endLine}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(c);
  }

  uniq.sort((a, b) => a.startLine - b.startLine);
  return uniq;
}

