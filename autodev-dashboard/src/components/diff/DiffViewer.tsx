import React, { useState } from "react";
import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued";
import { Copy, Check, FileCode, ChevronDown, ChevronRight } from "lucide-react";

interface DiffViewerProps {
  diff: string;
  title?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

// Parse unified diff into file sections
interface FileDiff {
  filename: string;
  oldContent: string;
  newContent: string;
}

function parseUnifiedDiff(diff: string): FileDiff[] {
  const files: FileDiff[] = [];
  const lines = diff.split("\n");

  let currentFile: FileDiff | null = null;
  let inHeader = false;
  let oldLines: string[] = [];
  let newLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("--- ")) {
      // Save previous file if exists
      if (currentFile) {
        currentFile.oldContent = oldLines.join("\n");
        currentFile.newContent = newLines.join("\n");
        files.push(currentFile);
      }
      // Start new file
      const filename = line.replace("--- a/", "").replace("--- ", "");
      currentFile = { filename, oldContent: "", newContent: "" };
      oldLines = [];
      newLines = [];
      inHeader = true;
    } else if (line.startsWith("+++ ")) {
      // Update filename from +++ line if more accurate
      if (currentFile) {
        const newFilename = line.replace("+++ b/", "").replace("+++ ", "");
        if (newFilename !== "/dev/null") {
          currentFile.filename = newFilename;
        }
      }
      inHeader = false;
    } else if (line.startsWith("@@")) {
      // Hunk header - skip
      continue;
    } else if (!inHeader && currentFile) {
      if (line.startsWith("+")) {
        newLines.push(line.slice(1));
      } else if (line.startsWith("-")) {
        oldLines.push(line.slice(1));
      } else if (line.startsWith(" ")) {
        // Context line
        oldLines.push(line.slice(1));
        newLines.push(line.slice(1));
      }
    }
  }

  // Save last file
  if (currentFile) {
    currentFile.oldContent = oldLines.join("\n");
    currentFile.newContent = newLines.join("\n");
    files.push(currentFile);
  }

  return files;
}

// Dark theme styles for diff viewer
const darkStyles = {
  variables: {
    dark: {
      diffViewerBackground: "#1e293b",
      diffViewerColor: "#e2e8f0",
      addedBackground: "#064e3b33",
      addedColor: "#6ee7b7",
      removedBackground: "#7f1d1d33",
      removedColor: "#fca5a5",
      wordAddedBackground: "#065f4633",
      wordRemovedBackground: "#991b1b33",
      addedGutterBackground: "#064e3b55",
      removedGutterBackground: "#7f1d1d55",
      gutterBackground: "#0f172a",
      gutterBackgroundDark: "#0f172a",
      highlightBackground: "#334155",
      highlightGutterBackground: "#334155",
      codeFoldGutterBackground: "#1e293b",
      codeFoldBackground: "#1e293b",
      emptyLineBackground: "#1e293b",
      codeFoldContentColor: "#94a3b8",
    },
  },
  line: {
    padding: "4px 8px",
    fontSize: "13px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
  gutter: {
    padding: "4px 8px",
    fontSize: "12px",
    minWidth: "40px",
  },
  contentText: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
};

function FileDiffSection({ file, defaultExpanded = true }: { file: FileDiff; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-750 text-left"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400" />
        )}
        <FileCode className="w-4 h-4 text-slate-400" />
        <span className="text-sm font-mono text-slate-200">{file.filename}</span>
      </button>

      {expanded && (
        <ReactDiffViewer
          oldValue={file.oldContent}
          newValue={file.newContent}
          splitView={false}
          useDarkTheme={true}
          compareMethod={DiffMethod.WORDS}
          styles={darkStyles}
          hideLineNumbers={false}
        />
      )}
    </div>
  );
}

export function DiffViewer({ diff, title, collapsible = false, defaultExpanded = true }: DiffViewerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  if (!diff) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 text-center">
        <p className="text-slate-400 text-sm">No diff available</p>
      </div>
    );
  }

  const files = parseUnifiedDiff(diff);

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(diff);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-2">
          {collapsible && (
            <button onClick={() => setExpanded(!expanded)} className="p-1 hover:bg-slate-700 rounded">
              {expanded ? (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400" />
              )}
            </button>
          )}
          <h3 className="text-sm font-medium text-slate-200">
            {title || `Changes (${files.length} file${files.length !== 1 ? "s" : ""})`}
          </h3>
        </div>

        <button
          onClick={copyToClipboard}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-green-400" />
              Copied
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              Copy
            </>
          )}
        </button>
      </div>

      {/* Content */}
      {(!collapsible || expanded) && (
        <div className="p-4 space-y-4">
          {files.length > 0 ? (
            files.map((file, index) => (
              <FileDiffSection key={`${file.filename}-${index}`} file={file} />
            ))
          ) : (
            // Fallback: show raw diff
            <pre className="text-sm font-mono text-slate-300 whitespace-pre-wrap overflow-x-auto p-4 bg-slate-900 rounded">
              {diff}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export default DiffViewer;
