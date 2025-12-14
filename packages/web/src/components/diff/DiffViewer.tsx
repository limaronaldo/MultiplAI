/**
 * Diff Viewer with Syntax Highlighting
 * Issue #352
 */

import { useMemo, useState } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { Copy, Check, ChevronDown, ChevronRight, FileCode, Plus, Minus, GitCommit } from "lucide-react";
import clsx from "clsx";

export interface DiffFile {
  filename: string;
  oldFilename?: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: DiffLine[];
}

export interface DiffLine {
  type: "context" | "add" | "delete";
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

interface DiffViewerProps {
  diff: string | DiffFile[];
  filename?: string;
  showLineNumbers?: boolean;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

// Parse unified diff format
function parseDiff(diffText: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = diffText.split("\n");
  let currentFile: DiffFile | null = null;
  let currentHunk: DiffHunk | null = null;
  let oldLineNum = 0;
  let newLineNum = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // New file header
    if (line.startsWith("diff --git") || line.startsWith("--- ") && !currentFile) {
      if (currentFile && currentHunk) {
        currentFile.hunks.push(currentHunk);
      }
      if (currentFile) {
        files.push(currentFile);
      }

      const match = line.match(/diff --git a\/(.*) b\/(.*)/);
      const filename = match ? match[2] : line.replace(/^--- /, "").replace(/^a\//, "");

      currentFile = {
        filename,
        status: "modified",
        additions: 0,
        deletions: 0,
        hunks: [],
      };
      currentHunk = null;
      continue;
    }

    // File status indicators
    if (line.startsWith("new file")) {
      if (currentFile) currentFile.status = "added";
      continue;
    }
    if (line.startsWith("deleted file")) {
      if (currentFile) currentFile.status = "deleted";
      continue;
    }
    if (line.startsWith("rename from")) {
      if (currentFile) {
        currentFile.status = "renamed";
        currentFile.oldFilename = line.replace("rename from ", "");
      }
      continue;
    }

    // Hunk header
    if (line.startsWith("@@")) {
      if (currentHunk && currentFile) {
        currentFile.hunks.push(currentHunk);
      }

      const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@(.*)?/);
      if (match) {
        oldLineNum = parseInt(match[1], 10);
        newLineNum = parseInt(match[3], 10);
        currentHunk = {
          oldStart: oldLineNum,
          oldLines: parseInt(match[2] || "1", 10),
          newStart: newLineNum,
          newLines: parseInt(match[4] || "1", 10),
          header: match[5]?.trim() || "",
          lines: [],
        };
      }
      continue;
    }

    // Skip non-content lines
    if (!currentHunk || line.startsWith("---") || line.startsWith("+++") || line.startsWith("index ")) {
      continue;
    }

    // Content lines
    if (line.startsWith("+")) {
      currentHunk.lines.push({
        type: "add",
        content: line.slice(1),
        newLineNumber: newLineNum++,
      });
      if (currentFile) currentFile.additions++;
    } else if (line.startsWith("-")) {
      currentHunk.lines.push({
        type: "delete",
        content: line.slice(1),
        oldLineNumber: oldLineNum++,
      });
      if (currentFile) currentFile.deletions++;
    } else if (line.startsWith(" ") || line === "") {
      currentHunk.lines.push({
        type: "context",
        content: line.slice(1) || "",
        oldLineNumber: oldLineNum++,
        newLineNumber: newLineNum++,
      });
    }
  }

  // Add final hunk and file
  if (currentHunk && currentFile) {
    currentFile.hunks.push(currentHunk);
  }
  if (currentFile) {
    files.push(currentFile);
  }

  return files;
}

// Simple syntax highlighting for common patterns
function highlightSyntax(content: string, isDark: boolean): React.ReactNode {
  const patterns = [
    // Strings
    { regex: /(["'`])(?:(?!\1)[^\\]|\\.)*\1/g, className: isDark ? "text-green-400" : "text-green-600" },
    // Comments
    { regex: /(\/\/.*$|\/\*[\s\S]*?\*\/|#.*$)/gm, className: isDark ? "text-gray-500" : "text-gray-400" },
    // Keywords
    { regex: /\b(const|let|var|function|async|await|return|if|else|for|while|class|interface|type|export|import|from|extends|implements)\b/g, className: isDark ? "text-purple-400" : "text-purple-600" },
    // Numbers
    { regex: /\b(\d+\.?\d*)\b/g, className: isDark ? "text-orange-400" : "text-orange-600" },
    // Booleans/null
    { regex: /\b(true|false|null|undefined)\b/g, className: isDark ? "text-blue-400" : "text-blue-600" },
  ];

  let result = content;
  let highlighted = false;

  // Simple approach: just colorize keywords inline
  // For production, use a proper syntax highlighter like Prism.js
  patterns.forEach(({ regex, className }) => {
    result = result.replace(regex, (match) => `<span class="${className}">${match}</span>`);
    if (regex.test(content)) highlighted = true;
  });

  if (highlighted) {
    return <span dangerouslySetInnerHTML={{ __html: result }} />;
  }

  return content;
}

function DiffFileView({ file, showLineNumbers, collapsible, defaultExpanded }: {
  file: DiffFile;
  showLineNumbers: boolean;
  collapsible: boolean;
  defaultExpanded: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  const statusColors = {
    added: { bg: "bg-green-500/10", text: "text-green-500", icon: Plus },
    modified: { bg: "bg-blue-500/10", text: "text-blue-500", icon: FileCode },
    deleted: { bg: "bg-red-500/10", text: "text-red-500", icon: Minus },
    renamed: { bg: "bg-yellow-500/10", text: "text-yellow-500", icon: GitCommit },
  };

  const status = statusColors[file.status];
  const StatusIcon = status.icon;

  const copyDiff = async () => {
    const diffText = file.hunks
      .flatMap((h) => [
        `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`,
        ...h.lines.map((l) => {
          const prefix = l.type === "add" ? "+" : l.type === "delete" ? "-" : " ";
          return prefix + l.content;
        }),
      ])
      .join("\n");

    await navigator.clipboard.writeText(diffText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={clsx("rounded-lg border overflow-hidden", isDark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200")}>
      {/* File header */}
      <div
        className={clsx(
          "flex items-center justify-between px-4 py-2 border-b",
          isDark ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200",
          collapsible && "cursor-pointer"
        )}
        onClick={() => collapsible && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {collapsible && (
            expanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
          <StatusIcon className={clsx("w-4 h-4", status.text)} />
          <span className={clsx("font-mono text-sm", isDark ? "text-white" : "text-gray-900")}>
            {file.oldFilename ? `${file.oldFilename} → ${file.filename}` : file.filename}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            {file.additions > 0 && (
              <span className="text-green-500">+{file.additions}</span>
            )}
            {file.deletions > 0 && (
              <span className="text-red-500">-{file.deletions}</span>
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              copyDiff();
            }}
            className={clsx("p-1.5 rounded transition-colors", isDark ? "hover:bg-gray-700" : "hover:bg-gray-200")}
            title="Copy diff"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-500" />}
          </button>
        </div>
      </div>

      {/* Diff content */}
      {(!collapsible || expanded) && (
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-sm">
            <tbody>
              {file.hunks.map((hunk, hunkIndex) => (
                <React.Fragment key={hunkIndex}>
                  {/* Hunk header */}
                  <tr className={isDark ? "bg-blue-900/20" : "bg-blue-50"}>
                    <td
                      colSpan={showLineNumbers ? 3 : 1}
                      className={clsx("px-4 py-1 text-xs", isDark ? "text-blue-400" : "text-blue-600")}
                    >
                      @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@ {hunk.header}
                    </td>
                  </tr>
                  {/* Lines */}
                  {hunk.lines.map((line, lineIndex) => {
                    const bgColor = line.type === "add"
                      ? isDark ? "bg-green-900/20" : "bg-green-50"
                      : line.type === "delete"
                      ? isDark ? "bg-red-900/20" : "bg-red-50"
                      : "";
                    const lineNumColor = isDark ? "text-gray-600" : "text-gray-400";

                    return (
                      <tr key={lineIndex} className={bgColor}>
                        {showLineNumbers && (
                          <>
                            <td className={clsx("px-2 py-0 text-right select-none w-12", lineNumColor)}>
                              {line.oldLineNumber || ""}
                            </td>
                            <td className={clsx("px-2 py-0 text-right select-none w-12 border-r", lineNumColor, isDark ? "border-gray-700" : "border-gray-200")}>
                              {line.newLineNumber || ""}
                            </td>
                          </>
                        )}
                        <td className="px-4 py-0 whitespace-pre">
                          <span className={clsx(
                            "select-none inline-block w-4",
                            line.type === "add" ? "text-green-500" : line.type === "delete" ? "text-red-500" : "text-gray-500"
                          )}>
                            {line.type === "add" ? "+" : line.type === "delete" ? "-" : " "}
                          </span>
                          <span className={isDark ? "text-gray-300" : "text-gray-700"}>
                            {highlightSyntax(line.content, isDark)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Need to import React for Fragment
import React from "react";

export function DiffViewer({
  diff,
  filename,
  showLineNumbers = true,
  collapsible = true,
  defaultExpanded = true,
}: DiffViewerProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const files = useMemo(() => {
    if (typeof diff === "string") {
      const parsed = parseDiff(diff);
      // If filename provided and only one file parsed, use that filename
      if (filename && parsed.length === 1) {
        parsed[0].filename = filename;
      }
      return parsed;
    }
    return diff;
  }, [diff, filename]);

  const stats = useMemo(() => {
    return files.reduce(
      (acc, file) => ({
        additions: acc.additions + file.additions,
        deletions: acc.deletions + file.deletions,
        files: acc.files + 1,
      }),
      { additions: 0, deletions: 0, files: 0 }
    );
  }, [files]);

  if (files.length === 0) {
    return (
      <div className={clsx("rounded-lg border p-8 text-center", isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200")}>
        <FileCode className={clsx("w-12 h-12 mx-auto mb-3", isDark ? "text-gray-600" : "text-gray-400")} />
        <p className={isDark ? "text-gray-400" : "text-gray-500"}>No diff available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className={clsx("flex items-center justify-between px-4 py-2 rounded-lg", isDark ? "bg-gray-800" : "bg-gray-100")}>
        <span className={clsx("text-sm", isDark ? "text-gray-300" : "text-gray-600")}>
          {stats.files} file{stats.files !== 1 ? "s" : ""} changed
        </span>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-green-500">+{stats.additions}</span>
          <span className="text-red-500">-{stats.deletions}</span>
        </div>
      </div>

      {/* File diffs */}
      <div className="space-y-4">
        {files.map((file, index) => (
          <DiffFileView
            key={index}
            file={file}
            showLineNumbers={showLineNumbers}
            collapsible={collapsible}
            defaultExpanded={defaultExpanded}
          />
        ))}
      </div>
    </div>
  );
}
