import React, { useState } from "react";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";

interface CreateIssuesButtonProps {
  planId: string;
  cardCount: number;
  disabled: boolean;
  onCreateIssues: () => Promise<{ created: number; failed: number }>;
}

export const CreateIssuesButton: React.FC<CreateIssuesButtonProps> = ({
  planId,
  cardCount,
  disabled,
  onCreateIssues,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
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
      const response = await onCreateIssues();

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
            <p className="text-gray-600 dark:text-slate-300 mb-6">
              This will create <strong>{cardCount}</strong> GitHub issue
              {cardCount !== 1 ? "s" : ""} from your plan cards. Each card will
              become a new issue in the linked repository.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleConfirm}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
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
