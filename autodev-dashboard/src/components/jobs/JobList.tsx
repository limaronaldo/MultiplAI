import React from "react";
import { Briefcase } from "lucide-react";
import { JobCard } from "./JobCard";
import type { Job } from "@/types/api";

interface JobListProps {
  jobs: Job[];
  isLoading?: boolean;
  error?: string | null;
  onSelectJob?: (jobId: string) => void;
}

function JobListSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-10 h-10 bg-slate-800 rounded-lg" />
            <div className="flex-1">
              <div className="h-4 bg-slate-800 rounded w-1/2 mb-2" />
              <div className="h-3 bg-slate-800 rounded w-3/4" />
            </div>
          </div>
          <div className="h-2 bg-slate-800 rounded-full mb-3" />
          <div className="flex gap-2">
            <div className="h-6 bg-slate-800 rounded w-12" />
            <div className="h-6 bg-slate-800 rounded w-12" />
            <div className="h-6 bg-slate-800 rounded w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

function JobListEmpty() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
      <Briefcase className="w-12 h-12 text-slate-600 mx-auto mb-4" />
      <p className="text-slate-400 mb-2">No jobs created yet</p>
      <p className="text-slate-500 text-sm">
        Create a job via the API to process multiple issues at once.
      </p>
    </div>
  );
}

function JobListError({ message }: { message: string }) {
  return (
    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-8 text-center">
      <p className="text-red-400 mb-2">Failed to load jobs</p>
      <p className="text-red-300 text-sm">{message}</p>
    </div>
  );
}

export function JobList({ jobs, isLoading, error, onSelectJob }: JobListProps) {
  if (isLoading) {
    return <JobListSkeleton />;
  }

  if (error) {
    return <JobListError message={error} />;
  }

  if (jobs.length === 0) {
    return <JobListEmpty />;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          onClick={onSelectJob ? () => onSelectJob(job.id) : undefined}
        />
      ))}
    </div>
  );
}

export default JobList;
