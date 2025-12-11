import React from "react";
import { Settings, Server, Shield, Bell } from "lucide-react";

export function SettingsPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Settings</h2>
        <p className="text-slate-400">Configure the AutoDev dashboard.</p>
      </div>

      <div className="space-y-6">
        {/* API Configuration */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-slate-800 rounded-lg text-blue-400">
              <Server className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-white">API Configuration</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Backend URL
              </label>
              <input
                type="text"
                defaultValue={import.meta.env.VITE_API_URL || "http://localhost:8080"}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                disabled
              />
              <p className="text-xs text-slate-600 mt-1">
                Set via VITE_API_URL environment variable
              </p>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-slate-800 rounded-lg text-amber-400">
              <Bell className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-white">Notifications</h3>
          </div>
          <div className="space-y-3">
            <label className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg cursor-pointer">
              <span className="text-sm text-slate-300">Show desktop notifications</span>
              <input type="checkbox" className="sr-only peer" />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 relative"></div>
            </label>
            <label className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg cursor-pointer">
              <span className="text-sm text-slate-300">Sound on task completion</span>
              <input type="checkbox" className="sr-only peer" />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 relative"></div>
            </label>
          </div>
        </div>

        {/* Guardrails */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-slate-800 rounded-lg text-emerald-400">
              <Shield className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-white">Guardrails</h3>
          </div>
          <p className="text-sm text-slate-400">
            Guardrails are configured on the backend. The dashboard displays their status
            but cannot modify them directly for security reasons.
          </p>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
