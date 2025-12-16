import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, ArrowRight, ExternalLink } from "lucide-react";

interface Task {
  id: string;
  github_issue_title: string;
  github_repo: string;
  pr_url?: string;
  pr_number?: number;
  updated_at: string;
}

const API_BASE = import.meta.env.VITE_API_URL || "";

export function PendingReviewWidget() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/tasks?status=WAITING_HUMAN&limit=5`)
      .then((res) => res.json())
      .then((data) => {
        setTasks(data.tasks || []);
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

  return (
    <div className="bg-slate-900 dark:bg-slate-900 border border-slate-800 rounded-xl p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Pending Review</h3>
        <Link
          to="/tasks?status=WAITING_HUMAN"
          className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
        >
          View all <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {tasks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-500">
          No tasks pending review
        </div>
      ) : (
        <div className="space-y-2 flex-1">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800/50 transition-colors"
            >
              <div className="p-1.5 rounded-lg bg-amber-500/10">
                <Clock className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">
                  {task.github_issue_title}
                </p>
                <p className="text-xs text-slate-500">{task.github_repo}</p>
              </div>
              {task.pr_url && (
                <a
                  href={task.pr_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
