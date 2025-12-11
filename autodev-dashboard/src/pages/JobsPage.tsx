import React from "react";
import { Briefcase, Clock, CheckCircle, XCircle, Loader } from "lucide-react";

export function JobsPage() {
  // Jobs will be implemented with a proper jobs list hook later
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Jobs</h2>
        <p className="text-slate-400">Batch job management for multiple issues.</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
        <Briefcase className="w-12 h-12 text-slate-600 mx-auto mb-4" />
        <p className="text-slate-400 mb-2">No jobs created yet</p>
        <p className="text-slate-500 text-sm">
          Create a job via the API to process multiple issues at once.
        </p>
      </div>
    </div>
  );
}

export default JobsPage;
