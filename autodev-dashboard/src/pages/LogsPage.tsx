import React from "react";
import { Terminal } from "lucide-react";

export function LogsPage() {
  return (
    <div className="p-8 h-full flex flex-col max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">System Logs</h2>
        <p className="text-slate-400">Real-time event stream from the AutoDev pipeline.</p>
      </div>

      <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-sm">
        <div className="flex items-center justify-center h-full text-slate-600">
          <div className="text-center">
            <Terminal className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Logs streaming coming soon</p>
            <p className="text-xs mt-2">Connect to the backend to view real-time logs</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LogsPage;
