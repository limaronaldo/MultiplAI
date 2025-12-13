import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { apiClient, ApiClientError } from "../../services/apiClient";
import type { JobCreateResponse } from "../../types/api";

// Available repositories - in production, fetch from API
const REPOSITORIES = [
  "limaronaldo/MultiplAI",
  // Add more repos as needed
];

interface CreateJobFormProps {
  onSuccess: (job: JobCreateResponse) => void;
  onCancel: () => void;
}

export function CreateJobForm({ onSuccess, onCancel }: CreateJobFormProps) {
  const [repo, setRepo] = useState(REPOSITORIES[0]);
  const [issueNumbersText, setIssueNumbersText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Parse issue numbers from text input
   * Accepts: "1, 2, 3" or "1 2 3" or "1\n2\n3"
   */
  const parseIssueNumbers = (text: string): number[] => {
    const numbers = text
      .split(/[\s,]+/) // Split by whitespace or comma
      .map((s) => s.trim())
      .filter((s) => s !== "")
      .map((s) => parseInt(s, 10))
      .filter((n) => !isNaN(n) && n > 0);

    // Remove duplicates
    return [...new Set(numbers)];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const issueNumbers = parseIssueNumbers(issueNumbersText);

    if (issueNumbers.length === 0) {
      setError("Please enter at least one valid issue number");
      return;
    }

    setIsSubmitting(true);

    try {
      const job = await apiClient.createJob({ repo, issueNumbers });
      onSuccess(job);
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.message : "Failed to create job";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const parsedNumbers = parseIssueNumbers(issueNumbersText);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Repository Select */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Repository
        </label>
        <select
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
        >
          {REPOSITORIES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      {/* Issue Numbers Input */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Issue Numbers
        </label>
        <textarea
          value={issueNumbersText}
          onChange={(e) => setIssueNumbersText(e.target.value)}
          placeholder="Enter issue numbers (e.g., 1, 2, 3 or one per line)"
          rows={4}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none font-mono"
        />
        <p className="mt-1 text-xs text-slate-500">
          Separate with commas, spaces, or new lines
        </p>
      </div>

      {/* Preview */}
      {parsedNumbers.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
          <p className="text-xs text-slate-400 mb-2">
            Will create job with {parsedNumbers.length} issue
            {parsedNumbers.length !== 1 ? "s" : ""}:
          </p>
          <div className="flex flex-wrap gap-2">
            {parsedNumbers.map((num) => (
              <span
                key={num}
                className="text-xs font-mono bg-blue-500/20 text-blue-400 px-2 py-1 rounded"
              >
                #{num}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg p-3">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || parsedNumbers.length === 0}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {isSubmitting ? "Creating..." : "Create Job"}
        </button>
      </div>
    </form>
  );
}

export default CreateJobForm;
