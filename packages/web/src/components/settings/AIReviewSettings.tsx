import { useState, useEffect } from "react";
import { Bot, ExternalLink, RefreshCw, CheckCircle, XCircle } from "lucide-react";
import clsx from "clsx";

interface AIReviewConfig {
  copilotEnabled: boolean;
  codexEnabled: boolean;
  julesEnabled: boolean;
}

export function AIReviewSettings() {
  const [config, setConfig] = useState<AIReviewConfig>({
    copilotEnabled: true,
    codexEnabled: true,
    julesEnabled: true,
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load config from localStorage (workflow uses GitHub variables)
  useEffect(() => {
    const stored = localStorage.getItem("ai-review-config");
    if (stored) {
      try {
        setConfig(JSON.parse(stored));
      } catch {
        // ignore
      }
    }
  }, []);

  const handleToggle = (key: keyof AIReviewConfig) => {
    const newConfig = { ...config, [key]: !config[key] };
    setConfig(newConfig);
    localStorage.setItem("ai-review-config", JSON.stringify(newConfig));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const agents = [
    {
      id: "copilotEnabled" as const,
      name: "GitHub Copilot",
      description: "Automatic code review via repo rulesets",
      icon: "🔷",
      docsUrl: "https://docs.github.com/en/copilot/using-github-copilot/code-review",
      setupNote: "Enable in repo Settings → Rules → Rulesets",
    },
    {
      id: "codexEnabled" as const,
      name: "OpenAI Codex",
      description: "Security, API contracts, downstream impact",
      icon: "🟢",
      docsUrl: "https://codex.openai.com",
      setupNote: "Connect via codex.openai.com",
    },
    {
      id: "julesEnabled" as const,
      name: "Google Jules",
      description: "Correctness, alternatives, improvements",
      icon: "🔴",
      docsUrl: "https://jules.google",
      setupNote: "Enable Reactive Mode via @Jules mention",
    },
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Bot className="w-6 h-6 text-blue-400" />
          <div>
            <h2 className="text-lg font-semibold text-white">AI Super Review</h2>
            <p className="text-sm text-slate-400">
              Multi-agent PR review with Copilot, Codex, and Jules
            </p>
          </div>
        </div>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-emerald-400">
            <CheckCircle className="w-4 h-4" />
            Saved
          </span>
        )}
      </div>

      <div className="space-y-4">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className={clsx(
              "flex items-center justify-between p-4 rounded-lg border transition-colors",
              config[agent.id]
                ? "bg-slate-800/50 border-slate-700"
                : "bg-slate-900 border-slate-800 opacity-60"
            )}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{agent.icon}</span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-white">{agent.name}</h3>
                  <a
                    href={agent.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-500 hover:text-blue-400"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <p className="text-sm text-slate-400">{agent.description}</p>
                <p className="text-xs text-slate-500 mt-1">{agent.setupNote}</p>
              </div>
            </div>

            <button
              onClick={() => handleToggle(agent.id)}
              disabled={loading}
              className={clsx(
                "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                config[agent.id] ? "bg-blue-500" : "bg-slate-700"
              )}
            >
              <span
                className={clsx(
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                  config[agent.id] ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 bg-slate-800/50 rounded-lg">
        <h4 className="text-sm font-medium text-white mb-2">Workflow Commands</h4>
        <div className="space-y-1 text-sm text-slate-400">
          <p>
            <code className="text-blue-400">/ai rerun</code> - Retrigger Codex + Jules for latest commits
          </p>
          <p>
            <code className="text-blue-400">/ai finalize</code> - Complete the AI Super Review check
          </p>
        </div>
      </div>

      <div className="mt-4 text-xs text-slate-500">
        <p>
          Note: These settings are stored locally. To fully enable/disable agents, set{" "}
          <code className="text-slate-400">CODEX_ENABLED</code> and{" "}
          <code className="text-slate-400">JULES_ENABLED</code> as repository variables in GitHub.
        </p>
      </div>
    </div>
  );
}
