/**
 * Syntax Validator
 *
 * Validates code syntax before pushing to GitHub.
 * Catches common LLM output errors:
 * - Unbalanced braces/brackets/parentheses
 * - Truncated code
 * - Malformed TypeScript/JavaScript
 *
 * Issue #309 - Prevent AutoDev from generating malformed code
 */

export interface SyntaxValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface BraceCount {
  open: number;
  close: number;
  positions: { char: string; line: number; col: number }[];
}

/**
 * Check for balanced braces, brackets, and parentheses
 */
export function checkBalancedBraces(
  content: string,
  filePath: string,
): SyntaxValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const braces: BraceCount = { open: 0, close: 0, positions: [] };
  const brackets: BraceCount = { open: 0, close: 0, positions: [] };
  const parens: BraceCount = { open: 0, close: 0, positions: [] };
  const templateLiterals: BraceCount = { open: 0, close: 0, positions: [] };

  let inString = false;
  let stringChar = "";
  let inTemplateString = false;
  let inComment = false;
  let inMultilineComment = false;
  let line = 1;
  let col = 0;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const prevChar = content[i - 1] || "";
    const nextChar = content[i + 1] || "";

    col++;

    if (char === "\n") {
      line++;
      col = 0;
      inComment = false;
      continue;
    }

    // Handle multi-line comments
    if (!inString && !inTemplateString) {
      if (char === "/" && nextChar === "*" && !inMultilineComment) {
        inMultilineComment = true;
        continue;
      }
      if (char === "*" && nextChar === "/" && inMultilineComment) {
        inMultilineComment = false;
        i++; // Skip the /
        continue;
      }
      if (inMultilineComment) continue;

      // Handle single-line comments
      if (char === "/" && nextChar === "/") {
        inComment = true;
        continue;
      }
      if (inComment) continue;
    }

    // Handle strings
    if (!inComment && !inMultilineComment) {
      if (
        (char === '"' || char === "'") &&
        prevChar !== "\\" &&
        !inTemplateString
      ) {
        if (inString && stringChar === char) {
          inString = false;
          stringChar = "";
        } else if (!inString) {
          inString = true;
          stringChar = char;
        }
        continue;
      }

      // Handle template literals
      if (char === "`" && prevChar !== "\\") {
        if (inTemplateString) {
          inTemplateString = false;
          templateLiterals.close++;
        } else {
          inTemplateString = true;
          templateLiterals.open++;
        }
        continue;
      }

      if (inString) continue;

      // Template literal interpolation ${...}
      if (inTemplateString && char === "$" && nextChar === "{") {
        // Skip the ${, will be handled as regular brace
        continue;
      }
    }

    // Count braces (outside of strings and comments)
    if (!inString && !inComment && !inMultilineComment) {
      switch (char) {
        case "{":
          braces.open++;
          braces.positions.push({ char: "{", line, col });
          break;
        case "}":
          braces.close++;
          braces.positions.push({ char: "}", line, col });
          break;
        case "[":
          brackets.open++;
          brackets.positions.push({ char: "[", line, col });
          break;
        case "]":
          brackets.close++;
          brackets.positions.push({ char: "]", line, col });
          break;
        case "(":
          parens.open++;
          parens.positions.push({ char: "(", line, col });
          break;
        case ")":
          parens.close++;
          parens.positions.push({ char: ")", line, col });
          break;
      }
    }
  }

  // Check for unbalanced braces
  if (braces.open !== braces.close) {
    const diff = braces.open - braces.close;
    if (diff > 0) {
      errors.push(
        `${filePath}: ${diff} unclosed brace(s) '{' - code may be truncated`,
      );
    } else {
      errors.push(
        `${filePath}: ${-diff} extra closing brace(s) '}' - code may be malformed`,
      );
    }
  }

  if (brackets.open !== brackets.close) {
    const diff = brackets.open - brackets.close;
    if (diff > 0) {
      errors.push(
        `${filePath}: ${diff} unclosed bracket(s) '[' - code may be truncated`,
      );
    } else {
      errors.push(
        `${filePath}: ${-diff} extra closing bracket(s) ']' - code may be malformed`,
      );
    }
  }

  if (parens.open !== parens.close) {
    const diff = parens.open - parens.close;
    if (diff > 0) {
      errors.push(
        `${filePath}: ${diff} unclosed parenthesis '(' - code may be truncated`,
      );
    } else {
      errors.push(
        `${filePath}: ${-diff} extra closing parenthesis ')' - code may be malformed`,
      );
    }
  }

  // Check for unclosed template literals
  if (templateLiterals.open !== templateLiterals.close) {
    errors.push(`${filePath}: Unclosed template literal`);
  }

  // Check for unclosed strings (if we ended in a string)
  if (inString) {
    errors.push(`${filePath}: Unclosed string literal`);
  }

  // Check for unclosed multi-line comment
  if (inMultilineComment) {
    errors.push(`${filePath}: Unclosed multi-line comment`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Check for common truncation patterns
 */
export function checkTruncation(
  content: string,
  filePath: string,
): SyntaxValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const lines = content.split("\n");
  const lastLine = lines[lines.length - 1]?.trim() || "";
  const lastFewLines = lines.slice(-5).join("\n");

  // Check for abrupt endings
  const truncationPatterns = [
    // Incomplete statements
    /,\s*$/,
    /\(\s*$/,
    /\[\s*$/,
    /{\s*$/,
    /=>\s*$/,
    /[^=!<>]=\s*$/, // Assignment that's not ==, !=, <=, >=
    /:\s*$/,
    /\+\s*$/,
    /-\s*$/,
    /\*\s*$/,
    /\/\s*$/,
    /&&\s*$/,
    /\|\|\s*$/,
    /\?\s*$/,
  ];

  for (const pattern of truncationPatterns) {
    if (pattern.test(lastLine) && lastLine.length > 2) {
      warnings.push(
        `${filePath}: File ends with incomplete statement: "${lastLine.slice(-20)}"`,
      );
      break;
    }
  }

  // Check for "..." or "[truncated]" markers
  if (
    content.includes("...") &&
    (lastFewLines.includes("// ...") ||
      lastFewLines.includes("/* ... */") ||
      lastFewLines.includes("..."))
  ) {
    warnings.push(`${filePath}: File may contain truncation markers (...)`);
  }

  // Check for common LLM truncation patterns
  const llmTruncationMarkers = [
    "[truncated]",
    "[continued]",
    "[rest of code]",
    "// More code here",
    "// ... rest of",
    "// TODO: complete",
    "/* More */",
  ];

  for (const marker of llmTruncationMarkers) {
    if (content.toLowerCase().includes(marker.toLowerCase())) {
      errors.push(`${filePath}: Contains truncation marker: "${marker}"`);
    }
  }

  // Check for very short files that should be longer
  if (
    (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) &&
    content.length < 50 &&
    !content.includes("export") &&
    !content.includes("//")
  ) {
    warnings.push(
      `${filePath}: Suspiciously short TypeScript file (${content.length} chars)`,
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Check for duplicate declarations that might indicate corrupted merge
 */
export function checkDuplicateDeclarations(
  content: string,
  filePath: string,
): SyntaxValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Find all function/class/const/let/var declarations
  const declarationPatterns = [
    /^export\s+(async\s+)?function\s+(\w+)/gm,
    /^export\s+class\s+(\w+)/gm,
    /^export\s+const\s+(\w+)/gm,
    /^export\s+interface\s+(\w+)/gm,
    /^export\s+type\s+(\w+)/gm,
    /^(async\s+)?function\s+(\w+)/gm,
    /^class\s+(\w+)/gm,
    /^const\s+(\w+)\s*=/gm,
    /^let\s+(\w+)\s*=/gm,
    /^interface\s+(\w+)/gm,
    /^type\s+(\w+)\s*=/gm,
  ];

  const declarations = new Map<string, number>();

  for (const pattern of declarationPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      // Get the last capture group (the name)
      const name = match[match.length - 1];
      if (name) {
        declarations.set(name, (declarations.get(name) || 0) + 1);
      }
    }
  }

  // Check for duplicates
  for (const [name, count] of declarations) {
    if (count > 1) {
      errors.push(
        `${filePath}: Duplicate declaration of "${name}" (${count} times) - possible code corruption`,
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Check for syntax patterns that indicate corrupted code
 */
export function checkCorruptedPatterns(
  content: string,
  filePath: string,
): SyntaxValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Pattern: Multiple semicolons in a row (;;)
    if (line.includes(";;") && !line.includes("for")) {
      warnings.push(`${filePath}:${lineNum}: Double semicolon detected`);
    }

    // Pattern: = = instead of ==
    if (line.includes("= =") || line.includes("= = =")) {
      errors.push(`${filePath}:${lineNum}: Malformed equality operator`);
    }

    // Pattern: Unclosed JSX/TSX tags on a single line
    if (
      (filePath.endsWith(".tsx") || filePath.endsWith(".jsx")) &&
      line.includes("<") &&
      !line.includes(">") &&
      !line.includes("=>") &&
      !line.match(/<\w+$/) // Allow tags that continue on next line
    ) {
      // Only warn if it looks like a tag
      if (line.match(/<[A-Z]\w*/)) {
        warnings.push(`${filePath}:${lineNum}: Possibly unclosed JSX tag`);
      }
    }

    // Pattern: Import statement without from
    if (
      line.startsWith("import ") &&
      !line.includes("from") &&
      !line.includes("type") &&
      !line.endsWith("{") &&
      !line.trim().endsWith(",")
    ) {
      warnings.push(`${filePath}:${lineNum}: Incomplete import statement`);
    }

    // Pattern: Hanging operators at start of line (might be valid, but often indicates issues)
    if (line.match(/^\s*[+\-*/%&|^]=?\s*[^=]/)) {
      // This is often valid for line continuation, so just warn
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Main validation function - runs all checks
 */
export function validateSyntax(
  content: string,
  filePath: string,
): SyntaxValidationResult {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  // Only validate TypeScript/JavaScript files
  const supportedExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
  const ext = filePath.slice(filePath.lastIndexOf("."));

  if (!supportedExtensions.includes(ext)) {
    return { valid: true, errors: [], warnings: [] };
  }

  // Run all checks
  const checks = [
    checkBalancedBraces(content, filePath),
    checkTruncation(content, filePath),
    checkDuplicateDeclarations(content, filePath),
    checkCorruptedPatterns(content, filePath),
  ];

  for (const result of checks) {
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

/**
 * Validate multiple files
 */
export function validateSyntaxBatch(
  files: { path: string; content: string }[],
): SyntaxValidationResult {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  for (const file of files) {
    const result = validateSyntax(file.content, file.path);
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}
