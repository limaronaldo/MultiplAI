import React from "react";
import { LogsViewer } from "@/components/logs/LogsViewer";

export function LogsPage() {
  return (
    <div className="p-8 h-full flex flex-col max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">System Logs</h2>
        <p className="text-slate-400">
          Real-time event stream from the AutoDev pipeline.
        </p>
      </div>

      <div className="flex-1">
        <LogsViewer maxHeight="calc(100vh - 250px)" autoScroll={true} />
      </div>
    </div>
  );
}

export default LogsPage;
