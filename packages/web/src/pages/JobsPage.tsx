import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { RefreshCw, Play, XCircle } from "lucide-react";
import type { JobSummary, JobStatus } from "@autodev/shared";

function getStatusColor(status: JobStatus): string {
  switch (status) {
    case "completed":
      return "bg-emerald-500/10 text-emerald-400";
    case "failed":
      return "bg-red-500/10 text-red-400";
    case "running":
      return "bg-blue-500/10 text-blue-400";
    case "cancelled":
      return "bg-slate-500/10 text-slate-400";
    default:
      return "bg-amber-500/10 text-amber-400";
  }
}

export function JobsPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJobs = () => {
    setLoading(true);
    fetch("/api/jobs")
      .then((res) => res.json())
      .then((data) => {
        // API returns { jobs: [...] } wrapper
        setJobs(Array.isArray(data) ? data : data.jobs || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Jobs</h1>
        <button
          onClick={fetchJobs}
          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading && jobs.length === 0 ? (
        <div className="animate-pulse space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-slate-800 rounded-lg" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <p className="text-lg">No jobs yet</p>
          <p className="text-sm mt-2">
            Create a job to batch process multiple issues
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => {
            // Handle both old format (name, total_tasks) and new format (githubRepo, summary)
            const name = job.name || job.githubRepo || "Unnamed Job";
            const total = job.total_tasks ?? job.summary?.total ?? 0;
            const completed =
              job.completed_tasks ?? job.summary?.completed ?? 0;
            const failed = job.failed_tasks ?? job.summary?.failed ?? 0;
            const progress = total > 0 ? (completed / total) * 100 : 0;

            return (
              <div
                key={job.id}
                onClick={() => navigate(`/jobs/${job.id}`)}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-white">{name}</h3>
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded-full ${getStatusColor(job.status)}`}
                  >
                    {job.status.toUpperCase()}
                  </span>
                </div>

                <div className="flex items-center gap-6 text-sm text-slate-400">
                  <span>Total: {total}</span>
                  <span className="text-emerald-400">
                    Completed: {completed}
                  </span>
                  <span className="text-red-400">Failed: {failed}</span>
                </div>

                {/* Progress bar */}
                <div className="mt-4 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
