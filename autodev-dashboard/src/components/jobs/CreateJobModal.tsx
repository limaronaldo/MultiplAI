import React, { useState, useEffect, useRef } from "react";
import { X, Plus, Trash2, Loader2 } from "lucide-react";

interface CreateJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (repo: string, issueNumbers: number[]) => Promise<void>;
  isSubmitting?: boolean;
}

export function CreateJobModal({ isOpen, onClose, onSubmit, isSubmitting = false }: CreateJobModalProps) {
  const [repo, setRepo] = useState("");
  const [issueInput, setIssueInput] = useState("");
  const [issueNumbers, setIssueNumbers] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose, isSubmitting]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setRepo("");
      setIssueInput("");
      setIssueNumbers([]);
      setError(null);
    }
  }, [isOpen]);

  const addIssue = () => {
    const num = parseInt(issueInput.trim(), 10);
    if (isNaN(num) || num <= 0) {
      setError("Please enter a valid issue number");
      return;
    }
    if (issueNumbers.includes(num)) {
      setError("Issue already added");
      return;
    }
    setIssueNumbers([...issueNumbers, num]);
    setIssueInput("");
    setError(null);
  };

  const removeIssue = (num: number) => {
    setIssueNumbers(issueNumbers.filter(n => n !== num));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!repo.trim()) {
      setError("Repository is required");
      return;
    }
    if (!repo.includes("/")) {
      setError("Repository must be in format owner/repo");
      return;
    }
    if (issueNumbers.length === 0) {
      setError("At least one issue is required");
      return;
    }

    try {
      await onSubmit(repo.trim(), issueNumbers);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create job");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addIssue();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={isSubmitting ? undefined : onClose}
      />

      {/* Modal */}
      <div className="relative bg-slate-900 border border-slate-700 rounded-xl shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Create New Job</h2>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Repository */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Repository
            </label>
            <input
              ref={inputRef}
              type="text"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="owner/repo"
              disabled={isSubmitting}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
            />
          </div>

          {/* Issue Numbers */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Issue Numbers
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={issueInput}
                onChange={(e) => setIssueInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="#123"
                disabled={isSubmitting}
                className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              />
              <button
                type="button"
                onClick={addIssue}
                disabled={isSubmitting}
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white disabled:opacity-50"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {/* Issue tags */}
            {issueNumbers.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {issueNumbers.map((num) => (
                  <span
                    key={num}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-sm"
                  >
                    #{num}
                    <button
                      type="button"
                      onClick={() => removeIssue(num)}
                      disabled={isSubmitting}
                      className="hover:text-blue-200 disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || issueNumbers.length === 0}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Job"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateJobModal;
