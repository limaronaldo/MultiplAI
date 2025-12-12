import React from "react";
import { Briefcase, ExternalLink } from "lucide-react";
import { JobList } from "@/components/jobs";

export function JobsPage() {
  // Note: Jobs list endpoint not yet available in backend
  // For now showing empty state with instructions
  const jobs: never[] = [];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Jobs</h2>
          <p className="text-slate-400">
            Batch job management for multiple issues.
          </p>
        </div>
        <a
          href="https://github.com/limaronaldo/MultiplAI#jobs-api-examples"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
        >
          API Docs <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <JobList jobs={jobs} />

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
    </div>
  );
}

export default JobsPage;
