import React, { useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface Repository {
  id: string;
  full_name: string;
}

interface NewPlanDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (planId: string) => void;
}

export const NewPlanDialog: React.FC<NewPlanDialogProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchRepositories();
    }
  }, [isOpen]);

  const fetchRepositories = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/repositories`);
      if (response.ok) {
        const data = await response.json();
        setRepositories(data.repositories || []);
        if (data.repositories?.length > 0 && !githubRepo) {
          setGithubRepo(data.repositories[0].full_name);
        }
      }
    } catch (err) {
      console.error("Failed to fetch repositories:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !githubRepo.trim()) {
      setError("Name and repository are required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          github_repo: githubRepo.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create plan");
      }

      const data = await response.json();
      setName("");
      setDescription("");
      onCreated(data.plan.id);
    } catch (err) {
      console.error("Failed to create plan:", err);
      setError(err instanceof Error ? err.message : "Failed to create plan");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setName("");
    setDescription("");
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Create New Plan
        </h2>

        <form onSubmit={handleSubmit}>
          {/* Name */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Plan Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., User Authentication System"
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>

          {/* Repository */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Repository *
            </label>
            {repositories.length > 0 ? (
              <select
                value={githubRepo}
                onChange={(e) => setGithubRepo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {repositories.map((repo) => (
                  <option key={repo.id} value={repo.full_name}>
                    {repo.full_name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={githubRepo}
                onChange={(e) => setGithubRepo(e.target.value)}
                placeholder="owner/repository"
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            )}
          </div>

          {/* Description */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the feature..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 mb-4">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Creating..." : "Create Plan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
