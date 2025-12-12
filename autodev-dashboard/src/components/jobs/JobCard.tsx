import React from "react";
import { Briefcase, Play, Square, CheckCircle, XCircle, Clock, ExternalLink } from "lucide-react";
import type { Job, JobStatus } from "@/types/api";

function getStatusDisplay(status: JobStatus): { icon: React.ReactNode; color: string; label: string } {
  switch (status) {
    case "queued":
      return {
        icon: <Clock className="w-4 h-4" />,
        color: "text-slate-400 bg-slate-500/10",
        label: "Queued",
      };
    case "running":
      return {
        icon: <Play className="w-4 h-4" />,
        color: "text-blue-400 bg-blue-500/10",
        label: "Running",
      };
    case "completed":
      return {
        icon: <CheckCircle className="w-4 h-4" />,
        color: "text-emerald-400 bg-emerald-500/10",
        label: "Completed",
      };
    case "failed":
      return {
        icon: <XCircle className="w-4 h-4" />,
        color: "text-red-400 bg-red-500/10",
        label: "Failed",
      };
    case "cancelled":
      return {
        icon: <Square className="w-4 h-4" />,
        color: "text-amber-400 bg-amber-500/10",
        label: "Cancelled",
      };
    default:
      return {
        icon: <Briefcase className="w-4 h-4" />,
        color: "text-slate-400 bg-slate-500/10",
        label: status,
      };
  }
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

interface JobCardProps {
  job: Job;
  onClick?: () => void;
}

export function JobCard({ job, onClick }: JobCardProps) {
  const statusDisplay = getStatusDisplay(job.status);
  const completedTasks = job.tasks.filter(t => t.status === "COMPLETED").length;
  const failedTasks = job.tasks.filter(t => t.status === "FAILED").length;
  const totalTasks = job.tasks.length;
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div
      onClick={onClick}
      className={`bg-slate-900 border border-slate-800 rounded-xl p-4 transition-all ${
        onClick ? "cursor-pointer hover:border-slate-700 hover:bg-slate-800/50" : ""
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg ${statusDisplay.color}`}>
            {statusDisplay.icon}
          </div>
          <div>
            <h3 className="font-medium text-white">
              {job.repo.split("/")[1] || job.repo}
            </h3>
            <p className="text-xs text-slate-500">
              {job.issue_numbers.length} issues • Created {formatRelativeTime(job.created_at)}
            </p>
          </div>
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusDisplay.color}`}>
          {statusDisplay.label}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span>{completedTasks} of {totalTasks} tasks</span>
          <span>{progressPercent}%</span>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
          {failedTasks > 0 && (
            <div
              className="h-full bg-red-500 -mt-2"
              style={{ width: `${(failedTasks / totalTasks) * 100}%`, marginLeft: `${progressPercent}%` }}
            />
          )}
        </div>
      </div>

      {/* Task Summary */}
      <div className="flex flex-wrap gap-2">
        {job.tasks.slice(0, 5).map((task) => (
          <div
            key={task.id}
            className={`text-xs px-2 py-1 rounded border ${
              task.status === "COMPLETED"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : task.status === "FAILED"
                ? "bg-red-500/10 text-red-400 border-red-500/20"
                : "bg-slate-800 text-slate-400 border-slate-700"
            }`}
          >
            #{task.issue_number}
            {task.pr_url && (
              <a
                href={task.pr_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="ml-1 hover:text-white"
              >
                <ExternalLink className="w-3 h-3 inline" />
              </a>
            )}
          </div>
        ))}
        {job.tasks.length > 5 && (
          <span className="text-xs text-slate-500 px-2 py-1">
            +{job.tasks.length - 5} more
          </span>
        )}
      </div>
    </div>
  );
}

export default JobCard;
