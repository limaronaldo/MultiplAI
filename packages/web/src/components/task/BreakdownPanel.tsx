import { useState } from "react";
import {
  Scissors,
  GitBranch,
  CheckCircle,
  AlertTriangle,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  FileCode,
  ArrowRight,
} from "lucide-react";
import clsx from "clsx";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface SubIssue {
  id: string;
  title: string;
  description: string;
  targetFiles: string[];
  dependsOn: string[];
  acceptanceCriteria: string[];
  complexity: "XS" | "S";
}

interface BreakdownResult {
  subIssues: SubIssue[];
  executionOrder: string[];
  parallelGroups?: string[][];
  reasoning: string;
}

interface CreatedIssue {
  number: number;
  title: string;
  url: string;
}

interface BreakdownPanelProps {
  taskId: string;
  taskTitle: string;
  taskError?: string;
  repo: string;
  issueNumber: number;
  onComplete?: () => void;
}

export function BreakdownPanel({
  taskId,
  taskTitle,
  taskError,
  repo,
  issueNumber,
  onComplete,
}: BreakdownPanelProps) {
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [breakdown, setBreakdown] = useState<BreakdownResult | null>(null);
  const [createdIssues, setCreatedIssues] = useState<CreatedIssue[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);
  const [closeParent, setCloseParent] = useState(true);

  const isXLError = taskError?.includes("COMPLEXITY_TOO_HIGH") || taskError?.includes("XL");

  const handleBreakdown = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}/breakdown`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to break down task");
      }

      setBreakdown(data.breakdown);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateIssues = async () => {
    if (!breakdown) return;

    setCreating(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}/breakdown/create-issues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subIssues: breakdown.subIssues,
          closeParent,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create issues");
      }

      setCreatedIssues(data.createdIssues);
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setCreating(false);
    }
  };

  // Show success state after issues are created
  if (createdIssues) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-emerald-500/20">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-emerald-400">
              Issues Created Successfully
            </h3>
            <p className="text-sm text-slate-400">
              {createdIssues.length} smaller issues have been created
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {createdIssues.map((issue) => (
            <a
              key={issue.number}
              href={issue.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors group"
            >
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-slate-400" />
                <span className="text-white font-medium">#{issue.number}</span>
                <span className="text-slate-300">{issue.title}</span>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-blue-400" />
            </a>
          ))}
        </div>

        {closeParent && (
          <p className="mt-4 text-sm text-slate-500">
            The original issue #{issueNumber} has been closed.
          </p>
        )}
      </div>
    );
  }

  // Show breakdown results with option to create issues
  if (breakdown) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Scissors className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                Suggested Breakdown
              </h3>
              <p className="text-sm text-slate-400">
                {breakdown.subIssues.length} smaller issues
              </p>
            </div>
          </div>
        </div>

        {/* Reasoning */}
        <div className="mb-4 p-3 rounded-lg bg-slate-800/50 text-sm text-slate-300">
          <p className="font-medium text-slate-400 mb-1">Strategy:</p>
          {breakdown.reasoning}
        </div>

        {/* Execution Order */}
        <div className="mb-4 flex items-center gap-2 flex-wrap text-xs">
          <span className="text-slate-500">Order:</span>
          {breakdown.executionOrder.map((id, i) => (
            <span key={id} className="flex items-center gap-1">
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                {breakdown.subIssues.find((s) => s.id === id)?.title.slice(0, 30) || id}
              </span>
              {i < breakdown.executionOrder.length - 1 && (
                <ArrowRight className="w-3 h-3 text-slate-600" />
              )}
            </span>
          ))}
        </div>

        {/* Sub-issues */}
        <div className="space-y-2 mb-4">
          {breakdown.subIssues.map((issue) => (
            <div
              key={issue.id}
              className="border border-slate-700 rounded-lg overflow-hidden"
            >
              <button
                onClick={() => setExpandedIssue(expandedIssue === issue.id ? null : issue.id)}
                className="w-full flex items-center justify-between p-3 hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {expandedIssue === issue.id ? (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  )}
                  <span
                    className={clsx(
                      "px-1.5 py-0.5 rounded text-xs font-medium",
                      issue.complexity === "XS"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-blue-500/20 text-blue-400"
                    )}
                  >
                    {issue.complexity}
                  </span>
                  <span className="text-white font-medium">{issue.title}</span>
                </div>
                <span className="text-xs text-slate-500">
                  {issue.targetFiles.length} files
                </span>
              </button>

              {expandedIssue === issue.id && (
                <div className="p-3 pt-0 border-t border-slate-700 space-y-3">
                  <p className="text-sm text-slate-300">{issue.description}</p>

                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">Target Files:</p>
                    <div className="flex flex-wrap gap-1">
                      {issue.targetFiles.map((file) => (
                        <span
                          key={file}
                          className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 text-xs text-slate-300 font-mono"
                        >
                          <FileCode className="w-3 h-3" />
                          {file}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">Acceptance Criteria:</p>
                    <ul className="space-y-1">
                      {issue.acceptanceCriteria.map((criteria, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                          <CheckCircle className="w-3 h-3 text-slate-500 mt-0.5 flex-shrink-0" />
                          {criteria}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {issue.dependsOn.length > 0 && (
                    <p className="text-xs text-amber-400">
                      Depends on: {issue.dependsOn.join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Options */}
        <div className="flex items-center gap-3 mb-4">
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={closeParent}
              onChange={(e) => setCloseParent(e.target.checked)}
              className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
            />
            Close original issue after creating sub-issues
          </label>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleCreateIssues}
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {creating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <GitBranch className="w-4 h-4" />
            )}
            Create {breakdown.subIssues.length} Issues on GitHub
          </button>
          <button
            onClick={() => setBreakdown(null)}
            className="px-4 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Initial state - show breakdown button
  if (!isXLError) {
    return null; // Don't show if not an XL error
  }

  return (
    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 rounded-lg bg-amber-500/20">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-amber-400">
            Issue Too Complex
          </h3>
          <p className="text-sm text-slate-300 mt-1">
            This issue is rated <span className="font-semibold text-amber-400">XL complexity</span> and
            is too large for automatic processing. Would you like to break it down into smaller,
            manageable issues?
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      <button
        onClick={handleBreakdown}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Analyzing...
          </>
        ) : (
          <>
            <Scissors className="w-4 h-4" />
            Break Down into Smaller Issues
          </>
        )}
      </button>

      <p className="mt-3 text-xs text-slate-500">
        AutoDev will analyze the issue and suggest smaller XS/S complexity issues that can be
        processed automatically.
      </p>
    </div>
  );
}
