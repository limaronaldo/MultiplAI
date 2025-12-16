import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, Download, Check, AlertCircle, ArrowLeft } from "lucide-react";
import { ToastContainer, useToast } from "@/components/common/Toast";

interface Repository {
  id: string;
  owner: string;
  repo: string;
  full_name: string;
}

interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: string;
  labels: string[];
  url: string;
  created_at: string;
}

export function ImportPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [selectedIssues, setSelectedIssues] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [labelFilter, setLabelFilter] = useState<string>("all");

  // Fetch repositories
  useEffect(() => {
    fetch("/api/repositories")
      .then((res) => res.json())
      .then((data) => {
        setRepositories(data.repositories || []);
      })
      .catch(() => {});
  }, []);

  // Fetch issues when repo selected
  const fetchIssues = async () => {
    if (!selectedRepo) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/issues/${selectedRepo}?state=open`);
      const data = await res.json();
      setIssues(data.issues || []);
      setSelectedIssues(new Set());
    } catch (e) {
      toast.error("Failed to fetch issues", String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedRepo) {
      fetchIssues();
    }
  }, [selectedRepo]);

  // Get unique labels
  const allLabels = useMemo(() => {
    const labels = new Set<string>();
    issues.forEach((issue) => {
      issue.labels.forEach((l) => labels.add(l));
    });
    return Array.from(labels).sort();
  }, [issues]);

  // Filter issues by label
  const filteredIssues = useMemo(() => {
    if (labelFilter === "all") return issues;
    return issues.filter((issue) => issue.labels.includes(labelFilter));
  }, [issues, labelFilter]);

  // Toggle issue selection
  const toggleIssue = (number: number) => {
    const newSet = new Set(selectedIssues);
    if (newSet.has(number)) {
      newSet.delete(number);
    } else {
      newSet.add(number);
    }
    setSelectedIssues(newSet);
  };

  // Select all filtered issues
  const selectAll = () => {
    const allNumbers = new Set(filteredIssues.map((i) => i.number));
    setSelectedIssues(allNumbers);
  };

  // Deselect all
  const deselectAll = () => {
    setSelectedIssues(new Set());
  };

  // Import selected issues
  const handleImport = async () => {
    if (selectedIssues.size === 0) {
      toast.error("No issues selected", "Select at least one issue to import");
      return;
    }

    setImporting(true);
    try {
      const res = await fetch("/api/tasks/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: selectedRepo,
          issues: Array.from(selectedIssues),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to import");
      }

      toast.success(
        `Imported ${data.imported} issues`,
        data.skipped > 0 ? `${data.skipped} already existed` : undefined
      );

      // Navigate to tasks page
      setTimeout(() => navigate("/tasks"), 1500);
    } catch (e) {
      toast.error("Import failed", String(e));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">Import Issues</h1>
          <p className="text-slate-400 text-sm">
            Import existing GitHub issues as tasks
          </p>
        </div>
      </div>

      {/* Repository selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-400 mb-2">
          Select Repository
        </label>
        <select
          value={selectedRepo}
          onChange={(e) => setSelectedRepo(e.target.value)}
          className="w-full max-w-md px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
        >
          <option value="">Choose a repository...</option>
          {repositories.map((repo) => (
            <option key={repo.id} value={repo.full_name}>
              {repo.full_name}
            </option>
          ))}
        </select>
      </div>

      {selectedRepo && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">Filter by label:</span>
              <select
                value={labelFilter}
                onChange={(e) => setLabelFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="all">All labels</option>
                {allLabels.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={fetchIssues}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>

            <div className="flex-1" />

            <button
              onClick={selectAll}
              className="px-3 py-1.5 text-sm text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg transition-colors"
            >
              Select All ({filteredIssues.length})
            </button>
            <button
              onClick={deselectAll}
              className="px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              Deselect All
            </button>
          </div>

          {/* Issues list */}
          {loading ? (
            <div className="animate-pulse space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 bg-slate-800 rounded-lg" />
              ))}
            </div>
          ) : filteredIssues.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg">No issues found</p>
              <p className="text-sm mt-2">
                {labelFilter !== "all"
                  ? `No open issues with label "${labelFilter}"`
                  : "No open issues in this repository"}
              </p>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden mb-6">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="px-4 py-3 w-12">
                      <input
                        type="checkbox"
                        checked={selectedIssues.size === filteredIssues.length && filteredIssues.length > 0}
                        onChange={() => {
                          if (selectedIssues.size === filteredIssues.length) {
                            deselectAll();
                          } else {
                            selectAll();
                          }
                        }}
                        className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                      />
                    </th>
                    <th className="px-4 py-3">Issue</th>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Labels</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIssues.map((issue) => (
                    <tr
                      key={issue.number}
                      onClick={() => toggleIssue(issue.number)}
                      className={`border-b border-slate-800 cursor-pointer transition-colors ${
                        selectedIssues.has(issue.number)
                          ? "bg-blue-500/10"
                          : "hover:bg-slate-800/50"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIssues.has(issue.number)}
                          onChange={() => toggleIssue(issue.number)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-blue-400 font-mono">
                          #{issue.number}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-200 max-w-md truncate">
                        {issue.title}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {issue.labels.slice(0, 3).map((label) => (
                            <span
                              key={label}
                              className={`text-xs px-2 py-0.5 rounded-full ${
                                label === "auto-dev"
                                  ? "bg-green-500/20 text-green-400"
                                  : label === "pmvp"
                                  ? "bg-purple-500/20 text-purple-400"
                                  : "bg-slate-700 text-slate-300"
                              }`}
                            >
                              {label}
                            </span>
                          ))}
                          {issue.labels.length > 3 && (
                            <span className="text-xs text-slate-500">
                              +{issue.labels.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Import button */}
          {filteredIssues.length > 0 && (
            <div className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-xl">
              <div className="text-sm text-slate-400">
                {selectedIssues.size} issue{selectedIssues.size !== 1 ? "s" : ""} selected
              </div>
              <button
                onClick={handleImport}
                disabled={selectedIssues.size === 0 || importing}
                className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {importing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Import Selected
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}

      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismissToast} />
    </div>
  );
}
