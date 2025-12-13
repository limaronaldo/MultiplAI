import { describe, expect, test } from "bun:test";
import { EntityResolver } from "./entity-resolver";
import type { ExtractedEntity } from "./types";

describe("EntityResolver", () => {
  test("exact match merges by name + filePath", () => {
    const resolver = new EntityResolver();
    const a: ExtractedEntity = {
      id: "e1",
      entityType: "function",
      name: "doThing",
      filePath: "src/a.ts",
    };
    const b: ExtractedEntity = {
      id: "e2",
      entityType: "function",
      name: "doThing",
      filePath: "src/a.ts",
      metadata: { x: 1 },
    };

    const out = resolver.resolve([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].mergedFrom.sort()).toEqual(["e1", "e2"]);
  });

  test("signature match merges even if filePath changes", () => {
    const resolver = new EntityResolver();
    const a: ExtractedEntity = {
      id: "e1",
      entityType: "function",
      name: "process",
      filePath: "src/old.ts",
      signature: "process(data: DataType): void",
    };
    const b: ExtractedEntity = {
      id: "e2",
      entityType: "function",
      name: "processData",
      filePath: "src/new.ts",
      signature: "process(data: DataType): void",
    };

    const out = resolver.resolve([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].mergedFrom.sort()).toEqual(["e1", "e2"]);
  });

  test("fuzzy match merges similar names with threshold", () => {
    const resolver = new EntityResolver({ fuzzyMatchThreshold: 0.6 });
    const a: ExtractedEntity = {
      id: "e1",
      entityType: "class",
      name: "UserService",
      filePath: "src/user.ts",
    };
    const b: ExtractedEntity = {
      id: "e2",
      entityType: "class",
      name: "UsersService",
      filePath: "src/users.ts",
    };

    const out = resolver.resolve([a, b]);
    expect(out).toHaveLength(1);
  });

  test("infers imports/extends/implements relationships from content", () => {
    const resolver = new EntityResolver({ fuzzyMatchThreshold: 0.95 });
    const base: ExtractedEntity = {
      id: "base",
      entityType: "class",
      name: "BaseClass",
      filePath: "src/base.ts",
    };
    const logger: ExtractedEntity = {
      id: "logger",
      entityType: "class",
      name: "Logger",
      filePath: "src/logger.ts",
    };
    const serializable: ExtractedEntity = {
      id: "serial",
      entityType: "interface",
      name: "Serializable",
      filePath: "src/serial.ts",
    };
    const complex: ExtractedEntity = {
      id: "complex",
      entityType: "class",
      name: "ComplexClass",
      filePath: "src/complex.ts",
      content:
        "import { Logger } from './logger';\n" +
        "class ComplexClass extends BaseClass implements Serializable {\n" +
        "  private logger: Logger;\n" +
        "}\n",
    };

    const out = resolver.resolve([base, logger, serializable, complex]);
    const complexResolved = out.find((e) => e.name === "ComplexClass")!;
    const byType = new Map(complexResolved.relationships.map((r) => [r.type, r.targetId]));

    expect(byType.get("imports")).toBe(out.find((e) => e.name === "Logger")!.canonicalId);
    expect(byType.get("extends")).toBe(out.find((e) => e.name === "BaseClass")!.canonicalId);
    expect(byType.get("implements")).toBe(out.find((e) => e.name === "Serializable")!.canonicalId);
  });
});

