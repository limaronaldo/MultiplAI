import { useState } from "react";
import {
  Monitor,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Image,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertTriangle,
  Eye,
  X,
} from "lucide-react";

// Types matching backend CUA types
interface VisualTestCase {
  id: string;
  name: string;
  goal: string;
  expectedOutcome?: string;
}

interface VisualTestResult {
  testCase: VisualTestCase;
  passed: boolean;
  screenshots: string[];
  executionTime: number;
  error?: string;
}

interface VisualTestRun {
  id: string;
  taskId?: string;
  appUrl: string;
  testCases: VisualTestCase[];
  results: VisualTestResult[];
  status: "running" | "passed" | "failed" | "error";
  passRate: number;
  startedAt: string;
  completedAt?: string;
}

interface VisualTestPanelProps {
  taskId: string;
  testRun?: VisualTestRun | null;
  onRunTests?: () => Promise<void>;
  isRunning?: boolean;
  className?: string;
}

export function VisualTestPanel({
  taskId,
  testRun,
  onRunTests,
  isRunning = false,
  className = "",
}: VisualTestPanelProps) {
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);

  const toggleTest = (testId: string) => {
    setExpandedTests((prev) => {
      const next = new Set(prev);
      if (next.has(testId)) {
        next.delete(testId);
      } else {
        next.add(testId);
      }
      return next;
    });
  };

  const getStatusIcon = (status: VisualTestRun["status"]) => {
    switch (status) {
      case "passed":
        return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
      case "failed":
        return <XCircle className="w-5 h-5 text-red-400" />;
      case "running":
        return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
      case "error":
        return <AlertTriangle className="w-5 h-5 text-amber-400" />;
    }
  };

  const getStatusColor = (status: VisualTestRun["status"]) => {
    switch (status) {
      case "passed":
        return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
      case "failed":
        return "text-red-400 bg-red-500/10 border-red-500/30";
      case "running":
        return "text-blue-400 bg-blue-500/10 border-blue-500/30";
      case "error":
        return "text-amber-400 bg-amber-500/10 border-amber-500/30";
    }
  };

  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-xl ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-white">App Testing</span>
          {testRun && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full border ${getStatusColor(testRun.status)}`}
            >
              {testRun.status === "running"
                ? "Running..."
                : `${Math.round(testRun.passRate)}% passed`}
            </span>
          )}
        </div>
        {onRunTests && (
          <button
            onClick={onRunTests}
            disabled={isRunning}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
              ${
                isRunning
                  ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                  : "bg-purple-600 text-white hover:bg-purple-700"
              }
            `}
          >
            {isRunning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                Run Tests
              </>
            )}
          </button>
        )}
      </div>

      {/* Content */}
      {!testRun ? (
        <div className="px-4 py-8 text-center">
          <Monitor className="w-10 h-10 mx-auto mb-3 text-slate-600" />
          <p className="text-sm text-slate-400">No visual tests run yet</p>
          <p className="text-xs text-slate-500 mt-1">
            Run tests to verify your changes visually
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-800">
          {/* Summary */}
          <div className="px-4 py-3 bg-slate-800/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getStatusIcon(testRun.status)}
                <div>
                  <p className="text-sm font-medium text-white">
                    {testRun.results.filter((r) => r.passed).length} of{" "}
                    {testRun.results.length} tests passed
                  </p>
                  <p className="text-xs text-slate-400">{testRun.appUrl}</p>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 text-xs text-slate-400">
                  <Clock className="w-3.5 h-3.5" />
                  {testRun.completedAt
                    ? `${((new Date(testRun.completedAt).getTime() - new Date(testRun.startedAt).getTime()) / 1000).toFixed(1)}s`
                    : "Running..."}
                </div>
              </div>
            </div>

            {/* Pass rate bar */}
            <div className="mt-3 w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  testRun.passRate >= 80
                    ? "bg-emerald-500"
                    : testRun.passRate >= 50
                      ? "bg-amber-500"
                      : "bg-red-500"
                }`}
                style={{ width: `${testRun.passRate}%` }}
              />
            </div>
          </div>

          {/* Test Results */}
          <div className="max-h-80 overflow-y-auto">
            {testRun.results.map((result) => (
              <div
                key={result.testCase.id}
                className="border-b border-slate-800/50 last:border-b-0"
              >
                {/* Test header */}
                <button
                  onClick={() => toggleTest(result.testCase.id)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-800/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {expandedTests.has(result.testCase.id) ? (
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-500" />
                    )}
                    {result.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400" />
                    )}
                    <span className="text-sm text-white">
                      {result.testCase.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>{(result.executionTime / 1000).toFixed(1)}s</span>
                    {result.screenshots.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Image className="w-3.5 h-3.5" />
                        {result.screenshots.length}
                      </span>
                    )}
                  </div>
                </button>

                {/* Test details */}
                {expandedTests.has(result.testCase.id) && (
                  <div className="px-4 pb-3 pl-11">
                    <p className="text-xs text-slate-400 mb-2">
                      <span className="text-slate-500">Goal:</span>{" "}
                      {result.testCase.goal}
                    </p>
                    {result.testCase.expectedOutcome && (
                      <p className="text-xs text-slate-400 mb-2">
                        <span className="text-slate-500">Expected:</span>{" "}
                        {result.testCase.expectedOutcome}
                      </p>
                    )}
                    {result.error && (
                      <p className="text-xs text-red-400 mb-2 bg-red-500/10 px-2 py-1 rounded">
                        {result.error}
                      </p>
                    )}

                    {/* Screenshots */}
                    {result.screenshots.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-slate-500 mb-1.5">
                          Screenshots
                        </p>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {result.screenshots.map((screenshot, idx) => (
                            <button
                              key={idx}
                              onClick={() => setSelectedScreenshot(screenshot)}
                              className="flex-shrink-0 w-24 h-16 rounded border border-slate-700 overflow-hidden hover:border-purple-500 transition-colors"
                            >
                              <img
                                src={screenshot}
                                alt={`Screenshot ${idx + 1}`}
                                className="w-full h-full object-cover"
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Screenshot Modal */}
      {selectedScreenshot && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
          onClick={() => setSelectedScreenshot(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] m-4">
            <button
              onClick={() => setSelectedScreenshot(null)}
              className="absolute -top-10 right-0 text-white hover:text-slate-300 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={selectedScreenshot}
              alt="Screenshot"
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
