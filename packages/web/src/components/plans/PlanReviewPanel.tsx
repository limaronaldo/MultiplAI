/**
 * PlanReviewPanel Component
 * Replit-style plan review before coding begins
 *
 * Shows the implementation plan and allows user to:
 * - Approve and start coding
 * - Reject with feedback for replanning
 * - Edit the plan (future feature)
 */

import { useState } from "react";
import {
  FileText,
  CheckCircle,
  XCircle,
  Play,
  Edit3,
  MessageSquare,
  Loader2,
  AlertTriangle,
  Target,
  Clock,
  Zap,
} from "lucide-react";
import clsx from "clsx";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface PlanReviewPanelProps {
  taskId: string;
  taskTitle: string;
  plan: string[];
  definitionOfDone?: string[];
  targetFiles?: string[];
  complexity?: string;
  effort?: string;
  onApproved?: () => void;
  onRejected?: () => void;
}

export function PlanReviewPanel({
  taskId,
  taskTitle,
  plan,
  definitionOfDone = [],
  targetFiles = [],
  complexity,
  effort,
  onApproved,
  onRejected,
}: PlanReviewPanelProps) {
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<"approve" | "reject" | null>(null);
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async () => {
    setLoading(true);
    setAction("approve");
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}/approve-plan`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to approve plan");
      }

      onApproved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve plan");
    } finally {
      setLoading(false);
      setAction(null);
    }
  };

  const handleReject = async () => {
    if (!feedback.trim()) {
      setError("Please provide feedback for the revision");
      return;
    }

    setLoading(true);
    setAction("reject");
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}/reject-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: feedback.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reject plan");
      }

      onRejected?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject plan");
    } finally {
      setLoading(false);
      setAction(null);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-800 bg-gradient-to-r from-blue-500/10 to-purple-500/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <FileText className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Implementation Plan</h3>
              <p className="text-sm text-slate-400 mt-0.5 line-clamp-1">
                {taskTitle}
              </p>
            </div>
          </div>

          {/* Complexity/Effort badges */}
          <div className="flex items-center gap-2">
            {complexity && (
              <span className={clsx(
                "px-2 py-1 text-xs font-medium rounded",
                complexity === "XS" && "bg-emerald-500/20 text-emerald-400",
                complexity === "S" && "bg-blue-500/20 text-blue-400",
                complexity === "M" && "bg-amber-500/20 text-amber-400",
                complexity === "L" && "bg-orange-500/20 text-orange-400",
                complexity === "XL" && "bg-red-500/20 text-red-400"
              )}>
                {complexity}
              </span>
            )}
            {effort && (
              <span className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-800 text-slate-300 rounded">
                <Zap className="w-3 h-3" />
                {effort}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Plan steps */}
      <div className="p-5 space-y-4">
        <div>
          <h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
            <Target className="w-4 h-4 text-slate-400" />
            Implementation Steps
          </h4>
          <ol className="space-y-2">
            {plan.map((step, i) => (
              <li
                key={i}
                className="flex items-start gap-3 text-sm text-slate-300"
              >
                <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-slate-800 text-slate-400 rounded-full text-xs font-medium">
                  {i + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Definition of Done */}
        {definitionOfDone.length > 0 && (
          <div className="pt-4 border-t border-slate-800">
            <h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-slate-400" />
              Definition of Done
            </h4>
            <ul className="space-y-2">
              {definitionOfDone.map((item, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-slate-400"
                >
                  <div className="w-4 h-4 mt-0.5 border border-slate-600 rounded flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Target files */}
        {targetFiles.length > 0 && (
          <div className="pt-4 border-t border-slate-800">
            <h4 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-400" />
              Target Files ({targetFiles.length})
            </h4>
            <div className="flex flex-wrap gap-2">
              {targetFiles.map((file, i) => (
                <span
                  key={i}
                  className="px-2 py-1 text-xs font-mono bg-slate-800 text-slate-400 rounded"
                >
                  {file}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Feedback input (shown when rejecting) */}
        {showFeedback && (
          <div className="pt-4 border-t border-slate-800">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              <MessageSquare className="w-4 h-4 inline mr-2" />
              Feedback for revision
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Describe what changes you'd like to the plan..."
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
              rows={3}
            />
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-5 py-4 border-t border-slate-800 bg-slate-800/30 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Clock className="w-4 h-4" />
          Review the plan before coding begins
        </div>

        <div className="flex items-center gap-2">
          {showFeedback ? (
            <>
              <button
                onClick={() => {
                  setShowFeedback(false);
                  setFeedback("");
                  setError(null);
                }}
                disabled={loading}
                className="px-3 py-2 text-sm text-slate-400 hover:text-white transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={loading || !feedback.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {loading && action === "reject" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Edit3 className="w-4 h-4" />
                )}
                Request Changes
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setShowFeedback(true)}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                Edit Plan
              </button>
              <button
                onClick={handleApprove}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {loading && action === "approve" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Start Building
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
