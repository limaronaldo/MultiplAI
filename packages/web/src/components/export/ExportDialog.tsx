/**
 * Export Functionality for Reports
 * Issue #355
 */

import { useState } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { Download, FileText, FileJson, Table, X, Loader2, CheckCircle } from "lucide-react";
import clsx from "clsx";
import { format } from "date-fns";

export type ExportFormat = "csv" | "json" | "pdf";
export type ExportDataType = "tasks" | "jobs" | "costs" | "stats";

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  dataType: ExportDataType;
  data?: unknown[];
  filters?: Record<string, unknown>;
}

interface ExportOptions {
  format: ExportFormat;
  includeHeaders: boolean;
  dateRange?: { start: Date; end: Date };
  fields?: string[];
}

const FORMAT_OPTIONS: { value: ExportFormat; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "csv", label: "CSV (Excel compatible)", icon: Table },
  { value: "json", label: "JSON (Raw data)", icon: FileJson },
  { value: "pdf", label: "PDF (Report)", icon: FileText },
];

const DATA_TYPE_LABELS: Record<ExportDataType, string> = {
  tasks: "Tasks",
  jobs: "Jobs",
  costs: "Cost Report",
  stats: "Statistics",
};

const FIELD_OPTIONS: Record<ExportDataType, { value: string; label: string }[]> = {
  tasks: [
    { value: "id", label: "Task ID" },
    { value: "status", label: "Status" },
    { value: "githubIssueTitle", label: "Title" },
    { value: "githubRepo", label: "Repository" },
    { value: "estimatedComplexity", label: "Complexity" },
    { value: "attemptCount", label: "Attempts" },
    { value: "createdAt", label: "Created At" },
    { value: "updatedAt", label: "Updated At" },
    { value: "prUrl", label: "PR URL" },
    { value: "lastError", label: "Last Error" },
  ],
  jobs: [
    { value: "id", label: "Job ID" },
    { value: "name", label: "Name" },
    { value: "status", label: "Status" },
    { value: "totalTasks", label: "Total Tasks" },
    { value: "completedTasks", label: "Completed" },
    { value: "failedTasks", label: "Failed" },
    { value: "createdAt", label: "Created At" },
  ],
  costs: [
    { value: "date", label: "Date" },
    { value: "model", label: "Model" },
    { value: "agent", label: "Agent" },
    { value: "tokens", label: "Tokens" },
    { value: "cost", label: "Cost" },
    { value: "calls", label: "Calls" },
  ],
  stats: [
    { value: "date", label: "Date" },
    { value: "total", label: "Total Tasks" },
    { value: "completed", label: "Completed" },
    { value: "failed", label: "Failed" },
    { value: "successRate", label: "Success Rate" },
  ],
};

function generateCSV(data: unknown[], fields: string[], includeHeaders: boolean): string {
  const rows: string[] = [];

  if (includeHeaders) {
    rows.push(fields.join(","));
  }

  for (const item of data) {
    const row = fields.map((field) => {
      const value = (item as Record<string, unknown>)[field];
      if (value === null || value === undefined) return "";
      if (typeof value === "string") {
        // Escape quotes and wrap in quotes if contains comma or quote
        if (value.includes(",") || value.includes('"') || value.includes("\n")) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }
      if (value instanceof Date) {
        return format(value, "yyyy-MM-dd HH:mm:ss");
      }
      return String(value);
    });
    rows.push(row.join(","));
  }

  return rows.join("\n");
}

function generateJSON(data: unknown[], fields: string[]): string {
  const filtered = data.map((item) => {
    const obj: Record<string, unknown> = {};
    for (const field of fields) {
      obj[field] = (item as Record<string, unknown>)[field];
    }
    return obj;
  });
  return JSON.stringify(filtered, null, 2);
}

function generatePDFContent(data: unknown[], fields: string[], dataType: ExportDataType): string {
  // Generate HTML that can be printed as PDF
  const title = DATA_TYPE_LABELS[dataType];
  const date = format(new Date(), "MMMM d, yyyy 'at' HH:mm");

  const tableRows = data
    .map((item) => {
      const cells = fields
        .map((field) => {
          const value = (item as Record<string, unknown>)[field];
          return `<td style="border: 1px solid #ddd; padding: 8px;">${value ?? ""}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  const headerCells = fields.map((f) => `<th style="border: 1px solid #ddd; padding: 8px; background: #f4f4f4;">${f}</th>`).join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <title>${title} Export</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    h1 { color: #333; }
    .meta { color: #666; margin-bottom: 20px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: left; }
  </style>
</head>
<body>
  <h1>${title} Export</h1>
  <p class="meta">Generated on ${date}</p>
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
</body>
</html>`;
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ExportDialog({ isOpen, onClose, dataType, data = [], filters }: ExportDialogProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [options, setOptions] = useState<ExportOptions>({
    format: "csv",
    includeHeaders: true,
    fields: FIELD_OPTIONS[dataType].map((f) => f.value),
  });
  const [exporting, setExporting] = useState(false);
  const [success, setSuccess] = useState(false);

  const availableFields = FIELD_OPTIONS[dataType];

  const toggleField = (field: string) => {
    setOptions((prev) => ({
      ...prev,
      fields: prev.fields?.includes(field)
        ? prev.fields.filter((f) => f !== field)
        : [...(prev.fields || []), field],
    }));
  };

  const handleExport = async () => {
    if (!options.fields?.length) return;

    setExporting(true);
    setSuccess(false);

    try {
      // Simulate async export for large datasets
      await new Promise((resolve) => setTimeout(resolve, 500));

      const timestamp = format(new Date(), "yyyy-MM-dd-HHmm");
      const filename = `autodev-${dataType}-${timestamp}`;

      switch (options.format) {
        case "csv": {
          const content = generateCSV(data, options.fields, options.includeHeaders);
          downloadFile(content, `${filename}.csv`, "text/csv");
          break;
        }
        case "json": {
          const content = generateJSON(data, options.fields);
          downloadFile(content, `${filename}.json`, "application/json");
          break;
        }
        case "pdf": {
          const content = generatePDFContent(data, options.fields, dataType);
          // Open in new window for print
          const printWindow = window.open("", "_blank");
          if (printWindow) {
            printWindow.document.write(content);
            printWindow.document.close();
            printWindow.print();
          }
          break;
        }
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1500);
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Dialog */}
      <div
        className={clsx(
          "relative w-full max-w-lg rounded-lg border shadow-xl",
          isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
        )}
      >
        {/* Header */}
        <div className={clsx("flex items-center justify-between px-6 py-4 border-b", isDark ? "border-gray-700" : "border-gray-200")}>
          <div className="flex items-center gap-3">
            <Download className={clsx("w-5 h-5", isDark ? "text-blue-400" : "text-blue-500")} />
            <h2 className={clsx("text-lg font-semibold", isDark ? "text-white" : "text-gray-900")}>
              Export {DATA_TYPE_LABELS[dataType]}
            </h2>
          </div>
          <button onClick={onClose} className={clsx("p-2 rounded-lg transition-colors", isDark ? "hover:bg-gray-700" : "hover:bg-gray-100")}>
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-6">
          {/* Format selection */}
          <div>
            <label className={clsx("block text-sm font-medium mb-2", isDark ? "text-gray-200" : "text-gray-700")}>
              Export Format
            </label>
            <div className="grid grid-cols-3 gap-2">
              {FORMAT_OPTIONS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setOptions((prev) => ({ ...prev, format: value }))}
                  className={clsx(
                    "flex flex-col items-center gap-2 p-3 rounded-lg border transition-all",
                    options.format === value
                      ? "border-blue-500 bg-blue-500/10"
                      : isDark
                      ? "border-gray-700 hover:border-gray-600"
                      : "border-gray-200 hover:border-gray-300"
                  )}
                >
                  <Icon className={clsx("w-6 h-6", options.format === value ? "text-blue-500" : "text-gray-500")} />
                  <span className={clsx("text-xs", options.format === value ? "text-blue-500" : isDark ? "text-gray-400" : "text-gray-600")}>
                    {value.toUpperCase()}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Fields selection */}
          <div>
            <label className={clsx("block text-sm font-medium mb-2", isDark ? "text-gray-200" : "text-gray-700")}>
              Fields to Export
            </label>
            <div className="flex flex-wrap gap-2">
              {availableFields.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => toggleField(value)}
                  className={clsx(
                    "px-3 py-1.5 rounded-full text-sm transition-all",
                    options.fields?.includes(value)
                      ? "bg-blue-500 text-white"
                      : isDark
                      ? "bg-gray-700 text-gray-400 hover:bg-gray-600"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Options */}
          {options.format === "csv" && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={options.includeHeaders}
                onChange={(e) => setOptions((prev) => ({ ...prev, includeHeaders: e.target.checked }))}
                className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
              />
              <span className={clsx("text-sm", isDark ? "text-gray-300" : "text-gray-600")}>Include column headers</span>
            </label>
          )}

          {/* Summary */}
          <div className={clsx("p-3 rounded-lg", isDark ? "bg-gray-900" : "bg-gray-50")}>
            <p className={clsx("text-sm", isDark ? "text-gray-400" : "text-gray-600")}>
              Exporting <span className="font-medium">{data.length}</span> {dataType} with{" "}
              <span className="font-medium">{options.fields?.length || 0}</span> fields
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className={clsx("flex items-center justify-end gap-3 px-6 py-4 border-t", isDark ? "border-gray-700" : "border-gray-200")}>
          <button
            onClick={onClose}
            className={clsx(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              isDark ? "text-gray-400 hover:bg-gray-700" : "text-gray-600 hover:bg-gray-100"
            )}
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || !options.fields?.length}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              exporting || !options.fields?.length
                ? "bg-gray-400 cursor-not-allowed"
                : success
                ? "bg-green-500 hover:bg-green-600"
                : "bg-blue-500 hover:bg-blue-600",
              "text-white"
            )}
          >
            {exporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Exporting...
              </>
            ) : success ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Exported!
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Hook for using export functionality
export function useExport() {
  const [exportState, setExportState] = useState<{
    isOpen: boolean;
    dataType: ExportDataType;
    data: unknown[];
  }>({
    isOpen: false,
    dataType: "tasks",
    data: [],
  });

  const openExport = (dataType: ExportDataType, data: unknown[]) => {
    setExportState({ isOpen: true, dataType, data });
  };

  const closeExport = () => {
    setExportState((prev) => ({ ...prev, isOpen: false }));
  };

  return {
    ...exportState,
    openExport,
    closeExport,
  };
}
