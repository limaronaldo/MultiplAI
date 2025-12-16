import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Trash2,
  Github,
  Lock,
  Globe,
  Loader2,
  AlertCircle,
  Check,
  Download,
} from "lucide-react";
import type { Repository } from "@autodev/shared";

export function RepositoriesPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [repoInput, setRepoInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchRepositories();
  }, []);

  const fetchRepositories = async () => {
    try {
      const res = await fetch("/api/repositories");
      const data = await res.json();
      setRepositories(data.repositories || []);
    } catch (e) {
      setError("Failed to load repositories");
    } finally {
      setLoading(false);
    }
  };

  // Extract owner/repo from input (supports both "owner/repo" and GitHub URLs)
  const parseRepoInput = (input: string): string | null => {
    const trimmed = input.trim();

    // Try to extract from GitHub URL
    // Supports: https://github.com/owner/repo, github.com/owner/repo, etc.
    const urlMatch = trimmed.match(
      /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/,
    );
    if (urlMatch) {
      return `${urlMatch[1]}/${urlMatch[2]}`;
    }

    // Check if it's already owner/repo format
    if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(trimmed)) {
      return trimmed;
    }

    return null;
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullName = parseRepoInput(repoInput);

    if (!fullName) {
      setError("Invalid format. Use: owner/repo or paste a GitHub URL");
      return;
    }

    setAdding(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/repositories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to add repository");
        return;
      }

      setRepositories((prev) => [...prev, data.repository]);
      setRepoInput("");
      setSuccess(`Added ${fullName}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError("Failed to add repository");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string, fullName: string) => {
    if (!confirm(`Remove ${fullName} from linked repositories?`)) return;

    setDeleting(id);
    setError(null);

    try {
      const res = await fetch(`/api/repositories/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to remove repository");
        return;
      }

      setRepositories((prev) => prev.filter((r) => r.id !== id));
      setSuccess(`Removed ${fullName}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError("Failed to remove repository");
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-slate-800 rounded" />
          <div className="h-64 bg-slate-800 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Repositories</h1>
        <p className="text-sm text-slate-400 mt-1">
          Link repositories that AutoDev can process issues from
        </p>
      </div>

      {/* Add repository form */}
      <form onSubmit={handleAdd} className="mb-6">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Github className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input
              type="text"
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              placeholder="owner/repo or https://github.com/owner/repo"
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              disabled={adding}
            />
          </div>
          <button
            type="submit"
            disabled={adding || !repoInput.trim()}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {adding ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Add Repository
          </button>
          <button
            type="button"
            onClick={() => navigate("/import")}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Import Issues
          </button>
        </div>
      </form>

      {/* Status messages */}
      {error && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
          <Check className="w-4 h-4 shrink-0" />
          <span className="text-sm">{success}</span>
        </div>
      )}

      {/* Repository list */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {repositories.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Github className="w-12 h-12 text-slate-700 mx-auto mb-3" />
            <p className="text-slate-400">No repositories linked yet</p>
            <p className="text-sm text-slate-500 mt-1">
              Add a repository above to get started
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/50">
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Repository
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Visibility
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Added
                </th>
                <th className="px-5 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {repositories.map((repo) => (
                <tr
                  key={repo.id}
                  className="hover:bg-slate-800/30 transition-colors"
                >
                  <td className="px-5 py-4">
                    <a
                      href={repo.github_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 group"
                    >
                      <Github className="w-5 h-5 text-slate-500 group-hover:text-white transition-colors" />
                      <div>
                        <div className="font-medium text-white group-hover:text-blue-400 transition-colors">
                          {repo.full_name}
                        </div>
                        {repo.description && (
                          <div className="text-sm text-slate-500 truncate max-w-md">
                            {repo.description}
                          </div>
                        )}
                      </div>
                    </a>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                        repo.is_private
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-emerald-500/10 text-emerald-400"
                      }`}
                    >
                      {repo.is_private ? (
                        <>
                          <Lock className="w-3 h-3" />
                          Private
                        </>
                      ) : (
                        <>
                          <Globe className="w-3 h-3" />
                          Public
                        </>
                      )}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-400">
                    {new Date(repo.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => handleDelete(repo.id, repo.full_name)}
                      disabled={deleting === repo.id}
                      className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                      title="Remove repository"
                    >
                      {deleting === repo.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Info card */}
      <div className="mt-6 bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="font-semibold text-white mb-2">How it works</h3>
        <ul className="text-sm text-slate-400 space-y-1.5">
          <li>1. Add repositories you want AutoDev to monitor</li>
          <li>
            2. Label issues with{" "}
            <code className="px-1.5 py-0.5 bg-slate-800 rounded text-blue-400">
              auto-dev
            </code>{" "}
            to trigger automatic processing
          </li>
          <li>
            3. AutoDev will analyze the issue, generate code, and create a pull
            request
          </li>
        </ul>
      </div>
    </div>
  );
}
