/**
 * Entity types that can be extracted from code
 */
export type EntityType = 'function' | 'class' | 'api' | 'constant' | 'type';

/**
 * Confidence score between 0 and 1
 * - 0: No confidence
 * - 1: Full confidence
 */
export type ConfidenceScore = number;

/**
 * Represents an entity extracted from source code
 */
export interface ExtractedEntity {
  /**
   * Unique identifier for the entity
   */
  id: string;

  /**
   * Name of the entity as it appears in code
   */
  name: string;

  /**
   * Type of the entity
   */
  type: EntityType;

  /**
   * File path where the entity is defined
   */
  filePath: string;

  /**
   * Starting line number (1-indexed)
   */
  startLine: number;

  /**
   * Ending line number (1-indexed)
   */
  endLine: number;

  /**
   * Brief description of what the entity does
   */
  description: string;

  /**
   * The actual code content of the entity
   */
  codeSnippet: string;

  /**
   * List of dependencies (imports, references to other entities)
   */
  dependencies: string[];

  /**
   * Confidence score for the extraction accuracy (0-1)
   */
  confidence: ConfidenceScore;

  /**
   * Optional metadata for additional entity-specific information
   */
  metadata?: Record<string, unknown>;
}
# Entity Extraction Prompts

This document contains specialized prompts for extracting different entity types from code.
Each section targets a specific entity type with tailored instructions and examples.

## Output Schema

All extraction prompts should return JSON matching this schema:

```typescript
interface ExtractedEntity {
  type: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'import' | 'export';
  name: string;
  startLine: number;
  endLine: number;
  signature?: string;
  docstring?: string;
  confidence: number; // 0.0 to 1.0
  metadata?: Record<string, unknown>;
}
```

---

## Function Extraction Prompt

### Instructions

Extract all function declarations from the provided code. Include:
- Named function declarations
- Arrow functions assigned to variables
- Method definitions within objects
- Async functions and generators

Handle edge cases:
- Nested functions: Extract both outer and inner functions as separate entities
- Decorated functions: Include decorator in metadata, function starts at decorator line
- Overloaded functions: Extract each overload signature separately
- Anonymous functions: Skip unless assigned to a named variable

Confidence scoring:
- 1.0: Clear function declaration with explicit name and complete body
- 0.8-0.9: Arrow function or method with clear boundaries
- 0.6-0.7: Function with ambiguous end boundary (minified code)
- 0.4-0.5: Possible function, unclear syntax or incomplete

### Examples

**Input:**
```typescript
// Line 1
function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// Line 6
const formatCurrency = (amount: number): string => {
  return `$${amount.toFixed(2)}`;
};
```

**Output:**
```json
[
  {
    "type": "function",
    "name": "calculateTotal",
    "startLine": 2,
    "endLine": 4,
    "signature": "function calculateTotal(items: Item[]): number",
    "confidence": 1.0
  },
  {
    "type": "function",
    "name": "formatCurrency",
    "startLine": 7,
    "endLine": 9,
    "signature": "const formatCurrency = (amount: number): string",
    "confidence": 0.9
  }
]
```

**Input with decorator:**
```python
@cache(ttl=300)
@log_calls
def fetch_user(user_id: int) -> User:
    """Fetch user from database."""
    return db.query(User).get(user_id)
```

**Output:**
```json
[
  {
    "type": "function",
    "name": "fetch_user",
    "startLine": 1,
    "endLine": 5,
    "signature": "def fetch_user(user_id: int) -> User",
    "docstring": "Fetch user from database.",
    "confidence": 1.0,
    "metadata": {
      "decorators": ["@cache(ttl=300)", "@log_calls"]
    }
  }
]
```

---

## Class Extraction Prompt

### Instructions

Extract all class declarations from the provided code. Include:
- Class declarations with extends/implements
- Abstract classes
- Classes with decorators

Handle edge cases:
- Nested classes: Extract as separate entities with parent reference in metadata
- Anonymous classes: Skip unless assigned to a variable
- Class expressions: Include if assigned to named variable

Confidence scoring:
- 1.0: Clear class declaration with explicit name and complete body
- 0.8-0.9: Class expression assigned to variable
- 0.6-0.7: Class with unclear boundaries or complex inheritance
- 0.4-0.5: Possible class, syntax unclear

### Examples

**Input:**
```typescript
// Line 1
abstract class BaseService {
  protected logger: Logger;
  
  constructor(logger: Logger) {
    this.logger = logger;
  }
  
  abstract process(data: unknown): Promise<void>;
}

// Line 12
class UserService extends BaseService implements IUserService {
  async process(data: UserData): Promise<void> {
    this.logger.info('Processing user data');
  }
}
```

**Output:**
```json
[
  {
    "type": "class",
    "name": "BaseService",
    "startLine": 2,
    "endLine": 10,
    "signature": "abstract class BaseService",
    "confidence": 1.0,
    "metadata": {
      "abstract": true
    }
  },
  {
    "type": "class",
    "name": "UserService",
    "startLine": 13,
    "endLine": 17,
    "signature": "class UserService extends BaseService implements IUserService",
    "confidence": 1.0,
    "metadata": {
      "extends": "BaseService",
      "implements": ["IUserService"]
    }
  }
]
```

---

## Interface and Type Extraction Prompt

### Instructions

Extract all interface and type declarations. Include:
- Interface declarations
- Type aliases
- Enum declarations
- Generic type parameters

Handle edge cases:
- Merged interfaces: Extract each declaration separately, note in metadata
- Conditional types: Include full type expression in signature
- Mapped types: Capture the complete type definition

Confidence scoring:
- 1.0: Clear interface/type with explicit name and complete definition
- 0.8-0.9: Complex generic type with clear boundaries
- 0.6-0.7: Type with complex conditional or mapped expressions
- 0.4-0.5: Inline type that may or may not be reusable

### Examples

**Input:**
```typescript
// Line 1
interface User {
  id: string;
  name: string;
  email: string;
}

// Line 8
type UserRole = 'admin' | 'user' | 'guest';

// Line 10
type AsyncResult<T> = Promise<{ data: T; error?: Error }>;
```

**Output:**
```json
[
  {
    "type": "interface",
    "name": "User",
    "startLine": 2,
    "endLine": 6,
    "signature": "interface User",
    "confidence": 1.0
  },
  {
    "type": "type",
    "name": "UserRole",
    "startLine": 9,
    "endLine": 9,
    "signature": "type UserRole = 'admin' | 'user' | 'guest'",
    "confidence": 1.0
  },
  {
    "type": "type",
    "name": "AsyncResult",
    "startLine": 11,
    "endLine": 11,
    "signature": "type AsyncResult<T> = Promise<{ data: T; error?: Error }>",
    "confidence": 1.0,
    "metadata": {
      "generics": ["T"]
    }
  }
]
```

---

## Import and Export Extraction Prompt

### Instructions

Extract all import and export statements. Include:
- Named imports/exports
- Default imports/exports
- Namespace imports
- Re-exports
- Dynamic imports (note in metadata)

Handle edge cases:
- Multi-line imports: Capture full statement span
- Side-effect imports: Include with empty name
- Type-only imports: Note in metadata

Confidence scoring:
- 1.0: Clear import/export statement
- 0.8-0.9: Dynamic import with clear target
- 0.6-0.7: Complex re-export pattern

### Examples

**Input:**
```typescript
// Line 1
import { useState, useEffect } from 'react';
import type { FC } from 'react';
import * as utils from './utils';

// Line 5
export { UserService } from './services';
export default class App {}
```

**Output:**
```json
[
  {
    "type": "import",
    "name": "useState, useEffect",
    "startLine": 2,
    "endLine": 2,
    "signature": "import { useState, useEffect } from 'react'",
    "confidence": 1.0,
    "metadata": { "source": "react" }
  },
  {
    "type": "import",
    "name": "FC",
    "startLine": 3,
    "endLine": 3,
    "signature": "import type { FC } from 'react'",
    "confidence": 1.0,
    "metadata": { "source": "react", "typeOnly": true }
  },
  {
    "type": "import",
    "name": "utils",
    "startLine": 4,
    "endLine": 4,
    "signature": "import * as utils from './utils'",
    "confidence": 1.0,
    "metadata": { "source": "./utils", "namespace": true }
  },
  {
    "type": "export",
    "name": "UserService",
    "startLine": 7,
    "endLine": 7,
    "signature": "export { UserService } from './services'",
    "confidence": 1.0,
    "metadata": { "reExport": true, "source": "./services" }
  },
  {
    "type": "export",
    "name": "App",
    "startLine": 8,
    "endLine": 8,
    "signature": "export default class App",
    "confidence": 1.0,
    "metadata": { "default": true }
  }
]
```
/**
 * Parser utilities for code extraction and analysis
 */

export interface CodeChunk {
  type: 'function' | 'class' | 'interface' | 'type' | 'enum' | 'const' | 'variable' | 'import' | 'export' | 'other';
  name: string;
  startLine: number;
  endLine: number;
  content: string;
  nested?: CodeChunk[];
}

export interface LineRange {
  start: number;
  end: number;
}

export interface ImportStatement {
  raw: string;
  line: number;
  isDefault: boolean;
  isNamespace: boolean;
  namedImports: string[];
  source: string;
}

export type LanguageType = 'typescript' | 'javascript' | 'unknown';

/**
 * Detects whether a file is TypeScript or JavaScript based on extension and content
 */
export function detectLanguage(filename: string, content?: string): LanguageType {
  const ext = filename.split('.').pop()?.toLowerCase();
  
  if (ext === 'ts' || ext === 'tsx') {
    return 'typescript';
  }
  
  if (ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') {
    return 'javascript';
  }
  
  if (content) {
    const tsIndicators = [
      /:\s*(string|number|boolean|any|void|never|unknown)\b/,
      /interface\s+\w+/,
      /type\s+\w+\s*=/,
      /<\w+>/,
      /as\s+(string|number|boolean|any|\w+)/,
      /:\s*\w+\[\]/,
    ];
    
    for (const pattern of tsIndicators) {
      if (pattern.test(content)) {
        return 'typescript';
      }
    }
    
    if (/function\s+\w+|const\s+\w+\s*=|class\s+\w+/.test(content)) {
      return 'javascript';
    }
  }
  
  return 'unknown';
}

/**
 * Extracts import statements from code
 */
export function extractImports(code: string): ImportStatement[] {
  const imports: ImportStatement[] = [];
  const lines = code.split('\n');
  
  const importRegex = /^\s*import\s+(.+?)\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/;
  const sideEffectImportRegex = /^\s*import\s+['"]([^'"]+)['"]\s*;?\s*$/;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;
    
    const sideEffectMatch = line.match(sideEffectImportRegex);
    if (sideEffectMatch) {
      imports.push({
        raw: line.trim(),
        line: lineNumber,
        isDefault: false,
        isNamespace: false,
        namedImports: [],
        source: sideEffectMatch[1],
      });
      continue;
    }
    
    const match = line.match(importRegex);
    if (match) {
      const importClause = match[1];
      const source = match[2];
      
      let isDefault = false;
      let isNamespace = false;
      const namedImports: string[] = [];
      
      if (importClause.startsWith('* as ')) {
        isNamespace = true;
      } else if (importClause.startsWith('{')) {
        const namedMatch = importClause.match(/\{([^}]+)\}/);
        if (namedMatch) {
          namedImports.push(
            ...namedMatch[1].split(',').map(s => s.trim()).filter(Boolean)
          );
        }
      } else if (importClause.includes(',')) {
        isDefault = true;
        const namedMatch = importClause.match(/\{([^}]+)\}/);
        if (namedMatch) {
          namedImports.push(
            ...namedMatch[1].split(',').map(s => s.trim()).filter(Boolean)
          );
        }
      } else {
        isDefault = true;
      }
      
      imports.push({
        raw: line.trim(),
        line: lineNumber,
        isDefault,
        isNamespace,
        namedImports,
        source,
      });
    }
  }
  
  return imports;
}

/**
 * Calculates accurate line ranges for a code block
 */
export function calculateLineRange(code: string, startIndex: number, endIndex: number): LineRange {
  const beforeStart = code.substring(0, startIndex);
  const startLine = (beforeStart.match(/\n/g) || []).length + 1;
  
  const beforeEnd = code.substring(0, endIndex);
  const endLine = (beforeEnd.match(/\n/g) || []).length + 1;
  
  return { start: startLine, end: endLine };
}

/**
 * Finds the matching closing brace for an opening brace
 */
function findMatchingBrace(code: string, openIndex: number): number {
  let depth = 1;
  let i = openIndex + 1;
  let inString = false;
  let stringChar = '';
  let inComment = false;
  let inLineComment = false;
  
  while (i < code.length && depth > 0) {
    const char = code[i];
    const prevChar = code[i - 1];
    const nextChar = code[i + 1];
    
    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
      }
      i++;
      continue;
    }
    
    if (inComment) {
      if (char === '*' && nextChar === '/') {
        inComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    
    if (inString) {
      if (char === stringChar && prevChar !== '\\') {
        inString = false;
      }
      i++;
      continue;
    }
    
    if (char === '/' && nextChar === '/') {
      inLineComment = true;
      i += 2;
      continue;
    }
    
    if (char === '/' && nextChar === '*') {
      inComment = true;
      i += 2;
      continue;
    }
    
    if (char === '"' || char === "'" || char === '`') {
      inString = true;
      stringChar = char;
      i++;
      continue;
    }
    
    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
    }
    
    i++;
  }
  
  return depth === 0 ? i - 1 : -1;
}

/**
 * Splits code into extractable chunks
 */
export function splitIntoChunks(code: string): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  const lines = code.split('\n');
  
  const patterns: Array<{ type: CodeChunk['type']; regex: RegExp }> = [
    { type: 'interface', regex: /^\s*(export\s+)?interface\s+(\w+)/ },
    { type: 'type', regex: /^\s*(export\s+)?type\s+(\w+)\s*=/ },
    { type: 'enum', regex: /^\s*(export\s+)?enum\s+(\w+)/ },
    { type: 'class', regex: /^\s*(export\s+)?(abstract\s+)?class\s+(\w+)/ },
    { type: 'function', regex: /^\s*(export\s+)?(async\s+)?function\s+(\w+)/ },
    { type: 'const', regex: /^\s*(export\s+)?const\s+(\w+)\s*=/ },
    { type: 'variable', regex: /^\s*(export\s+)?(let|var)\s+(\w+)/ },
  ];
  
  let currentIndex = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = currentIndex;
    
    for (const { type, regex } of patterns) {
      const match = line.match(regex);
      if (match) {
        const name = match[match.length - 1];
        
        const braceIndex = code.indexOf('{', lineStart);
        const semicolonIndex = code.indexOf(';', lineStart);
        const nextLineIndex = code.indexOf('\n', lineStart);
        
        let endIndex: number;
        
        if (braceIndex !== -1 && (semicolonIndex === -1 || braceIndex < semicolonIndex)) {
          const closingBrace = findMatchingBrace(code, braceIndex);
          endIndex = closingBrace !== -1 ? closingBrace + 1 : code.length;
        } else if (semicolonIndex !== -1 && semicolonIndex < (nextLineIndex === -1 ? code.length : nextLineIndex)) {
          endIndex = semicolonIndex + 1;
        } else {
          let depth = 0;
          let j = lineStart;
          while (j < code.length) {
            if (code[j] === '{') depth++;
            if (code[j] === '}') depth--;
            if (code[j] === ';' && depth === 0) {
              endIndex = j + 1;
              break;
            }
            j++;
          }
          endIndex = j < code.length ? j + 1 : code.length;
        }
        
        const content = code.substring(lineStart, endIndex).trim();
        const range = calculateLineRange(code, lineStart, endIndex);
        
        const chunk: CodeChunk = {
          type,
          name,
          startLine: range.start,
          endLine: range.end,
          content,
        };
        
        if (type === 'class') {
          chunk.nested = extractClassMembers(content, range.start);
        }
        
        chunks.push(chunk);
        break;
      }
    }
    
    currentIndex += line.length + 1;
  }
  
  return chunks;
}

/**
 * Extracts class members (methods, properties) as nested chunks
 */
function extractClassMembers(classContent: string, baseLineOffset: number): CodeChunk[] {
  const members: CodeChunk[] = [];
  const methodRegex = /^\s*(public|private|protected)?\s*(static)?\s*(async)?\s*(\w+)\s*\([^)]*\)\s*[:{]/gm;
  
  let match;
  while ((match = methodRegex.exec(classContent)) !== null) {
    const name = match[4];
    if (name === 'constructor' || name === 'class') continue;
    
    const methodStart = match.index;
    const braceIndex = classContent.indexOf('{', methodStart);
    
    if (braceIndex !== -1) {
      const closingBrace = findMatchingBrace(classContent, braceIndex);
      if (closingBrace !== -1) {
        const content = classContent.substring(methodStart, closingBrace + 1).trim();
        const range = calculateLineRange(classContent, methodStart, closingBrace + 1);
        
        members.push({
          type: 'function',
          name,
          startLine: baseLineOffset + range.start - 1,
          endLine: baseLineOffset + range.end - 1,
          content,
        });
      }
    }
  }
  
  return members;
}
import { BaseAgent, AgentConfig, AgentResult } from '../base-agent';
import { Logger } from '../../utils/logger';

/**
 * Supported programming languages for entity extraction
 */
export type SupportedLanguage = 'typescript' | 'javascript' | 'python' | 'rust' | 'go';

/**
 * Configuration for the EntityExtractorAgent
 */
export interface EntityExtractorConfig extends AgentConfig {
  supportedLanguages: SupportedLanguage[];
  confidenceThreshold: number;
}

/**
 * Represents an extracted code entity
 */
export interface CodeEntity {
  name: string;
  type: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'import' | 'export';
  startLine: number;
  endLine: number;
  confidence: number;
  metadata?: Record<string, unknown>;
}

/**
 * Input for entity extraction
 */
export interface EntityExtractionInput {
  filePath: string;
  content: string;
  language?: SupportedLanguage;
}

/**
 * Result of entity extraction
 */
export interface EntityExtractionResult extends AgentResult {
  entities: CodeEntity[];
  language: SupportedLanguage;
  filePath: string;
}

/**
 * EntityExtractorAgent extracts code entities from source files.
 * Supports multiple programming languages and provides confidence scores.
 */
export class EntityExtractorAgent extends BaseAgent<EntityExtractionInput, EntityExtractionResult> {
  private readonly supportedLanguages: Set<SupportedLanguage>;
  private readonly confidenceThreshold: number;
  private readonly logger: Logger;

  /**
   * Creates a new EntityExtractorAgent
   * @param config - Configuration for the agent
   */
  constructor(config: EntityExtractorConfig) {
    super(config);
    
    if (!config.supportedLanguages || config.supportedLanguages.length === 0) {
      throw new Error('EntityExtractorAgent requires at least one supported language');
    }
    
    if (config.confidenceThreshold < 0 || config.confidenceThreshold > 1) {
      throw new Error('Confidence threshold must be between 0 and 1');
    }
    
    this.supportedLanguages = new Set(config.supportedLanguages);
    this.confidenceThreshold = config.confidenceThreshold;
    this.logger = new Logger('EntityExtractorAgent');
    
    this.logger.info('EntityExtractorAgent initialized', {
      supportedLanguages: config.supportedLanguages,
      confidenceThreshold: config.confidenceThreshold,
    });
  }

  /**
   * Extracts entities from the provided source code
   * @param input - The extraction input containing file path and content
   * @returns Promise resolving to extraction result with entities
   */
  async extractEntities(input: EntityExtractionInput): Promise<EntityExtractionResult> {
    this.logger.debug('Starting entity extraction', { filePath: input.filePath });
    
    const language = input.language || this.detectLanguage(input.filePath);
    
    if (!language) {
      throw new Error(`Unable to detect language for file: ${input.filePath}`);
    }
    
    this.validateFile(input.filePath, language);
    
    const entities = await this.parseEntities(input.content, language);
    const filteredEntities = entities.filter(e => e.confidence >= this.confidenceThreshold);
    
    this.logger.info('Entity extraction complete', {
      filePath: input.filePath,
      totalEntities: entities.length,
      filteredEntities: filteredEntities.length,
    });
    
    return {
      success: true,
      entities: filteredEntities,
      language,
      filePath: input.filePath,
    };
  }

  /**
   * Validates that the file can be processed
   * @param filePath - Path to the file
   * @param language - Detected or specified language
   */
  private validateFile(filePath: string, language: SupportedLanguage): void {
    if (!this.supportedLanguages.has(language)) {
      throw new Error(
        `Language '${language}' is not supported. Supported languages: ${Array.from(this.supportedLanguages).join(', ')}`
      );
    }
    
    if (!filePath || filePath.trim() === '') {
      throw new Error('File path cannot be empty');
    }
    
    this.logger.debug('File validation passed', { filePath, language });
  }

  /**
   * Detects the programming language from file extension
   * @param filePath - Path to the file
   * @returns Detected language or undefined
   */
  private detectLanguage(filePath: string): SupportedLanguage | undefined {
    const extension = filePath.split('.').pop()?.toLowerCase();
    
    const extensionMap: Record<string, SupportedLanguage> = {
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
      'py': 'python',
      'rs': 'rust',
      'go': 'go',
    };
    
    return extension ? extensionMap[extension] : undefined;
  }

  /**
   * Parses entities from source code content
   * @param content - Source code content
   * @param language - Programming language
   * @returns Array of extracted code entities
   */
  private async parseEntities(content: string, language: SupportedLanguage): Promise<CodeEntity[]> {
    this.logger.debug('Parsing entities', { language, contentLength: content.length });
    
    // Placeholder implementation - will be enhanced with parser utilities
    const entities: CodeEntity[] = [];
    
    // Basic regex-based extraction as placeholder
    // This will be replaced with proper AST parsing from parser utilities
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Detect function declarations (basic pattern)
      const funcMatch = line.match(/^\s*(export\s+)?(async\s+)?function\s+(\w+)/);
      if (funcMatch) {
        entities.push({
          name: funcMatch[3],
          type: 'function',
          startLine: i + 1,
          endLine: i + 1, // Will be refined with proper parsing
          confidence: 0.8,
        });
      }
      
      // Detect class declarations (basic pattern)
      const classMatch = line.match(/^\s*(export\s+)?class\s+(\w+)/);
      if (classMatch) {
        entities.push({
          name: classMatch[2],
          type: 'class',
          startLine: i + 1,
          endLine: i + 1,
          confidence: 0.9,
        });
      }
    }
    
    return entities;
  }
}
import { z } from "zod";
import { sendLLMRequest, LLMError } from "../../integrations/llm";

// Entity types that can be extracted
export type EntityType = "person" | "organization" | "location" | "date" | "product" | "event" | "concept";

// Schema for extracted entities
export const ExtractedEntitySchema = z.object({
  type: z.enum(["person", "organization", "location", "date", "product", "event", "concept"]),
  value: z.string().min(1),
  context: z.string().optional(),
  startIndex: z.number().int().nonnegative().optional(),
  endIndex: z.number().int().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type ExtractedEntity = z.infer<typeof ExtractedEntitySchema>;

// Schema for LLM response
const LLMExtractionResponseSchema = z.object({
  entities: z.array(ExtractedEntitySchema),
});

// Configuration for entity extraction
export interface EntityExtractorConfig {
  entityTypes?: EntityType[];
  maxRetries?: number;
  minConfidence?: number;
}

// Result with confidence scoring
export interface ExtractionResult {
  entities: ExtractedEntity[];
  confidence: number;
  rawResponse?: string;
}

// Error types for entity extraction
export class EntityExtractionError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = "EntityExtractionError";
  }
}

/**
 * Build the system prompt for entity extraction
 */
function buildSystemPrompt(entityTypes: EntityType[]): string {
  const typeDescriptions: Record<EntityType, string> = {
    person: "Names of people, individuals, or characters",
    organization: "Companies, institutions, agencies, or groups",
    location: "Places, addresses, geographic regions, or landmarks",
    date: "Dates, times, periods, or temporal expressions",
    product: "Products, services, or branded items",
    event: "Events, occurrences, or happenings",
    concept: "Abstract concepts, ideas, or topics",
  };

  const typeList = entityTypes
    .map((t) => `- ${t}: ${typeDescriptions[t]}`)
    .join("\n");

  return `You are an expert entity extraction system. Your task is to identify and extract named entities from text.

Extract the following entity types:
${typeList}

Rules:
1. Only extract entities that clearly match the specified types
2. Preserve the exact text as it appears in the source
3. Include surrounding context when helpful for disambiguation
4. Do not invent or hallucinate entities not present in the text

Respond ONLY with valid JSON in this exact format:
{
  "entities": [
    {
      "type": "<entity_type>",
      "value": "<extracted_text>",
      "context": "<surrounding_text_for_context>"
    }
  ]
}

If no entities are found, return: {"entities": []}`;
}

/**
 * Build the user prompt with the text to analyze
 */
function buildUserPrompt(text: string): string {
  return `Extract all entities from the following text:

---
${text}
---

Return the extracted entities as JSON.`;
}

/**
 * Parse and validate the LLM response
 */
function parseResponse(response: string): ExtractedEntity[] {
  // Try to extract JSON from the response
  let jsonStr = response.trim();

  // Handle markdown code blocks
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new EntityExtractionError(
      `Failed to parse LLM response as JSON: ${e instanceof Error ? e.message : "Unknown error"}`,
      e instanceof Error ? e : undefined,
      true
    );
  }

  // Validate against schema
  const result = LLMExtractionResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new EntityExtractionError(
      `Invalid response structure: ${result.error.message}`,
      undefined,
      true
    );
  }

  return result.data.entities;
}

/**
 * Calculate confidence score based on entity completeness
 */
function calculateConfidence(entities: ExtractedEntity[]): number {
  if (entities.length === 0) {
    return 1.0; // Empty result is valid, full confidence
  }

  let totalScore = 0;

  for (const entity of entities) {
    let entityScore = 0.5; // Base score for having type and value

    // Add points for optional fields
    if (entity.context && entity.context.length > 0) {
      entityScore += 0.2;
    }
    if (entity.startIndex !== undefined && entity.endIndex !== undefined) {
      entityScore += 0.2;
    }
    if (entity.metadata && Object.keys(entity.metadata).length > 0) {
      entityScore += 0.1;
    }

    totalScore += entityScore;
  }

  return Math.min(1.0, totalScore / entities.length);
}

/**
 * Extract entities from text using LLM
 */
export async function extractEntities(
  text: string,
  config: EntityExtractorConfig = {}
): Promise<ExtractionResult> {
  const {
    entityTypes = ["person", "organization", "location", "date", "product", "event", "concept"],
    maxRetries = 2,
  } = config;

  const systemPrompt = buildSystemPrompt(entityTypes);
  const userPrompt = buildUserPrompt(text);

  let lastError: Error | undefined;
  let rawResponse: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Send request to LLM
      const response = await sendLLMRequest({
        systemPrompt,
        userPrompt,
        temperature: 0.1, // Low temperature for consistent extraction
        maxTokens: 2000,
      });

      rawResponse = response.content;

      // Parse and validate response
      const entities = parseResponse(response.content);

      // Validate each entity against schema
      const validatedEntities: ExtractedEntity[] = [];
      for (const entity of entities) {
        const validation = ExtractedEntitySchema.safeParse(entity);
        if (validation.success) {
          validatedEntities.push(validation.data);
        }
      }

      // Calculate confidence
      const confidence = calculateConfidence(validatedEntities);

      return {
        entities: validatedEntities,
        confidence,
        rawResponse,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      const isRetryable =
        error instanceof EntityExtractionError
          ? error.retryable
          : error instanceof LLMError;

      if (!isRetryable || attempt >= maxRetries) {
        break;
      }

      // Wait before retry with exponential backoff
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }

  // All retries exhausted
  throw new EntityExtractionError(
    `Entity extraction failed after ${maxRetries + 1} attempts: ${lastError?.message || "Unknown error"}`,
    lastError,
    false
  );
}

/**
 * Extract specific entity types from text
 */
export async function extractEntityTypes(
  text: string,
  types: EntityType[]
): Promise<ExtractionResult> {
  return extractEntities(text, { entityTypes: types });
}

export default {
  extractEntities,
  extractEntityTypes,
  EntityExtractionError,
  ExtractedEntitySchema,
};
/**
 * Function Extractor
 *
 * Extracts function entities from TypeScript/JavaScript source code.
 * Handles function declarations, expressions, arrow functions, and methods.
 */

import * as ts from 'typescript';

/**
 * Represents an extracted function entity
 */
export interface FunctionEntity {
  name: string;
  kind: 'declaration' | 'expression' | 'arrow' | 'method';
  signature: string;
  parameters: ParameterInfo[];
  returnType: string | undefined;
  dependencies: string[];
  lineStart: number;
  lineEnd: number;
  isAsync: boolean;
  isGenerator: boolean;
  isExported: boolean;
  isDefault: boolean;
  documentation?: string;
}

/**
 * Parameter information
 */
export interface ParameterInfo {
  name: string;
  type: string | undefined;
  isOptional: boolean;
  isRest: boolean;
  defaultValue?: string;
}

/**
 * Options for function extraction
 */
export interface FunctionExtractorOptions {
  includePrivate?: boolean;
  includeMethods?: boolean;
  includeAnonymous?: boolean;
}

/**
 * Extracts function entities from TypeScript source code
 */
export function extractFunctions(
  sourceCode: string,
  filePath: string = 'source.ts',
  options: FunctionExtractorOptions = {}
): FunctionEntity[] {
  const { includePrivate = true, includeMethods = true, includeAnonymous = false } = options;

  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const functions: FunctionEntity[] = [];

  function visit(node: ts.Node, exportContext: { isExported: boolean; isDefault: boolean } = { isExported: false, isDefault: false }) {
    // Handle export statements
    if (ts.isExportAssignment(node)) {
      if (ts.isFunctionExpression(node.expression) || ts.isArrowFunction(node.expression)) {
        const func = extractFunctionFromNode(node.expression, sourceFile, { isExported: true, isDefault: true });
        if (func && (includeAnonymous || func.name !== '<anonymous>')) {
          functions.push(func);
        }
      }
      return;
    }

    // Check for export modifiers
    let currentExportContext = { ...exportContext };
    if (ts.canHaveModifiers(node)) {
      const modifiers = ts.getModifiers(node);
      if (modifiers) {
        currentExportContext.isExported = modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
        currentExportContext.isDefault = modifiers.some(m => m.kind === ts.SyntaxKind.DefaultKeyword);
      }
    }

    // Function declarations
    if (ts.isFunctionDeclaration(node)) {
      const func = extractFunctionDeclaration(node, sourceFile, currentExportContext);
      if (func && (includeAnonymous || func.name !== '<anonymous>')) {
        if (includePrivate || func.isExported || !func.name.startsWith('_')) {
          functions.push(func);
        }
      }
    }

    // Variable declarations with function expressions or arrow functions
    if (ts.isVariableStatement(node)) {
      const varDeclarations = node.declarationList.declarations;
      for (const decl of varDeclarations) {
        if (decl.initializer && (ts.isFunctionExpression(decl.initializer) || ts.isArrowFunction(decl.initializer))) {
          const func = extractFunctionFromVariableDeclaration(decl, sourceFile, currentExportContext);
          if (func && (includePrivate || func.isExported || !func.name.startsWith('_'))) {
            functions.push(func);
          }
        }
      }
    }

    // Method declarations in classes
    if (includeMethods && ts.isMethodDeclaration(node)) {
      const func = extractMethodDeclaration(node, sourceFile);
      if (func && (includePrivate || !func.name.startsWith('_'))) {
        functions.push(func);
      }
    }

    ts.forEachChild(node, child => visit(child, currentExportContext));
  }

  visit(sourceFile);
  return functions;
}

function extractFunctionDeclaration(
  node: ts.FunctionDeclaration,
  sourceFile: ts.SourceFile,
  exportContext: { isExported: boolean; isDefault: boolean }
): FunctionEntity | null {
  const name = node.name?.getText(sourceFile) ?? '<anonymous>';
  const { line: lineStart } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const { line: lineEnd } = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  const isAsync = modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
  const isGenerator = node.asteriskToken !== undefined;

  return {
    name,
    kind: 'declaration',
    signature: extractSignature(node, sourceFile),
    parameters: extractParameters(node.parameters, sourceFile),
    returnType: node.type?.getText(sourceFile),
    dependencies: extractDependencies(node.body, sourceFile),
    lineStart: lineStart + 1,
    lineEnd: lineEnd + 1,
    isAsync,
    isGenerator,
    isExported: exportContext.isExported,
    isDefault: exportContext.isDefault,
    documentation: extractDocumentation(node, sourceFile),
  };
}

function extractFunctionFromVariableDeclaration(
  node: ts.VariableDeclaration,
  sourceFile: ts.SourceFile,
  exportContext: { isExported: boolean; isDefault: boolean }
): FunctionEntity | null {
  const initializer = node.initializer;
  if (!initializer || (!ts.isFunctionExpression(initializer) && !ts.isArrowFunction(initializer))) {
    return null;
  }

  const name = node.name.getText(sourceFile);
  const { line: lineStart } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const { line: lineEnd } = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

  const modifiers = ts.canHaveModifiers(initializer) ? ts.getModifiers(initializer) : undefined;
  const isAsync = modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
  const isGenerator = ts.isFunctionExpression(initializer) && initializer.asteriskToken !== undefined;

  const kind = ts.isArrowFunction(initializer) ? 'arrow' : 'expression';

  return {
    name,
    kind,
    signature: extractSignatureFromExpression(name, initializer, sourceFile),
    parameters: extractParameters(initializer.parameters, sourceFile),
    returnType: initializer.type?.getText(sourceFile),
    dependencies: extractDependencies(initializer.body, sourceFile),
    lineStart: lineStart + 1,
    lineEnd: lineEnd + 1,
    isAsync,
    isGenerator,
    isExported: exportContext.isExported,
    isDefault: exportContext.isDefault,
    documentation: extractDocumentation(node.parent.parent, sourceFile),
  };
}

function extractFunctionFromNode(
  node: ts.FunctionExpression | ts.ArrowFunction,
  sourceFile: ts.SourceFile,
  exportContext: { isExported: boolean; isDefault: boolean }
): FunctionEntity | null {
  const name = ts.isFunctionExpression(node) && node.name ? node.name.getText(sourceFile) : '<anonymous>';
  const { line: lineStart } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const { line: lineEnd } = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  const isAsync = modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
  const isGenerator = ts.isFunctionExpression(node) && node.asteriskToken !== undefined;

  return {
    name,
    kind: ts.isArrowFunction(node) ? 'arrow' : 'expression',
    signature: extractSignatureFromExpression(name, node, sourceFile),
    parameters: extractParameters(node.parameters, sourceFile),
    returnType: node.type?.getText(sourceFile),
    dependencies: extractDependencies(node.body, sourceFile),
    lineStart: lineStart + 1,
    lineEnd: lineEnd + 1,
    isAsync,
    isGenerator,
    isExported: exportContext.isExported,
    isDefault: exportContext.isDefault,
  };
}

function extractMethodDeclaration(
  node: ts.MethodDeclaration,
  sourceFile: ts.SourceFile
): FunctionEntity | null {
  const name = node.name.getText(sourceFile);
  const { line: lineStart } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const { line: lineEnd } = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  const isAsync = modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
  const isGenerator = node.asteriskToken !== undefined;

  return {
    name,
    kind: 'method',
    signature: extractSignature(node, sourceFile),
    parameters: extractParameters(node.parameters, sourceFile),
    returnType: node.type?.getText(sourceFile),
    dependencies: extractDependencies(node.body, sourceFile),
    lineStart: lineStart + 1,
    lineEnd: lineEnd + 1,
    isAsync,
    isGenerator,
    isExported: false,
    isDefault: false,
    documentation: extractDocumentation(node, sourceFile),
  };
}

function extractSignature(node: ts.FunctionDeclaration | ts.MethodDeclaration, sourceFile: ts.SourceFile): string {
  const name = node.name?.getText(sourceFile) ?? '';
  const params = node.parameters.map(p => p.getText(sourceFile)).join(', ');
  const returnType = node.type ? `: ${node.type.getText(sourceFile)}` : '';
  const asyncPrefix = ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ? 'async ' : '';
  const generatorMark = node.asteriskToken ? '*' : '';
  return `${asyncPrefix}function${generatorMark} ${name}(${params})${returnType}`;
}

function extractSignatureFromExpression(name: string, node: ts.FunctionExpression | ts.ArrowFunction, sourceFile: ts.SourceFile): string {
  const params = node.parameters.map(p => p.getText(sourceFile)).join(', ');
  const returnType = node.type ? `: ${node.type.getText(sourceFile)}` : '';
  const asyncPrefix = ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ? 'async ' : '';
  const arrow = ts.isArrowFunction(node) ? ' =>' : '';
  return `${asyncPrefix}(${params})${returnType}${arrow}`;
}

function extractParameters(params: ts.NodeArray<ts.ParameterDeclaration>, sourceFile: ts.SourceFile): ParameterInfo[] {
  return params.map(param => ({
    name: param.name.getText(sourceFile),
    type: param.type?.getText(sourceFile),
    isOptional: param.questionToken !== undefined || param.initializer !== undefined,
    isRest: param.dotDotDotToken !== undefined,
    defaultValue: param.initializer?.getText(sourceFile),
  }));
}

function extractDependencies(body: ts.Node | undefined, sourceFile: ts.SourceFile): string[] {
  const dependencies = new Set<string>();

  if (!body) return [];

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      dependencies.add(node.expression.getText(sourceFile));
    }
    ts.forEachChild(node, visit);
  }

  visit(body);
  return Array.from(dependencies);
}

function extractDocumentation(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
  const jsDocComments = (node as any).jsDoc as ts.JSDoc[] | undefined;
  if (jsDocComments && jsDocComments.length > 0) {
    return jsDocComments.map(doc => doc.getText(sourceFile)).join('\n');
  }
  return undefined;
}
import * as ts from "typescript";

export interface ClassProperty {
  name: string;
  type: string | null;
  visibility: "public" | "private" | "protected";
  isStatic: boolean;
  isReadonly: boolean;
  initializer: string | null;
  decorators: string[];
}

export interface ClassMethod {
  name: string;
  signature: string;
  visibility: "public" | "private" | "protected";
  isStatic: boolean;
  isAsync: boolean;
  isAbstract: boolean;
  parameters: MethodParameter[];
  returnType: string | null;
  decorators: string[];
}

export interface MethodParameter {
  name: string;
  type: string | null;
  isOptional: boolean;
  isRest: boolean;
  defaultValue: string | null;
}

export interface ClassEntity {
  name: string;
  kind: "class" | "abstract-class";
  extends: string | null;
  implements: string[];
  properties: ClassProperty[];
  methods: ClassMethod[];
  decorators: string[];
  isExported: boolean;
  isDefault: boolean;
  typeParameters: string[];
  startLine: number;
  endLine: number;
}

export interface ClassExtractionResult {
  classes: ClassEntity[];
  errors: string[];
}

export function extractClasses(sourceCode: string, fileName: string = "file.ts"): ClassExtractionResult {
  const classes: ClassEntity[] = [];
  const errors: string[] = [];

  const sourceFile = ts.createSourceFile(
    fileName,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  function getLineNumber(pos: number): number {
    return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
  }

  function getNodeText(node: ts.Node): string {
    return node.getText(sourceFile);
  }

  function getDecorators(node: ts.Node): string[] {
    const decorators: string[] = [];
    const modifiers = ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined;
    if (modifiers) {
      for (const decorator of modifiers) {
        decorators.push(getNodeText(decorator.expression));
      }
    }
    return decorators;
  }

  function getVisibility(node: ts.Node): "public" | "private" | "protected" {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    if (modifiers) {
      for (const modifier of modifiers) {
        if (modifier.kind === ts.SyntaxKind.PrivateKeyword) return "private";
        if (modifier.kind === ts.SyntaxKind.ProtectedKeyword) return "protected";
      }
    }
    return "public";
  }

  function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return modifiers?.some(m => m.kind === kind) ?? false;
  }

  function getTypeString(typeNode: ts.TypeNode | undefined): string | null {
    if (!typeNode) return null;
    return getNodeText(typeNode);
  }

  function extractTypeParameters(node: ts.ClassDeclaration | ts.ClassExpression): string[] {
    if (!node.typeParameters) return [];
    return node.typeParameters.map(tp => getNodeText(tp));
  }

  function extractParameter(param: ts.ParameterDeclaration): MethodParameter {
    return {
      name: param.name.getText(sourceFile),
      type: getTypeString(param.type),
      isOptional: !!param.questionToken,
      isRest: !!param.dotDotDotToken,
      defaultValue: param.initializer ? getNodeText(param.initializer) : null,
    };
  }

  function extractProperty(member: ts.PropertyDeclaration): ClassProperty {
    return {
      name: member.name.getText(sourceFile),
      type: getTypeString(member.type),
      visibility: getVisibility(member),
      isStatic: hasModifier(member, ts.SyntaxKind.StaticKeyword),
      isReadonly: hasModifier(member, ts.SyntaxKind.ReadonlyKeyword),
      initializer: member.initializer ? getNodeText(member.initializer) : null,
      decorators: getDecorators(member),
    };
  }

  function extractMethod(member: ts.MethodDeclaration | ts.ConstructorDeclaration | ts.GetAccessorDeclaration | ts.SetAccessorDeclaration): ClassMethod {
    const isConstructor = ts.isConstructorDeclaration(member);
    const isGetter = ts.isGetAccessorDeclaration(member);
    const isSetter = ts.isSetAccessorDeclaration(member);
    
    let name: string;
    if (isConstructor) {
      name = "constructor";
    } else if (isGetter) {
      name = `get ${member.name.getText(sourceFile)}`;
    } else if (isSetter) {
      name = `set ${member.name.getText(sourceFile)}`;
    } else {
      name = member.name.getText(sourceFile);
    }

    const parameters = member.parameters.map(extractParameter);
    
    const paramSignature = parameters.map(p => {
      let sig = p.isRest ? "..." : "";
      sig += p.name;
      if (p.isOptional) sig += "?";
      if (p.type) sig += ": " + p.type;
      if (p.defaultValue) sig += " = " + p.defaultValue;
      return sig;
    }).join(", ");

    const returnType = !isConstructor && "type" in member ? getTypeString(member.type) : null;
    const signature = `${name}(${paramSignature})${returnType ? ": " + returnType : ""}`;

    return {
      name,
      signature,
      visibility: isConstructor ? "public" : getVisibility(member),
      isStatic: hasModifier(member, ts.SyntaxKind.StaticKeyword),
      isAsync: hasModifier(member, ts.SyntaxKind.AsyncKeyword),
      isAbstract: hasModifier(member, ts.SyntaxKind.AbstractKeyword),
      parameters,
      returnType,
      decorators: getDecorators(member),
    };
  }

  function extractClassEntity(
    node: ts.ClassDeclaration | ts.ClassExpression,
    isExported: boolean,
    isDefault: boolean,
    assignedName?: string
  ): ClassEntity {
    const name = node.name?.getText(sourceFile) ?? assignedName ?? "<anonymous>";
    const isAbstract = hasModifier(node, ts.SyntaxKind.AbstractKeyword);
    
    let extendsClause: string | null = null;
    const implementsList: string[] = [];

    if (node.heritageClauses) {
      for (const clause of node.heritageClauses) {
        if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
          extendsClause = clause.types[0]?.getText(sourceFile) ?? null;
        } else if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
          for (const type of clause.types) {
            implementsList.push(type.getText(sourceFile));
          }
        }
      }
    }

    const properties: ClassProperty[] = [];
    const methods: ClassMethod[] = [];

    for (const member of node.members) {
      if (ts.isPropertyDeclaration(member)) {
        properties.push(extractProperty(member));
      } else if (ts.isMethodDeclaration(member)) {
        methods.push(extractMethod(member));
      } else if (ts.isConstructorDeclaration(member)) {
        methods.push(extractMethod(member));
        for (const param of member.parameters) {
          if (hasModifier(param, ts.SyntaxKind.PublicKeyword) ||
              hasModifier(param, ts.SyntaxKind.PrivateKeyword) ||
              hasModifier(param, ts.SyntaxKind.ProtectedKeyword) ||
              hasModifier(param, ts.SyntaxKind.ReadonlyKeyword)) {
            properties.push({
              name: param.name.getText(sourceFile),
              type: getTypeString(param.type),
              visibility: getVisibility(param),
              isStatic: false,
              isReadonly: hasModifier(param, ts.SyntaxKind.ReadonlyKeyword),
              initializer: param.initializer ? getNodeText(param.initializer) : null,
              decorators: getDecorators(param),
            });
          }
        }
      } else if (ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) {
        methods.push(extractMethod(member));
      }
    }

    return {
      name,
      kind: isAbstract ? "abstract-class" : "class",
      extends: extendsClause,
      implements: implementsList,
      properties,
      methods,
      decorators: getDecorators(node),
      isExported,
      isDefault,
      typeParameters: extractTypeParameters(node),
      startLine: getLineNumber(node.getStart(sourceFile)),
      endLine: getLineNumber(node.getEnd()),
    };
  }

  function visit(node: ts.Node): void {
    try {
      if (ts.isClassDeclaration(node)) {
        const isExported = hasModifier(node, ts.SyntaxKind.ExportKeyword);
        const isDefault = hasModifier(node, ts.SyntaxKind.DefaultKeyword);
        classes.push(extractClassEntity(node, isExported, isDefault));
      } else if (ts.isVariableStatement(node)) {
        const isExported = hasModifier(node, ts.SyntaxKind.ExportKeyword);
        for (const declaration of node.declarationList.declarations) {
          if (declaration.initializer && ts.isClassExpression(declaration.initializer)) {
            const name = declaration.name.getText(sourceFile);
            classes.push(extractClassEntity(declaration.initializer, isExported, false, name));
          }
        }
      } else if (ts.isExportAssignment(node) && !node.isExportEquals) {
        if (ts.isClassExpression(node.expression)) {
          classes.push(extractClassEntity(node.expression, true, true));
        }
      }

      ts.forEachChild(node, visit);
    } catch (e) {
      errors.push(`Error processing node: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  visit(sourceFile);

  return { classes, errors };
}

export function extractClassesFromMultipleFiles(
  files: Array<{ fileName: string; content: string }>
): Map<string, ClassExtractionResult> {
  const results = new Map<string, ClassExtractionResult>();
  
  for (const file of files) {
    results.set(file.fileName, extractClasses(file.content, file.fileName));
  }
  
  return results;
}

export function buildClassHierarchy(classes: ClassEntity[]): Map<string, ClassEntity[]> {
  const hierarchy = new Map<string, ClassEntity[]>();
  
  for (const cls of classes) {
    if (cls.extends) {
      const children = hierarchy.get(cls.extends) ?? [];
      children.push(cls);
      hierarchy.set(cls.extends, children);
    }
  }
  
  return hierarchy;
}

export function findClassByName(classes: ClassEntity[], name: string): ClassEntity | undefined {
  return classes.find(c => c.name === name);
}

export function getInheritanceChain(classes: ClassEntity[], className: string): string[] {
  const chain: string[] = [className];
  let current = findClassByName(classes, className);
  
  while (current?.extends) {
    chain.push(current.extends);
    current = findClassByName(classes, current.extends);
  }
  
  return chain;
}

export function getAllImplementedInterfaces(classes: ClassEntity[], className: string): string[] {
  const interfaces = new Set<string>();
  const chain = getInheritanceChain(classes, className);
  
  for (const name of chain) {
    const cls = findClassByName(classes, name);
    if (cls) {
      for (const iface of cls.implements) {
        interfaces.add(iface);
      }
    }
  }
  
  return Array.from(interfaces);
}
import { z } from "zod";

/**
 * Type Extractor - Extracts TypeScript type definitions from source code
 *
 * Detects:
 * - Type aliases (type Foo = ...)
 * - Interfaces (interface Bar { ... })
 * - Generic types and constraints
 * - Union and intersection types
 * - Property definitions with types
 * - Usage locations throughout code
 */

// Schema definitions
export const TypePropertySchema = z.object({
  name: z.string(),
  type: z.string(),
  optional: z.boolean(),
  readonly: z.boolean(),
  description: z.string().optional(),
  line: z.number(),
});

export const GenericConstraintSchema = z.object({
  name: z.string(),
  extends: z.string().optional(),
  default: z.string().optional(),
});

export const TypeUsageSchema = z.object({
  file: z.string(),
  line: z.number(),
  column: z.number(),
  context: z.enum(["declaration", "parameter", "return", "property", "extends", "implements", "generic"]),
});

export const ExtractedTypeSchema = z.object({
  name: z.string(),
  kind: z.enum(["alias", "interface"]),
  properties: z.array(TypePropertySchema),
  generics: z.array(GenericConstraintSchema),
  extends: z.array(z.string()),
  unionMembers: z.array(z.string()).optional(),
  intersectionMembers: z.array(z.string()).optional(),
  rawType: z.string().optional(),
  exported: z.boolean(),
  description: z.string().optional(),
  location: z.object({
    file: z.string(),
    startLine: z.number(),
    endLine: z.number(),
  }),
  usages: z.array(TypeUsageSchema),
});

export type TypeProperty = z.infer<typeof TypePropertySchema>;
export type GenericConstraint = z.infer<typeof GenericConstraintSchema>;
export type TypeUsage = z.infer<typeof TypeUsageSchema>;
export type ExtractedType = z.infer<typeof ExtractedTypeSchema>;

export interface TypeExtractionOptions {
  includePrivate?: boolean;
  trackUsages?: boolean;
  parseJsDoc?: boolean;
}

export interface TypeExtractionResult {
  types: ExtractedType[];
  errors: Array<{ message: string; line?: number }>;
}

/**
 * Extract type definitions from TypeScript source code
 */
export function extractTypes(
  sourceCode: string,
  filePath: string,
  options: TypeExtractionOptions = {}
): TypeExtractionResult {
  const { includePrivate = false, trackUsages = true, parseJsDoc = true } = options;
  const types: ExtractedType[] = [];
  const errors: Array<{ message: string; line?: number }> = [];
  const lines = sourceCode.split("\n");

  // Patterns for type detection
  const typeAliasPattern = /^(export\s+)?type\s+(\w+)(<[^>]+>)?\s*=\s*(.+)$/;
  const interfaceStartPattern = /^(export\s+)?interface\s+(\w+)(<[^>]+>)?(\s+extends\s+[^{]+)?\s*\{/;
  const propertyPattern = /^\s*(readonly\s+)?(\w+)(\?)?\s*:\s*(.+?);?\s*$/;
  const jsDocPattern = /\/\*\*([\s\S]*?)\*\//;

  let currentJsDoc: string | undefined;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Capture JSDoc comments
    if (parseJsDoc && trimmedLine.startsWith("/**")) {
      const jsDocStart = i;
      let jsDocContent = "";
      while (i < lines.length && !lines[i].includes("*/")) {
        jsDocContent += lines[i] + "\n";
        i++;
      }
      if (i < lines.length) {
        jsDocContent += lines[i];
        currentJsDoc = extractJsDocDescription(jsDocContent);
      }
      i++;
      continue;
    }

    // Check for type alias
    const typeMatch = trimmedLine.match(typeAliasPattern);
    if (typeMatch) {
      const exported = !!typeMatch[1];
      if (!exported && !includePrivate) {
        currentJsDoc = undefined;
        i++;
        continue;
      }

      const name = typeMatch[2];
      const genericsStr = typeMatch[3];
      let typeBody = typeMatch[4];

      // Handle multi-line type definitions
      let endLine = i;
      if (!isTypeComplete(typeBody)) {
        const result = collectMultiLineType(lines, i, typeBody);
        typeBody = result.body;
        endLine = result.endLine;
      }

      const extractedType: ExtractedType = {
        name,
        kind: "alias",
        properties: extractPropertiesFromType(typeBody, i + 1),
        generics: parseGenerics(genericsStr),
        extends: [],
        exported,
        description: currentJsDoc,
        location: {
          file: filePath,
          startLine: i + 1,
          endLine: endLine + 1,
        },
        usages: [],
      };

      // Detect union types
      const unionMembers = extractUnionMembers(typeBody);
      if (unionMembers.length > 1) {
        extractedType.unionMembers = unionMembers;
      }

      // Detect intersection types
      const intersectionMembers = extractIntersectionMembers(typeBody);
      if (intersectionMembers.length > 1) {
        extractedType.intersectionMembers = intersectionMembers;
      }

      extractedType.rawType = typeBody.trim();
      types.push(extractedType);
      currentJsDoc = undefined;
      i = endLine + 1;
      continue;
    }

    // Check for interface
    const interfaceMatch = trimmedLine.match(interfaceStartPattern);
    if (interfaceMatch) {
      const exported = !!interfaceMatch[1];
      if (!exported && !includePrivate) {
        currentJsDoc = undefined;
        i++;
        continue;
      }

      const name = interfaceMatch[2];
      const genericsStr = interfaceMatch[3];
      const extendsStr = interfaceMatch[4];

      // Collect interface body
      const startLine = i;
      const { body, endLine } = collectInterfaceBody(lines, i);
      const properties = parseInterfaceProperties(body, startLine + 1);

      const extractedType: ExtractedType = {
        name,
        kind: "interface",
        properties,
        generics: parseGenerics(genericsStr),
        extends: parseExtends(extendsStr),
        exported,
        description: currentJsDoc,
        location: {
          file: filePath,
          startLine: startLine + 1,
          endLine: endLine + 1,
        },
        usages: [],
      };

      types.push(extractedType);
      currentJsDoc = undefined;
      i = endLine + 1;
      continue;
    }

    currentJsDoc = undefined;
    i++;
  }

  // Track usages if enabled
  if (trackUsages) {
    for (const type of types) {
      type.usages = findTypeUsages(sourceCode, type.name, filePath);
    }
  }

  return { types, errors };
}

/**
 * Parse generic type parameters and constraints
 */
export function parseGenerics(genericsStr: string | undefined): GenericConstraint[] {
  if (!genericsStr) return [];

  // Remove angle brackets
  const inner = genericsStr.slice(1, -1).trim();
  if (!inner) return [];

  const generics: GenericConstraint[] = [];
  const parts = splitGenericParams(inner);

  for (const part of parts) {
    const trimmed = part.trim();
    const extendsMatch = trimmed.match(/^(\w+)\s+extends\s+(.+?)(?:\s*=\s*(.+))?$/);
    const defaultMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);

    if (extendsMatch) {
      generics.push({
        name: extendsMatch[1],
        extends: extendsMatch[2].trim(),
        default: extendsMatch[3]?.trim(),
      });
    } else if (defaultMatch) {
      generics.push({
        name: defaultMatch[1],
        default: defaultMatch[2].trim(),
      });
    } else {
      generics.push({ name: trimmed });
    }
  }

  return generics;
}

/**
 * Split generic parameters respecting nested angle brackets
 */
function splitGenericParams(str: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of str) {
    if (char === "<") depth++;
    else if (char === ">") depth--;
    else if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) {
    parts.push(current);
  }

  return parts;
}

/**
 * Extract union type members
 */
export function extractUnionMembers(typeBody: string): string[] {
  // Skip if it's an object type or has nested structures
  if (typeBody.trim().startsWith("{")) return [];

  const members: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of typeBody) {
    if (char === "<" || char === "(" || char === "{") depth++;
    else if (char === ">" || char === ")" || char === "}") depth--;
    else if (char === "|" && depth === 0) {
      if (current.trim()) members.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) members.push(current.trim());
  return members;
}

/**
 * Extract intersection type members
 */
export function extractIntersectionMembers(typeBody: string): string[] {
  if (typeBody.trim().startsWith("{")) return [];

  const members: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of typeBody) {
    if (char === "<" || char === "(" || char === "{") depth++;
    else if (char === ">" || char === ")" || char === "}") depth--;
    else if (char === "&" && depth === 0) {
      if (current.trim()) members.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) members.push(current.trim());
  return members;
}

/**
 * Check if a type definition is complete (balanced braces/brackets)
 */
function isTypeComplete(typeBody: string): boolean {
  let braceCount = 0;
  let bracketCount = 0;
  let parenCount = 0;

  for (const char of typeBody) {
    if (char === "{") braceCount++;
    else if (char === "}") braceCount--;
    else if (char === "<") bracketCount++;
    else if (char === ">") bracketCount--;
    else if (char === "(") parenCount++;
    else if (char === ")") parenCount--;
  }

  return braceCount === 0 && bracketCount === 0 && parenCount === 0;
}

/**
 * Collect multi-line type definition
 */
function collectMultiLineType(
  lines: string[],
  startLine: number,
  initialBody: string
): { body: string; endLine: number } {
  let body = initialBody;
  let endLine = startLine;

  while (endLine < lines.length - 1 && !isTypeComplete(body)) {
    endLine++;
    body += "\n" + lines[endLine];
  }

  return { body, endLine };
}

/**
 * Collect interface body including nested braces
 */
function collectInterfaceBody(
  lines: string[],
  startLine: number
): { body: string; endLine: number } {
  let body = "";
  let braceCount = 0;
  let started = false;
  let endLine = startLine;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    body += line + "\n";

    for (const char of line) {
      if (char === "{") {
        braceCount++;
        started = true;
      } else if (char === "}") {
        braceCount--;
      }
    }

    if (started && braceCount === 0) {
      endLine = i;
      break;
    }
    endLine = i;
  }

  return { body, endLine };
}

/**
 * Parse interface properties from body
 */
function parseInterfaceProperties(body: string, startLine: number): TypeProperty[] {
  const properties: TypeProperty[] = [];
  const lines = body.split("\n");
  const propertyPattern = /^\s*(readonly\s+)?(\w+)(\?)?\s*:\s*(.+?);?\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "{" || line === "}" || line === "") continue;

    const match = line.match(propertyPattern);
    if (match) {
      properties.push({
        name: match[2],
        type: match[4].replace(/;$/, "").trim(),
        optional: !!match[3],
        readonly: !!match[1],
        line: startLine + i,
      });
    }
  }

  return properties;
}

/**
 * Extract properties from inline object type
 */
function extractPropertiesFromType(typeBody: string, line: number): TypeProperty[] {
  const trimmed = typeBody.trim();
  if (!trimmed.startsWith("{")) return [];

  // Remove outer braces
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];

  return parseInterfaceProperties("{" + inner + "}", line);
}

/**
 * Parse extends clause
 */
function parseExtends(extendsStr: string | undefined): string[] {
  if (!extendsStr) return [];

  const cleaned = extendsStr.replace(/^\s*extends\s+/, "").trim();
  return cleaned.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Extract JSDoc description
 */
function extractJsDocDescription(jsDoc: string): string {
  const lines = jsDoc.split("\n");
  const descriptionLines: string[] = [];

  for (const line of lines) {
    const cleaned = line.replace(/^\/\*\*|\*\/|^\s*\*\s?/, "").trim();
    if (cleaned && !cleaned.startsWith("@")) {
      descriptionLines.push(cleaned);
    }
  }

  return descriptionLines.join(" ").trim();
}

/**
 * Find usages of a type throughout the source code
 */
export function findTypeUsages(sourceCode: string, typeName: string, filePath: string): TypeUsage[] {
  const usages: TypeUsage[] = [];
  const lines = sourceCode.split("\n");

  // Pattern to match type usage (not definition)
  const usagePatterns = [
    { pattern: new RegExp(`:\s*${typeName}(?:<|\\s|\\)|,|;|$)`), context: "declaration" as const },
    { pattern: new RegExp(`\\(.*:\s*${typeName}(?:<|\\s|\\)|,)`), context: "parameter" as const },
    { pattern: new RegExp(`\\)\\s*:\s*${typeName}(?:<|\\s|\\{|$)`), context: "return" as const },
    { pattern: new RegExp(`extends\s+.*${typeName}`), context: "extends" as const },
    { pattern: new RegExp(`implements\s+.*${typeName}`), context: "implements" as const },
    { pattern: new RegExp(`<.*${typeName}.*>`), context: "generic" as const },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip type definition lines
    if (line.match(new RegExp(`^\\s*(export\\s+)?(type|interface)\\s+${typeName}\\b`))) {
      continue;
    }

    for (const { pattern, context } of usagePatterns) {
      const match = line.match(pattern);
      if (match) {
        const column = line.indexOf(typeName);
        usages.push({
          file: filePath,
          line: i + 1,
          column: column + 1,
          context,
        });
        break;
      }
    }
  }

  return usages;
}
/**
 * Entity Linker - Links and deduplicates extracted entities
 *
 * Responsibilities:
 * - Remove duplicate entities with same name and location
 * - Link entities through dependency IDs
 * - Resolve references between entities
 * - Adjust confidence scores for linked entities
 * - Handle circular dependencies gracefully
 */

export interface EntityLocation {
  file: string;
  line: number;
  column?: number;
}

export interface ExtractedEntity {
  id: string;
  name: string;
  type: string;
  location: EntityLocation;
  confidence: number;
  dependencies?: string[];
  references?: string[];
  metadata?: Record<string, unknown>;
}

export interface LinkedEntity extends ExtractedEntity {
  linkedDependencies: string[];
  linkedReferences: string[];
  duplicateOf?: string;
  linkConfidence: number;
}

export interface LinkingResult {
  entities: LinkedEntity[];
  duplicatesRemoved: number;
  linksCreated: number;
  circularDependencies: string[][];
}

/**
 * Creates a unique key for entity deduplication based on name and location
 */
function createEntityKey(entity: ExtractedEntity): string {
  return `${entity.name}:${entity.location.file}:${entity.location.line}`;
}

/**
 * Finds duplicate entities based on name and location
 */
function findDuplicates(
  entities: ExtractedEntity[]
): Map<string, ExtractedEntity[]> {
  const groups = new Map<string, ExtractedEntity[]>();

  for (const entity of entities) {
    const key = createEntityKey(entity);
    const existing = groups.get(key) || [];
    existing.push(entity);
    groups.set(key, existing);
  }

  return groups;
}

/**
 * Selects the best entity from a group of duplicates
 * Prefers higher confidence scores
 */
function selectBestEntity(duplicates: ExtractedEntity[]): ExtractedEntity {
  if (duplicates.length === 1) {
    return duplicates[0];
  }

  return duplicates.reduce((best, current) =>
    current.confidence > best.confidence ? current : best
  );
}

/**
 * Removes duplicate entities, keeping the one with highest confidence
 */
function deduplicateEntities(entities: ExtractedEntity[]): {
  deduplicated: ExtractedEntity[];
  duplicatesRemoved: number;
  duplicateMap: Map<string, string>;
} {
  const groups = findDuplicates(entities);
  const deduplicated: ExtractedEntity[] = [];
  const duplicateMap = new Map<string, string>();
  let duplicatesRemoved = 0;

  for (const [, group] of groups) {
    const best = selectBestEntity(group);
    deduplicated.push(best);

    for (const entity of group) {
      if (entity.id !== best.id) {
        duplicateMap.set(entity.id, best.id);
        duplicatesRemoved++;
      }
    }
  }

  return { deduplicated, duplicatesRemoved, duplicateMap };
}

/**
 * Builds an index of entities by name for quick lookup
 */
function buildNameIndex(entities: ExtractedEntity[]): Map<string, ExtractedEntity[]> {
  const index = new Map<string, ExtractedEntity[]>();

  for (const entity of entities) {
    const existing = index.get(entity.name) || [];
    existing.push(entity);
    index.set(entity.name, existing);
  }

  return index;
}

/**
 * Resolves a reference name to an entity ID
 */
function resolveReference(
  refName: string,
  nameIndex: Map<string, ExtractedEntity[]>,
  currentEntity: ExtractedEntity
): string | null {
  const candidates = nameIndex.get(refName);
  if (!candidates || candidates.length === 0) {
    return null;
  }

  if (candidates.length === 1) {
    return candidates[0].id;
  }

  const sameFile = candidates.find(
    (c) => c.location.file === currentEntity.location.file
  );
  if (sameFile) {
    return sameFile.id;
  }

  return candidates.reduce((best, current) =>
    current.confidence > best.confidence ? current : best
  ).id;
}

/**
 * Detects circular dependencies using DFS
 */
function detectCircularDependencies(
  entities: LinkedEntity[]
): string[][] {
  const entityMap = new Map<string, LinkedEntity>();
  for (const entity of entities) {
    entityMap.set(entity.id, entity);
  }

  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const cycles: string[][] = [];

  function dfs(entityId: string, path: string[]): void {
    if (recursionStack.has(entityId)) {
      const cycleStart = path.indexOf(entityId);
      if (cycleStart !== -1) {
        cycles.push(path.slice(cycleStart));
      }
      return;
    }

    if (visited.has(entityId)) {
      return;
    }

    visited.add(entityId);
    recursionStack.add(entityId);

    const entity = entityMap.get(entityId);
    if (entity) {
      for (const depId of entity.linkedDependencies) {
        dfs(depId, [...path, entityId]);
      }
    }

    recursionStack.delete(entityId);
  }

  for (const entity of entities) {
    if (!visited.has(entity.id)) {
      dfs(entity.id, []);
    }
  }

  return cycles;
}

/**
 * Adjusts confidence score based on linking quality
 */
function calculateLinkConfidence(
  entity: ExtractedEntity,
  resolvedDeps: number,
  totalDeps: number,
  resolvedRefs: number,
  totalRefs: number
): number {
  const baseConfidence = entity.confidence;

  if (totalDeps === 0 && totalRefs === 0) {
    return baseConfidence;
  }

  const depRatio = totalDeps > 0 ? resolvedDeps / totalDeps : 1;
  const refRatio = totalRefs > 0 ? resolvedRefs / totalRefs : 1;

  const linkBonus = ((depRatio + refRatio) / 2) * 0.1;

  return Math.min(1, baseConfidence + linkBonus);
}

/**
 * Links entities by resolving dependencies and references
 */
export function linkEntities(entities: ExtractedEntity[]): LinkingResult {
  if (entities.length === 0) {
    return {
      entities: [],
      duplicatesRemoved: 0,
      linksCreated: 0,
      circularDependencies: [],
    };
  }

  const { deduplicated, duplicatesRemoved, duplicateMap } =
    deduplicateEntities(entities);

  const nameIndex = buildNameIndex(deduplicated);
  const idSet = new Set(deduplicated.map((e) => e.id));

  let linksCreated = 0;
  const linkedEntities: LinkedEntity[] = [];

  for (const entity of deduplicated) {
    const linkedDependencies: string[] = [];
    const linkedReferences: string[] = [];

    const deps = entity.dependencies || [];
    for (const dep of deps) {
      const resolvedId = duplicateMap.get(dep) || dep;

      if (idSet.has(resolvedId)) {
        linkedDependencies.push(resolvedId);
        linksCreated++;
      } else {
        const resolved = resolveReference(dep, nameIndex, entity);
        if (resolved) {
          linkedDependencies.push(resolved);
          linksCreated++;
        }
      }
    }

    const refs = entity.references || [];
    for (const ref of refs) {
      const resolvedId = duplicateMap.get(ref) || ref;

      if (idSet.has(resolvedId)) {
        linkedReferences.push(resolvedId);
        linksCreated++;
      } else {
        const resolved = resolveReference(ref, nameIndex, entity);
        if (resolved) {
          linkedReferences.push(resolved);
          linksCreated++;
        }
      }
    }

    const linkConfidence = calculateLinkConfidence(
      entity,
      linkedDependencies.length,
      deps.length,
      linkedReferences.length,
      refs.length
    );

    linkedEntities.push({
      ...entity,
      linkedDependencies,
      linkedReferences,
      linkConfidence,
    });
  }

  const circularDependencies = detectCircularDependencies(linkedEntities);

  return {
    entities: linkedEntities,
    duplicatesRemoved,
    linksCreated,
    circularDependencies,
  };
}

export default linkEntities;
/**
 * Agent exports
 */

export { EntityExtractorAgent } from "./entity-extractor/index.js";
export type { EntityExtractorConfig, ExtractedEntity, ExtractionResult } from "./entity-extractor/types.js";
export { entityExtractorConfigSchema, extractedEntitySchema } from "./entity-extractor/types.js";
export { EntityExtractorPrompts } from "./entity-extractor/prompts.js";
# EntityExtractorAgent

An agent for extracting structured entities from unstructured text using LLM-powered analysis.

## Overview

The EntityExtractorAgent analyzes text content and extracts named entities such as people, organizations, locations, dates, and custom entity types. It uses configurable extraction strategies and supports both predefined and custom entity schemas.

## Installation

The agent is included in the main package:

```typescript
import { EntityExtractorAgent } from "@anthropic/agent-toolkit";
```

## Basic Usage

```typescript
import { EntityExtractorAgent } from "@anthropic/agent-toolkit";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const agent = new EntityExtractorAgent({
  client,
  entityTypes: ["person", "organization", "location"],
});

const result = await agent.extract(
  "John Smith works at Acme Corp in New York City."
);

console.log(result.entities);
// [
//   { type: "person", value: "John Smith", confidence: 0.95 },
//   { type: "organization", value: "Acme Corp", confidence: 0.92 },
//   { type: "location", value: "New York City", confidence: 0.98 }
// ]
```

## Configuration

### EntityExtractorConfig

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `client` | `Anthropic` | Yes | - | Anthropic client instance |
| `model` | `string` | No | `"claude-sonnet-4-20250514"` | Model to use for extraction |
| `entityTypes` | `string[]` | Yes | - | Types of entities to extract |
| `customSchema` | `object` | No | - | Custom Zod schema for entities |
| `minConfidence` | `number` | No | `0.7` | Minimum confidence threshold |
| `includeContext` | `boolean` | No | `false` | Include surrounding context |
| `maxTokens` | `number` | No | `1024` | Max tokens for response |
| `logger` | `Logger` | No | - | Custom logger instance |

### Example with Full Configuration

```typescript
import { EntityExtractorAgent, EntityExtractorConfig } from "@anthropic/agent-toolkit";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const config: EntityExtractorConfig = {
  client: new Anthropic(),
  model: "claude-sonnet-4-20250514",
  entityTypes: ["person", "organization", "date", "money"],
  minConfidence: 0.8,
  includeContext: true,
  maxTokens: 2048,
};

const agent = new EntityExtractorAgent(config);
```

## Custom Entity Types

Define custom entity schemas for domain-specific extraction:

```typescript
import { z } from "zod";

const customSchema = z.object({
  productCode: z.string().regex(/^[A-Z]{3}-\d{4}$/),
  version: z.string(),
  releaseDate: z.string().datetime(),
});

const agent = new EntityExtractorAgent({
  client,
  entityTypes: ["product"],
  customSchema,
});

const result = await agent.extract(
  "Product ABC-1234 version 2.0 was released on 2024-01-15."
);
```

## API Reference

### Methods

#### `extract(text: string, options?: ExtractOptions): Promise<ExtractionResult>`

Extracts entities from the provided text.

**Parameters:**
- `text` - The text to analyze
- `options` - Optional extraction options
  - `entityTypes` - Override configured entity types for this call
  - `minConfidence` - Override minimum confidence threshold

**Returns:** `ExtractionResult`

```typescript
interface ExtractionResult {
  entities: ExtractedEntity[];
  metadata: {
    processingTime: number;
    modelUsed: string;
    tokenCount: number;
  };
}

interface ExtractedEntity {
  type: string;
  value: string;
  confidence: number;
  startIndex?: number;
  endIndex?: number;
  context?: string;
  metadata?: Record<string, unknown>;
}
```

#### `extractBatch(texts: string[]): Promise<ExtractionResult[]>`

Extracts entities from multiple texts in parallel.

```typescript
const results = await agent.extractBatch([
  "Text one with entities...",
  "Text two with entities...",
]);
```

## Integration with Other Agents

The EntityExtractorAgent can be composed with other agents:

```typescript
import { EntityExtractorAgent, OrchestratorAgent } from "@anthropic/agent-toolkit";

// Use extracted entities to inform other agent decisions
const extractor = new EntityExtractorAgent({
  client,
  entityTypes: ["person", "task", "deadline"],
});

const orchestrator = new OrchestratorAgent({
  client,
  agents: [extractor],
});

// Extract entities first, then use them in orchestration
const entities = await extractor.extract(userInput);
const tasks = entities.entities.filter(e => e.type === "task");
```

## Logging

The agent follows the standard logging conventions:

```typescript
import { createLogger } from "@anthropic/agent-toolkit";

const logger = createLogger({ level: "debug" });

const agent = new EntityExtractorAgent({
  client,
  entityTypes: ["person"],
  logger,
});
```

Log output includes:
- Entity extraction requests
- Confidence scores
- Processing times
- Error details

## Error Handling

```typescript
import { ExtractionError } from "@anthropic/agent-toolkit";

try {
  const result = await agent.extract(text);
} catch (error) {
  if (error instanceof ExtractionError) {
    console.error("Extraction failed:", error.message);
    console.error("Partial results:", error.partialResults);
  }
}
```

## Best Practices

1. **Choose appropriate entity types** - Only request entity types relevant to your use case
2. **Set confidence thresholds** - Adjust `minConfidence` based on your accuracy requirements
3. **Use batch extraction** - For multiple texts, use `extractBatch` for better performance
4. **Enable context** - Set `includeContext: true` when you need surrounding text for disambiguation
5. **Custom schemas** - Define strict schemas for domain-specific entities to improve accuracy