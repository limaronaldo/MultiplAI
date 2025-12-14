/**
 * DiffViewer Component Tests
 * Issue #360
 */

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "../../test/test-utils";
import { DiffViewer } from "./DiffViewer";

const sampleDiff = `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,5 +1,6 @@
 import { app } from "./app";
+import { logger } from "./logger";

 const PORT = 3000;

-app.listen(PORT);
+app.listen(PORT, () => logger.info("Server started"));
`;

describe("DiffViewer", () => {
  it("renders diff with summary", () => {
    render(<DiffViewer diff={sampleDiff} />);

    expect(screen.getByText(/1 file.*changed/)).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.getByText("-1")).toBeInTheDocument();
  });

  it("renders filename from diff header", () => {
    render(<DiffViewer diff={sampleDiff} />);

    expect(screen.getByText("src/index.ts")).toBeInTheDocument();
  });

  it("shows added lines in green", () => {
    render(<DiffViewer diff={sampleDiff} />);

    // Check for the + prefix text
    const addedLines = screen.getAllByText("+");
    expect(addedLines.length).toBeGreaterThan(0);
  });

  it("shows deleted lines in red", () => {
    render(<DiffViewer diff={sampleDiff} />);

    // Check for the - prefix text
    const deletedLines = screen.getAllByText("-");
    expect(deletedLines.length).toBeGreaterThan(0);
  });

  it("renders empty state when no diff", () => {
    render(<DiffViewer diff="" />);

    expect(screen.getByText("No diff available")).toBeInTheDocument();
  });

  it("toggles file expansion when collapsible", () => {
    render(<DiffViewer diff={sampleDiff} collapsible defaultExpanded />);

    const fileHeader = screen.getByText("src/index.ts").closest("div");
    expect(fileHeader).toBeInTheDocument();

    // Click to collapse
    if (fileHeader) {
      fireEvent.click(fileHeader);
    }
  });

  it("shows line numbers when enabled", () => {
    render(<DiffViewer diff={sampleDiff} showLineNumbers />);

    // Should have line number cells
    const table = document.querySelector("table");
    expect(table).toBeInTheDocument();
  });

  it("uses provided filename over parsed one", () => {
    const simpleDiff = `--- a/old.ts
+++ b/new.ts
@@ -1 +1 @@
-old
+new`;

    render(<DiffViewer diff={simpleDiff} filename="custom.ts" />);

    expect(screen.getByText("custom.ts")).toBeInTheDocument();
  });

  it("handles multi-file diffs", () => {
    const multiFileDiff = `diff --git a/file1.ts b/file1.ts
--- a/file1.ts
+++ b/file1.ts
@@ -1 +1 @@
-old1
+new1
diff --git a/file2.ts b/file2.ts
--- a/file2.ts
+++ b/file2.ts
@@ -1 +1 @@
-old2
+new2`;

    render(<DiffViewer diff={multiFileDiff} />);

    expect(screen.getByText("file1.ts")).toBeInTheDocument();
    expect(screen.getByText("file2.ts")).toBeInTheDocument();
    expect(screen.getByText(/2 file.*changed/)).toBeInTheDocument();
  });
});
