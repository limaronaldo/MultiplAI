import React, { useState } from "react";
import { PlayCircle, ExternalLink, AlertCircle } from "lucide-react";
import { API_BASE_URL } from "@/config/api";

// Available repositories
const REPOSITORIES = [
  { value: "limaronaldo/MultiplAI", label: "limaronaldo/MultiplAI" },
];

interface TriggerFormProps {
  onTaskCreated?: (taskId: string) => void;
}

export function TriggerForm({ onTaskCreated }: TriggerFormProps) {
  const [repo, setRepo] = useState(REPOSITORIES[0].value);
  const [issueNumber, setIssueNumber] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const issueNum = parseInt(issueNumber, 10);
    if (isNaN(issueNum) || issueNum <= 0) {
      setError("Please enter a valid issue number");
      return;
    }

    setIsLoading(true);

    try {
      // Create a job with single issue
      const createRes = await fetch(`${API_BASE_URL}/api/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo, issueNumbers: [issueNum] }),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.error || "Failed to create job");
      }

      const job = await createRes.json();
      const jobId = job.job?.id || job.id;

      // Start the job
      const startRes = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/run`, {
        method: "POST",
      });

      if (!startRes.ok) {
        const err = await startRes.json();
        throw new Error(err.error || "Failed to start job");
      }

      setSuccess(`Processing started for issue #${issueNum}`);
      setIssueNumber("");

      // Notify parent
      if (onTaskCreated && job.job?.taskIds?.length > 0) {
        onTaskCreated(job.job.taskIds[0]);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to trigger processing";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const githubUrl = issueNumber
    ? `https://github.com/${repo}/issues/${issueNumber}`
    : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">
          Trigger Issue Processing
        </h2>
        <p className="text-slate-400 text-sm">
          Enter a GitHub issue number to start AutoDev processing.
        </p>
      </div>

      {/* Repository Select */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Repository
        </label>
        <select
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500"
        >
          {REPOSITORIES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {/* Issue Number Input */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Issue Number
        </label>
        <input
          type="number"
          min="1"
          value={issueNumber}
          onChange={(e) => setIssueNumber(e.target.value)}
          placeholder="e.g., 42"
          className={`w-full bg-slate-900 border rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none ${
            error
              ? "border-red-500 focus:border-red-500"
              : "border-slate-700 focus:border-blue-500"
          }`}
        />
        {error && (
          <div className="flex items-center gap-2 mt-2 text-sm text-red-400">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}
        {success && (
          <div className="mt-2 text-sm text-emerald-400">{success}</div>
        )}
      </div>

      {/* GitHub Link */}
      {githubUrl && (
        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
        >
          <ExternalLink className="w-4 h-4" />
          View issue on GitHub
        </a>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={!issueNumber || isLoading}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
      >
        {isLoading ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <PlayCircle className="w-4 h-4" />
            Start Processing
          </>
        )}
      </button>
    </form>
  );
}

export default TriggerForm;
