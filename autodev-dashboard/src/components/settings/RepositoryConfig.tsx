import React from 'react';
import { GitBranch, FileCode, Shield, FolderX, Info } from 'lucide-react';

// Hardcoded repository configuration data
const REPO_CONFIG = {
  repository: {
    name: 'limaronaldo/MultiplAI',
    enabled: true,
  },
  coreFiles: ['index.ts', 'router.ts', 'core/orchestrator.ts'],
  guardrails: {
    maxDiffLines: 300,
    maxAttempts: 3,
    allowedComplexity: ['XS', 'S'],
  },
  blockedPaths: ['.env', 'secrets/', '.github/workflows/'],
};

export function RepositoryConfig() {
  return (
    <div className="space-y-6">
      {/* Repository Section */}
      <div className="bg-slate-900 rounded-lg border border-slate-800 p-6">
        <div className="flex items-center gap-3 mb-4">
          <GitBranch className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-slate-100">Repository</h2>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Name</span>
            <span className="text-slate-200 font-mono">
              {REPO_CONFIG.repository.name}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Status</span>
            <span
              className={`px-2 py-1 rounded text-sm font-medium ${
                REPO_CONFIG.repository.enabled
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-red-500/20 text-red-400'
              }`}
            >
              {REPO_CONFIG.repository.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>
      </div>

      {/* Core Files Section */}
      <div className="bg-slate-900 rounded-lg border border-slate-800 p-6">
        <div className="flex items-center gap-3 mb-4">
          <FileCode className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-slate-100">Core Files</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {REPO_CONFIG.coreFiles.map((file) => (
            <span
              key={file}
              className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm font-mono"
            >
              {file}
            </span>
          ))}
        </div>
      </div>

      {/* Guardrails Section */}
      <div className="bg-slate-900 rounded-lg border border-slate-800 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-slate-100">Guardrails</h2>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Max Diff Lines</span>
            <span className="text-slate-200 font-mono">
              {REPO_CONFIG.guardrails.maxDiffLines}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Max Attempts</span>
            <span className="text-slate-200 font-mono">
              {REPO_CONFIG.guardrails.maxAttempts}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Allowed Complexity</span>
            <div className="flex gap-2">
              {REPO_CONFIG.guardrails.allowedComplexity.map((level) => (
                <span
                  key={level}
                  className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-sm font-medium"
                >
                  {level}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Blocked Paths Section */}
      <div className="bg-slate-900 rounded-lg border border-slate-800 p-6">
        <div className="flex items-center gap-3 mb-4">
          <FolderX className="w-5 h-5 text-red-400" />
          <h2 className="text-lg font-semibold text-slate-100">Blocked Paths</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {REPO_CONFIG.blockedPaths.map((path) => (
            <span
              key={path}
              className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm font-mono"
            >
              {path}
            </span>
          ))}
        </div>
      </div>

      {/* Read-only Notice */}
      <div className="flex items-center gap-2 text-slate-500 text-sm">
        <Info className="w-4 h-4" />
        <span>This configuration is read-only. Contact an administrator to make changes.</span>
      </div>
    </div>
  );