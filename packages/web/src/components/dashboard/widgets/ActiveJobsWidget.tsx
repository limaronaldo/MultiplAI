import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, ArrowRight, Play, CheckCircle, XCircle } from "lucide-react";
import clsx from "clsx";

interface Job {
  id: string;
  status: string;
  github_repo: string;
  task_count: number;
  completed_count: number;
  failed_count: number;
  created_at: string;
}

const API_BASE = import.meta.env.VITE_API_URL || "";

export function ActiveJobsWidget() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/jobs?limit=5`)
      .then((res) => res.json())
      .then((data) => {
        setJobs(data.jobs || data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-slate-900 dark:bg-slate-900 border border-slate-800 rounded-xl p-5 h-full">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-32 bg-slate-800 rounded" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-slate-800 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    running: "text-blue-400",
    pending: "text-amber-400",
    completed: "text-emerald-400",
    failed: "text-red-400",
  };

  return (
    <div className="bg-slate-900 dark:bg-slate-900 border border-slate-800 rounded-xl p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Active Jobs</h3>
        <Link
          to="/jobs"
          className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
        >
          View all <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {jobs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-500">
          No active jobs
        </div>
      ) : (
        <div className="space-y-2 flex-1">
          {jobs.slice(0, 5).map((job) => (
            <Link
              key={job.id}
              to={`/jobs/${job.id}`}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800/50 transition-colors"
            >
              <div className="p-1.5 rounded-lg bg-blue-500/10">
                <Briefcase className="w-4 h-4 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{job.github_repo}</p>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span
                    className={clsx(
                      "capitalize",
                      statusColors[job.status] || "text-slate-400",
                    )}
                  >
                    {job.status}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-emerald-400" />
                    {job.completed_count}
                  </span>
                  {job.failed_count > 0 && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <XCircle className="w-3 h-3 text-red-400" />
                        {job.failed_count}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
