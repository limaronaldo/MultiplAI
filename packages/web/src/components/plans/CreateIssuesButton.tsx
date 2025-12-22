import React, { useState } from "react";
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  Zap,
  Clock,
  Info,
} from "lucide-react";

interface CreateIssuesButtonProps {
  planId: string;
  cardCount: number;
  disabled: boolean;
  onCreateIssues: (options?: {
    fastMode?: boolean;
  }) => Promise<{ created: number; failed: number }>;
}

export const CreateIssuesButton: React.FC<CreateIssuesButtonProps> = ({
  planId,
  cardCount,
  disabled,
  onCreateIssues,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fastMode, setFastMode] = useState(false);
  const [showFastModeInfo, setShowFastModeInfo] = useState(false);
  const [result, setResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const handleClick = () => {
    if (disabled) return;
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    setShowConfirm(false);
    setIsCreating(true);
    setResult(null);

    try {
      const response = await onCreateIssues({ fastMode });

      if (response.failed > 0) {
        setResult({
          type: "success",
          message: `Created ${response.created}, ${response.failed} failed`,
        });
      } else {
        setResult({
          type: "success",
          message: `Created ${response.created} issues!`,
        });
      }

      // Clear success message after 5 seconds
      setTimeout(() => setResult(null), 5000);
    } catch (error) {
      console.error("Failed to create issues:", error);
      setResult({
        type: "error",
        message: "Failed to create issues",
      });
      // Clear error message after 5 seconds
      setTimeout(() => setResult(null), 5000);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCancel = () => {
    setShowConfirm(false);
  };

  // Handle escape key to close dialog
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showConfirm) {
        setShowConfirm(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showConfirm]);

  return (
    <>
      <button
        onClick={handleClick}
        disabled={disabled || isCreating}
        className={`px-4 py-2 rounded-lg font-medium transition-all ${
          disabled || isCreating
            ? "bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed"
            : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow"
        }`}
      >
        {isCreating ? (
          <span className="flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" />
            Creating issues...
          </span>
        ) : result ? (
          <span
            className={`flex items-center gap-2 ${result.type === "success" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
          >
            {result.type === "success" ? (
              <CheckCircle size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            {result.message}
          </span>
        ) : (
          `Create ${cardCount} Issue${cardCount !== 1 ? "s" : ""}`
        )}
      </button>

      {/* Confirmation Dialog */}
      {showConfirm && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={handleCancel}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              Create GitHub Issues?
            </h3>
            <p className="text-gray-600 dark:text-slate-300 mb-4">
              This will create <strong>{cardCount}</strong> GitHub issue
              {cardCount !== 1 ? "s" : ""} from your plan cards. Each card will
              become a new issue in the linked repository.
            </p>

            {/* Fast Mode Toggle */}
            <div className="mb-6 p-3 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap
                    className={`w-5 h-5 ${fastMode ? "text-yellow-500" : "text-slate-400"}`}
                  />
                  <span className="font-medium text-gray-900 dark:text-white">
                    Fast Mode
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowFastModeInfo(!showFastModeInfo)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    <Info size={14} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setFastMode(!fastMode)}
                  className={`
                    relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                    ${fastMode ? "bg-yellow-500" : "bg-slate-300 dark:bg-slate-600"}
                  `}
                >
                  <span
                    className={`
                      inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                      ${fastMode ? "translate-x-6" : "translate-x-1"}
                    `}
                  />
                </button>
              </div>

              {/* Fast Mode Info */}
              {showFastModeInfo && (
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                    Quick, lightweight changes with faster models
                  </p>
                  <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                      <Clock size={12} className="text-blue-400" />
                      <span>10-60 seconds vs minutes</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-400 font-bold">$</span>
                      <span>Lower cost per task (~$0.02)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Info size={12} className="text-slate-400" />
                      <span>Skips comprehensive review</span>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    Best for: typos, docs, small refactors, simple bug fixes
                  </p>
                </div>
              )}

              {/* Fast mode enabled indicator */}
              {fastMode && !showFastModeInfo && (
                <p className="mt-2 text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                  <Zap size={12} />
                  Issues will be processed with faster models
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleConfirm}
                className={`flex-1 px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                  fastMode
                    ? "bg-yellow-500 hover:bg-yellow-600 text-black"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
              >
                {fastMode && <Zap size={16} />}
                Create {cardCount} Issue{cardCount !== 1 ? "s" : ""}
              </button>
              <button
                onClick={handleCancel}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CreateIssuesButton;
