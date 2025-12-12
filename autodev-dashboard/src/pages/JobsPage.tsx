import React, { useState } from "react";
import { Plus, ExternalLink } from "lucide-react";
import { useJobs } from "@/hooks";
import { JobList, CreateJobModal } from "@/components/jobs";

export function JobsPage() {
  const { jobs, isLoading, error, createJob, refetch } = useJobs();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateJob = async (repo: string, issueNumbers: number[]) => {
    setIsSubmitting(true);
    try {
      await createJob({ repo, issueNumbers });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Jobs</h2>
          <p className="text-slate-400">
            Batch job management for multiple issues.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/limaronaldo/MultiplAI#jobs-api-examples"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
          >
            API Docs <ExternalLink className="w-3 h-3" />
          </a>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium"
          >
            <Plus className="w-4 h-4" />
            New Job
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      <JobList jobs={jobs} isLoading={isLoading} onRefresh={refetch} />

      {jobs.length === 0 && !isLoading && (
        <div className="mt-6 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
          <h3 className="text-sm font-medium text-slate-300 mb-2">
            Create a Job via API
          </h3>
          <pre className="text-xs text-slate-400 bg-slate-900 p-3 rounded overflow-x-auto">
            {`curl -X POST https://multiplai.fly.dev/api/jobs \\
  -H "Content-Type: application/json" \\
  -d '{"repo": "owner/repo", "issueNumbers": [1, 2, 3]}'`}
          </pre>
        </div>
      )}

      <CreateJobModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateJob}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}

export default JobsPage;
