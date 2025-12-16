/**
 * Boundary Detection for Issue Breakdown
 *
 * Analyzes code structure to find natural boundaries for splitting work:
 * - Function/method boundaries
 * - Class boundaries
 * - Module boundaries
 * - File boundaries
 */

// =============================================================================
// TYPES
// =============================================================================

export interface CodeBoundary {
  type: "function" | "class" | "interface" | "type" | "const" | "module";
  name: string;
  startLine: number;
  endLine: number;
  filePath: string;
  exports: boolean;
  dependencies: string[];
}

export interface FileBoundary {
  filePath: string;
  boundaries: CodeBoundary[];
  imports: string[];
  exports: string[];
  lineCount: number;
}

export interface BoundaryAnalysis {
  files: FileBoundary[];
  crossFileDependencies: Array<{ from: string; to: string; symbols: string[] }>;
  suggestedSplitPoints: SplitPoint[];
}

export interface SplitPoint {
  description: string;
  filePath: string;
  afterLine: number;
  reason: string;
  independentOf: string[];
}

// =============================================================================
// BOUNDARY DETECTION
// =============================================================================

/**
 * Detect code boundaries in TypeScript/JavaScript content
 */
export function detectBoundaries(
  content: string,
  filePath: string,
): FileBoundary {
  const lines = content.split("\n");
  const boundaries: CodeBoundary[] = [];
  const imports: string[] = [];
  const exports: string[] = [];

  let currentBoundary: Partial<CodeBoundary> | null = null;
  let braceDepth = 0;
  let inMultiLineComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Handle multi-line comments
    if (line.includes("/*")) inMultiLineComment = true;
    if (line.includes("*/")) inMultiLineComment = false;
    if (inMultiLineComment || line.trim().startsWith("//")) continue;

    // Track imports
    const importMatch = line.match(/^import\s+.*from\s+['"](.+)['"]/);
    if (importMatch) {
      imports.push(importMatch[1]);
      continue;
    }

    // Detect boundary starts
    const boundaryStart = detectBoundaryStart(line, lineNum, filePath);
    if (boundaryStart && braceDepth === 0) {
      currentBoundary = boundaryStart;
    }

    // Track brace depth
    const openBraces = (line.match(/{/g) || []).length;
    const closeBraces = (line.match(/}/g) || []).length;
    braceDepth += openBraces - closeBraces;

    // Close boundary
    if (currentBoundary && braceDepth === 0 && closeBraces > 0) {
      currentBoundary.endLine = lineNum;
      boundaries.push(currentBoundary as CodeBoundary);

      if (currentBoundary.exports) {
        exports.push(currentBoundary.name!);
      }

      currentBoundary = null;
    }
  }

  return {
    filePath,
    boundaries,
    imports,
    exports,
    lineCount: lines.length,
  };
}

function detectBoundaryStart(
  line: string,
  lineNum: number,
  filePath: string,
): Partial<CodeBoundary> | null {
  const trimmed = line.trim();
  const isExported = trimmed.startsWith("export");

  // Function detection
  const funcMatch = trimmed.match(
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
  );
  if (funcMatch) {
    return {
      type: "function",
      name: funcMatch[1],
      startLine: lineNum,
      filePath,
      exports: isExported,
      dependencies: [],
    };
  }

  // Arrow function / const function detection
  const arrowMatch = trimmed.match(
    /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/,
  );
  if (arrowMatch) {
    return {
      type: "function",
      name: arrowMatch[1],
      startLine: lineNum,
      filePath,
      exports: isExported,
      dependencies: [],
    };
  }

  // Class detection
  const classMatch = trimmed.match(/(?:export\s+)?class\s+(\w+)/);
  if (classMatch) {
    return {
      type: "class",
      name: classMatch[1],
      startLine: lineNum,
      filePath,
      exports: isExported,
      dependencies: [],
    };
  }

  // Interface detection
  const interfaceMatch = trimmed.match(/(?:export\s+)?interface\s+(\w+)/);
  if (interfaceMatch) {
    return {
      type: "interface",
      name: interfaceMatch[1],
      startLine: lineNum,
      filePath,
      exports: isExported,
      dependencies: [],
    };
  }

  // Type detection
  const typeMatch = trimmed.match(/(?:export\s+)?type\s+(\w+)/);
  if (typeMatch) {
    return {
      type: "type",
      name: typeMatch[1],
      startLine: lineNum,
      filePath,
      exports: isExported,
      dependencies: [],
    };
  }

  return null;
}

// =============================================================================
// SPLIT POINT ANALYSIS
// =============================================================================

/**
 * Analyze files to find natural split points for XS tasks
 */
export function analyzeSplitPoints(
  files: FileBoundary[],
  maxLinesPerTask: number = 50,
): SplitPoint[] {
  const splitPoints: SplitPoint[] = [];

  for (const file of files) {
    // Each exported function/class is a potential split point
    for (const boundary of file.boundaries) {
      if (!boundary.exports) continue;

      const lineCount = boundary.endLine - boundary.startLine + 1;

      // If boundary is small enough, it's a good split point
      if (lineCount <= maxLinesPerTask) {
        splitPoints.push({
          description: `${boundary.type} ${boundary.name}`,
          filePath: file.filePath,
          afterLine: boundary.endLine,
          reason: `Isolated ${boundary.type} with ${lineCount} lines`,
          independentOf: findIndependentBoundaries(boundary, file.boundaries),
        });
      }
    }
  }

  return splitPoints;
}

function findIndependentBoundaries(
  boundary: CodeBoundary,
  allBoundaries: CodeBoundary[],
): string[] {
  // Boundaries that don't depend on this one
  return allBoundaries
    .filter((b) => b.name !== boundary.name)
    .filter((b) => !b.dependencies.includes(boundary.name))
    .map((b) => b.name);
}

// =============================================================================
// CROSS-FILE ANALYSIS
// =============================================================================

/**
 * Analyze dependencies between files
 */
export function analyzeCrossFileDependencies(
  files: FileBoundary[],
): Array<{ from: string; to: string; symbols: string[] }> {
  const dependencies: Array<{ from: string; to: string; symbols: string[] }> =
    [];

  for (const file of files) {
    for (const importPath of file.imports) {
      // Find which file this import refers to
      const targetFile = files.find(
        (f) =>
          f.filePath.includes(importPath) ||
          importPath.includes(f.filePath.replace(/\.(ts|js)x?$/, "")),
      );

      if (targetFile) {
        dependencies.push({
          from: file.filePath,
          to: targetFile.filePath,
          symbols: targetFile.exports.filter((exp) =>
            file.boundaries.some((b) => b.dependencies.includes(exp)),
          ),
        });
      }
    }
  }

  return dependencies;
}

/**
 * Full boundary analysis for a set of files
 */
export function analyzeAllBoundaries(
  fileContents: Array<{ path: string; content: string }>,
  maxLinesPerTask: number = 50,
): BoundaryAnalysis {
  const files = fileContents.map(({ path, content }) =>
    detectBoundaries(content, path),
  );

  return {
    files,
    crossFileDependencies: analyzeCrossFileDependencies(files),
    suggestedSplitPoints: analyzeSplitPoints(files, maxLinesPerTask),
  };
}
