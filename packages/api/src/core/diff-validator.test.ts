import { describe, it, expect, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { applyFileChanges, type DiffFile } from "./diff-validator";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "diff-validator-test-"),
  );
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("applyFileChanges", () => {
  it("writes new files and creates missing directories", async () => {
    const tempDir = makeTempDir();
    const files: DiffFile[] = [
      { path: "src/index.ts", content: "export {};", deleted: false },
      { path: "src/nested/util.ts", content: "export const x = 1;", deleted: false },
    ];

    await applyFileChanges(tempDir, files);

    expect(fs.readFileSync(path.join(tempDir, "src/index.ts"), "utf-8")).toBe(
      "export {};",
    );
    expect(
      fs.readFileSync(path.join(tempDir, "src/nested/util.ts"), "utf-8"),
    ).toBe("export const x = 1;");
  });

  it("deletes files that exist", async () => {
    const tempDir = makeTempDir();
    fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "src/old.ts"), "old content");

    const files: DiffFile[] = [
      { path: "src/old.ts", content: "", deleted: true },
    ];

    await applyFileChanges(tempDir, files);

    expect(fs.existsSync(path.join(tempDir, "src/old.ts"))).toBe(false);
  });

  it("deleting a missing file does not throw (force rm)", async () => {
    const tempDir = makeTempDir();
    const files: DiffFile[] = [
      { path: "does/not/exist.ts", content: "", deleted: true },
    ];

    await expect(applyFileChanges(tempDir, files)).resolves.toBeUndefined();
  });

  it("applies independent (non-conflicting) file changes in parallel without error", async () => {
    const tempDir = makeTempDir();
    const files: DiffFile[] = Array.from({ length: 20 }, (_, i) => ({
      path: `pkg-${i}/file.ts`,
      content: `export const n = ${i};`,
      deleted: false,
    }));

    await applyFileChanges(tempDir, files);

    for (let i = 0; i < 20; i++) {
      expect(
        fs.readFileSync(path.join(tempDir, `pkg-${i}/file.ts`), "utf-8"),
      ).toBe(`export const n = ${i};`);
    }
  });

  // Regression: ENG-1667 review finding — Promise.all gave no ordering
  // guarantee between operations on conflicting paths, so replacing a file
  // with a directory of the same name (or vice versa) could race
  // mkdir/writeFile against rm and throw EEXIST/EISDIR/ENOTDIR.
  describe("path-conflict ordering (ENG-1667 regression)", () => {
    it("file -> dir: deleting a file while adding a file under a directory of the same name", async () => {
      const tempDir = makeTempDir();
      // Pre-existing tracked file at "foo"
      fs.writeFileSync(path.join(tempDir, "foo"), "old file content");

      const files: DiffFile[] = [
        { path: "foo", content: "", deleted: true },
        { path: "foo/bar.ts", content: "export const bar = 1;", deleted: false },
      ];

      await applyFileChanges(tempDir, files);

      expect(fs.existsSync(path.join(tempDir, "foo"))).toBe(true);
      expect(fs.statSync(path.join(tempDir, "foo")).isDirectory()).toBe(true);
      expect(
        fs.readFileSync(path.join(tempDir, "foo/bar.ts"), "utf-8"),
      ).toBe("export const bar = 1;");
    });

    it("dir -> file: deleting all files under a directory while adding a file at the directory's path", async () => {
      const tempDir = makeTempDir();
      // Pre-existing tracked directory "foo/" containing a file
      fs.mkdirSync(path.join(tempDir, "foo"), { recursive: true });
      fs.writeFileSync(path.join(tempDir, "foo/bar.ts"), "export const bar = 1;");

      const files: DiffFile[] = [
        { path: "foo/bar.ts", content: "", deleted: true },
        { path: "foo", content: "export const foo = 2;", deleted: false },
      ];

      await applyFileChanges(tempDir, files);

      expect(fs.statSync(path.join(tempDir, "foo")).isFile()).toBe(true);
      expect(fs.readFileSync(path.join(tempDir, "foo"), "utf-8")).toBe(
        "export const foo = 2;",
      );
    });

    it("orders deletes before creates within a conflicting group regardless of input order", async () => {
      const tempDir = makeTempDir();
      fs.writeFileSync(path.join(tempDir, "shared"), "old file content");

      // create listed before delete in the input array
      const files: DiffFile[] = [
        {
          path: "shared/child.ts",
          content: "export const child = true;",
          deleted: false,
        },
        { path: "shared", content: "", deleted: true },
      ];

      await applyFileChanges(tempDir, files);

      expect(fs.statSync(path.join(tempDir, "shared")).isDirectory()).toBe(
        true,
      );
      expect(
        fs.readFileSync(path.join(tempDir, "shared/child.ts"), "utf-8"),
      ).toBe("export const child = true;");
    });

    it("does not serialize unrelated path groups (independent paths remain unaffected by a conflicting group)", async () => {
      const tempDir = makeTempDir();
      fs.writeFileSync(path.join(tempDir, "conflict"), "old");

      const files: DiffFile[] = [
        { path: "conflict", content: "", deleted: true },
        {
          path: "conflict/child.ts",
          content: "export const child = 1;",
          deleted: false,
        },
        { path: "independent/a.ts", content: "export const a = 1;", deleted: false },
        { path: "independent/b.ts", content: "export const b = 2;", deleted: false },
      ];

      await applyFileChanges(tempDir, files);

      expect(fs.statSync(path.join(tempDir, "conflict")).isDirectory()).toBe(
        true,
      );
      expect(
        fs.readFileSync(path.join(tempDir, "conflict/child.ts"), "utf-8"),
      ).toBe("export const child = 1;");
      expect(
        fs.readFileSync(path.join(tempDir, "independent/a.ts"), "utf-8"),
      ).toBe("export const a = 1;");
      expect(
        fs.readFileSync(path.join(tempDir, "independent/b.ts"), "utf-8"),
      ).toBe("export const b = 2;");
    });
  });
});
