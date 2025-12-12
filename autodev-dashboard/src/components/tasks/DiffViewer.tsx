import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDiffViewer from "react-diff-viewer";

type ParsedDiffFile = {
  /** Full file path (usually from the +++ line). */
  path: string;
  /** The exact unified diff chunk for this file. */
  rawDiff: string;
};

type DiffViewerProps = {
  diff: string;
  title?: string;
  className?: string;
};

function getBasename(filePath: string) {
  if (!filePath) return "(unknown)";
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? filePath;
}

function parseFilePathFromChunk(chunk: string): string {
  // Prefer the b/<path> from the +++ line.
  const plusPlusPlus = chunk.match(/^\+\+\+\s+(?:b\/)?(.+)$/m);
  if (plusPlusPlus?.[1]) {
    const p = plusPlusPlus[1].trim();
    if (p !== "/dev/null") return p;
  }

  // Fallback to a/<path> from the --- line.
  const minusMinusMinus = chunk.match(/^---\s+(?:a\/)?(.+)$/m);
  if (minusMinusMinus?.[1]) {
    const p = minusMinusMinus[1].trim();
    if (p !== "/dev/null") return p;
  }

  // Fallback to diff --git a/<path> b/<path>.
  const diffGit = chunk.match(/^diff\s+--git\s+a\/(.+?)\s+b\/(.+)$/m);
  if (diffGit?.[2]) return diffGit[2].trim();

  return "";
}

function parseUnifiedDiff(diff: string): ParsedDiffFile[] {
  const trimmed = diff.trim();
  if (!trimmed) return [];

  // Most git diffs include `diff --git ...` per file.
  if (/^diff\s+--git\s+/m.test(diff)) {
    const parts = diff.split(/^diff\s+--git\s+/m);
    const files: ParsedDiffFile[] = [];

    for (const part of parts) {
      const chunkBody = part.trimEnd();
      if (!chunkBody.trim()) continue;
      const chunk = `diff --git ${chunkBody}`.trimEnd();
      files.push({
        path: parseFilePathFromChunk(chunk),
        rawDiff: chunk,
      });
    }

    return files;
  }

  // If no `diff --git`, treat it as a single-file unified diff.
  return [
    {
      path: parseFilePathFromChunk(diff),
      rawDiff: diff.trimEnd(),
    },
  ];
}

function ensureGitDiffHeader(rawDiff: string, filePath: string): string {
  // If the chunk already includes the canonical header, keep it as-is.
  if (/^diff\s+--git\s+/m.test(rawDiff)) return rawDiff.trimEnd();

  // If we have a path, add a minimal git-style header.
  if (filePath) {
    const header = `diff --git a/${filePath} b/${filePath}`;
    return `${header}\n${rawDiff.trimEnd()}`.trimEnd();
  }

  return rawDiff.trimEnd();
}

async function copyToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  // Fallback for environments without navigator.clipboard.
  if (typeof document !== "undefined") {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (!ok) throw new Error("Copy command failed");
    return;
  }

  throw new Error("Clipboard API not available");
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function FileCodeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="m10 13-2 2 2 2" />
      <path d="m14 17 2-2-2-2" />
    </svg>
  );
}

export default function DiffViewer({ diff, title, className }: DiffViewerProps) {
  // copiedIndex: -1 = "copy all"; >= 0 = file index
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const files = useMemo(() => parseUnifiedDiff(diff), [diff]);
  const activeFile = files[activeFileIndex];

  useEffect(() => {
    // Reset active tab when the diff changes to avoid out-of-bounds.
    setActiveFileIndex(0);
  }, [files.length]);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    };
  }, []);

  const markCopied = (index: number) => {
    setCopiedIndex(index);
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    copiedTimeoutRef.current = setTimeout(() => {
      setCopiedIndex(null);
    }, 2000);
  };

  const handleCopyAll = async () => {
    try {
      await copyToClipboard(diff);
      markCopied(-1);
    } catch (err) {
      // Keep UI responsive; intentionally minimal surface area.
      // eslint-disable-next-line no-console
      console.error("Failed to copy diff", err);
    }
  };

  const handleCopyFile = async (fileIndex: number) => {
    const file = files[fileIndex];
    if (!file) return;

    const fileDiff = ensureGitDiffHeader(file.rawDiff, file.path);
    try {
      await copyToClipboard(fileDiff);
      markCopied(fileIndex);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to copy file diff", err);
    }
  };

  const showTabs = files.length > 1;

  if (!diff.trim()) {
    return (
      <div className={className}>
        <div className="rounded-md border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">
          No diff to display.
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="overflow-hidden rounded-md border border-slate-800 bg-slate-950">
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-3 py-2">
          <div className="min-w-0">
            {title ? (
              <div className="truncate text-sm font-medium text-slate-200">{title}</div>
            ) : (
              <div className="text-sm font-medium text-slate-200">Diff</div>
            )}
          </div>

          <button
            type="button"
            onClick={handleCopyAll}
            className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
            aria-label="Copy full diff"
          >
            {copiedIndex === -1 ? (
              <>
                <CheckIcon className="h-4 w-4" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <CopyIcon className="h-4 w-4" />
                <span>Copy all</span>
              </>
            )}
          </button>
        </div>

        {showTabs ? (
          <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-800 bg-slate-950 px-1">
            {files.map((file, idx) => {
              const isActive = idx === activeFileIndex;
              return (
                <button
                  key={`${file.path}-${idx}`}
                  type="button"
                  onClick={() => setActiveFileIndex(idx)}
                  className={
                    isActive
                      ? "inline-flex items-center gap-2 border-b-2 border-blue-500 bg-slate-800 px-3 py-2 text-xs font-medium text-white"
                      : "inline-flex items-center gap-2 border-b-2 border-transparent px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-900 hover:text-slate-100"
                  }
                  aria-label={`View diff for ${file.path || "(unknown file)"}`}
                >
                  <FileCodeIcon className="h-4 w-4" />
                  <span className="max-w-[18rem] truncate">{getBasename(file.path)}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-950 px-3 py-2">
          <div className="min-w-0 truncate text-xs text-slate-300">
            {activeFile?.path ? activeFile.path : "(unknown file)"}
          </div>

          <button
            type="button"
            onClick={() => handleCopyFile(activeFileIndex)}
            className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
            aria-label="Copy active file diff"
            disabled={!activeFile}
          >
            {copiedIndex === activeFileIndex ? (
              <>
                <CheckIcon className="h-4 w-4" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <CopyIcon className="h-4 w-4" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        <div className="bg-white">
          <ReactDiffViewer
            oldValue={""}
            newValue={activeFile?.rawDiff ?? diff}
            splitView={false}
            useDarkTheme
            showDiffOnly={false}
          />
        </div>

        {showTabs ? (
          <div className="flex items-center justify-end border-t border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-400">
            File {activeFileIndex + 1} of {files.length}
          </div>
        ) : null}
      </div>
    </div>
  );
}
