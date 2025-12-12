/**
 * Import Analyzer - Build import graphs and find related files
 *
 * Supports:
 * - TypeScript/JavaScript: import/require statements
 * - Python: import/from statements
 */

export interface ImportGraph {
  // file -> files it imports from (dependencies)
  imports: Map<string, Set<string>>;
  // file -> files that import it (dependents)
  importedBy: Map<string, Set<string>>;
}

export interface RelatedFilesOptions {
  depth?: number; // How many hops to follow (default: 1)
  maxFiles?: number; // Maximum files to return (default: 20)
  includeImports?: boolean; // Include files that target imports from
  includeImportedBy?: boolean; // Include files that import target
}

// TypeScript/JavaScript import patterns
const TS_IMPORT_PATTERNS = [
  // import x from './path'
  /import\s+(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]/g,
  // import('./path')
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  // require('./path')
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  // export * from './path'
  /export\s+(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g,
];

// Python import patterns
const PY_IMPORT_PATTERNS = [
  // from x import y
  /from\s+([\w.]+)\s+import/g,
  // import x
  /^import\s+([\w.]+)/gm,
];

/**
 * Detect file language from extension
 */
function detectLanguage(
  filePath: string,
): "typescript" | "python" | "unknown" {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (["ts", "tsx", "js", "jsx", "mjs", "cjs"].includes(ext || "")) {
    return "typescript";
  }
  if (ext === "py") {
    return "python";
  }
  return "unknown";
}

/**
 * Resolve relative import path to absolute path
 */
function resolveImportPath(
  fromFile: string,
  importPath: string,
  allFiles: string[],
): string | null {
  // Skip external packages
  if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
    return null;
  }

  // Get directory of the importing file
  const fromDir = fromFile.split("/").slice(0, -1).join("/");

  // Resolve relative path
  let resolved: string;
  if (importPath.startsWith("./")) {
    resolved = `${fromDir}/${importPath.slice(2)}`;
  } else if (importPath.startsWith("../")) {
    const parts = fromDir.split("/");
    let upCount = 0;
    let remaining = importPath;
    while (remaining.startsWith("../")) {
      upCount++;
      remaining = remaining.slice(3);
    }
    resolved = [...parts.slice(0, -upCount), remaining].join("/");
  } else if (importPath.startsWith("/")) {
    resolved = importPath.slice(1);
  } else {
    return null;
  }

  // Try to find matching file with extensions
  const extensions = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"];
  for (const ext of extensions) {
    const candidate = resolved + ext;
    if (allFiles.includes(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Resolve Python import to file path
 */
function resolvePythonImport(
  importModule: string,
  allFiles: string[],
): string | null {
  // Convert module.name to module/name.py or module/name/__init__.py
  const pathBase = importModule.replace(/\./g, "/");

  const candidates = [
    `${pathBase}.py`,
    `${pathBase}/__init__.py`,
    `src/${pathBase}.py`,
    `src/${pathBase}/__init__.py`,
  ];

  for (const candidate of candidates) {
    if (allFiles.includes(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Extract imports from a TypeScript/JavaScript file
 */
function extractTSImports(content: string): string[] {
  const imports: string[] = [];

  for (const pattern of TS_IMPORT_PATTERNS) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      imports.push(match[1]);
    }
  }

  return imports;
}

/**
 * Extract imports from a Python file
 */
function extractPythonImports(content: string): string[] {
  const imports: string[] = [];

  for (const pattern of PY_IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      imports.push(match[1]);
    }
  }

  return imports;
}

/**
 * Build import graph from file contents
 *
 * @param files - Map of file path -> file content
 * @returns ImportGraph with bidirectional import relationships
 */
export function buildImportGraph(files: Map<string, string>): ImportGraph {
  const graph: ImportGraph = {
    imports: new Map(),
    importedBy: new Map(),
  };

  const allFiles = Array.from(files.keys());

  for (const [filePath, content] of files) {
    const lang = detectLanguage(filePath);
    if (lang === "unknown") continue;

    // Initialize sets for this file
    if (!graph.imports.has(filePath)) {
      graph.imports.set(filePath, new Set());
    }

    // Extract imports based on language
    const rawImports =
      lang === "typescript"
        ? extractTSImports(content)
        : extractPythonImports(content);

    // Resolve each import to actual file
    for (const rawImport of rawImports) {
      const resolved =
        lang === "typescript"
          ? resolveImportPath(filePath, rawImport, allFiles)
          : resolvePythonImport(rawImport, allFiles);

      if (resolved) {
        // Add to imports
        graph.imports.get(filePath)!.add(resolved);

        // Add to importedBy (reverse relationship)
        if (!graph.importedBy.has(resolved)) {
          graph.importedBy.set(resolved, new Set());
        }
        graph.importedBy.get(resolved)!.add(filePath);
      }
    }
  }

  return graph;
}

/**
 * Get files related to target files within N hops
 *
 * @param graph - Import graph from buildImportGraph
 * @param targetFiles - Files to find relations for
 * @param options - Configuration options
 * @returns Array of related file paths (excluding targets)
 */
export function getRelatedFiles(
  graph: ImportGraph,
  targetFiles: string[],
  options: RelatedFilesOptions = {},
): string[] {
  const {
    depth = 1,
    maxFiles = 20,
    includeImports = true,
    includeImportedBy = true,
  } = options;

  const visited = new Set<string>(targetFiles);
  const result = new Set<string>();
  let frontier = new Set<string>(targetFiles);

  for (let d = 0; d < depth; d++) {
    const nextFrontier = new Set<string>();

    for (const file of frontier) {
      // Add files this file imports from
      if (includeImports) {
        const imports = graph.imports.get(file);
        if (imports) {
          for (const imported of imports) {
            if (!visited.has(imported)) {
              visited.add(imported);
              result.add(imported);
              nextFrontier.add(imported);
            }
          }
        }
      }

      // Add files that import this file
      if (includeImportedBy) {
        const importedBy = graph.importedBy.get(file);
        if (importedBy) {
          for (const importer of importedBy) {
            if (!visited.has(importer)) {
              visited.add(importer);
              result.add(importer);
              nextFrontier.add(importer);
            }
          }
        }
      }

      // Early exit if we have enough files
      if (result.size >= maxFiles) {
        return Array.from(result).slice(0, maxFiles);
      }
    }

    frontier = nextFrontier;
    if (frontier.size === 0) break;
  }

  return Array.from(result).slice(0, maxFiles);
}

/**
 * Expand target files with their related dependencies
 *
 * @param targetFiles - Initial target files from planner
 * @param repoFiles - Map of all repo file paths to contents
 * @param options - Configuration options
 * @returns Expanded list including related files
 */
export function expandTargetFiles(
  targetFiles: string[],
  repoFiles: Map<string, string>,
  options: RelatedFilesOptions = {},
): string[] {
  const graph = buildImportGraph(repoFiles);
  const related = getRelatedFiles(graph, targetFiles, options);

  // Combine targets with related, preserving order (targets first)
  const expanded = [...targetFiles];
  for (const file of related) {
    if (!expanded.includes(file)) {
      expanded.push(file);
    }
  }

  return expanded;
}

/**
 * Get type definition files that might be relevant
 * (looks for .d.ts files and type imports)
 */
export function getTypeDefinitionFiles(
  graph: ImportGraph,
  targetFiles: string[],
): string[] {
  const typeFiles: string[] = [];

  for (const file of targetFiles) {
    const imports = graph.imports.get(file);
    if (imports) {
      for (const imported of imports) {
        if (imported.endsWith(".d.ts") || imported.includes("/types")) {
          typeFiles.push(imported);
        }
      }
    }
  }

  return [...new Set(typeFiles)];
}
