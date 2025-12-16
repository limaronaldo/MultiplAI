/**
 * Dashboard Customization and Layout Persistence
 * Issue #359
 */

import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { GripVertical, Eye, EyeOff, Settings, X, RotateCcw, Save, Layout } from "lucide-react";
import clsx from "clsx";

// Widget definitions
export interface DashboardWidget {
  id: string;
  title: string;
  description?: string;
  defaultVisible: boolean;
  defaultSize: "small" | "medium" | "large" | "full";
  minSize?: "small" | "medium" | "large";
  category: "stats" | "charts" | "lists" | "other";
}

export interface WidgetLayout {
  id: string;
  visible: boolean;
  size: "small" | "medium" | "large" | "full";
  order: number;
}

export interface DashboardLayoutConfig {
  widgets: WidgetLayout[];
  compactMode: boolean;
  autoRefresh: boolean;
  refreshInterval: number; // seconds
}

const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: "stats-summary", title: "Summary Stats", description: "Total, completed, failed tasks", defaultVisible: true, defaultSize: "full", category: "stats" },
  { id: "success-rate", title: "Success Rate", description: "Overall success percentage", defaultVisible: true, defaultSize: "small", category: "stats" },
  { id: "tasks-chart", title: "Tasks Over Time", description: "Line chart of task completion", defaultVisible: true, defaultSize: "large", category: "charts" },
  { id: "cost-chart", title: "Cost Breakdown", description: "Cost by model/agent", defaultVisible: true, defaultSize: "medium", category: "charts" },
  { id: "model-comparison", title: "Model Comparison", description: "Compare model performance", defaultVisible: false, defaultSize: "large", category: "charts" },
  { id: "recent-tasks", title: "Recent Tasks", description: "Latest task activity", defaultVisible: true, defaultSize: "medium", category: "lists" },
  { id: "active-jobs", title: "Active Jobs", description: "Currently running jobs", defaultVisible: true, defaultSize: "medium", category: "lists" },
  { id: "pending-review", title: "Pending Review", description: "Tasks awaiting human review", defaultVisible: false, defaultSize: "medium", category: "lists" },
  { id: "top-repos", title: "Top Repositories", description: "Most active repositories", defaultVisible: false, defaultSize: "small", category: "stats" },
  { id: "processing-time", title: "Processing Time", description: "Average task duration", defaultVisible: false, defaultSize: "small", category: "stats" },
];

const DEFAULT_CONFIG: DashboardLayoutConfig = {
  widgets: DEFAULT_WIDGETS.map((w, i) => ({
    id: w.id,
    visible: w.defaultVisible,
    size: w.defaultSize,
    order: i,
  })),
  compactMode: false,
  autoRefresh: true,
  refreshInterval: 30,
};

// Context for dashboard customization
interface DashboardCustomizationContextType {
  config: DashboardLayoutConfig;
  widgets: DashboardWidget[];
  updateWidgetVisibility: (id: string, visible: boolean) => void;
  updateWidgetSize: (id: string, size: WidgetLayout["size"]) => void;
  updateWidgetOrder: (widgets: WidgetLayout[]) => void;
  setCompactMode: (compact: boolean) => void;
  setAutoRefresh: (enabled: boolean) => void;
  setRefreshInterval: (seconds: number) => void;
  resetToDefaults: () => void;
  isCustomizing: boolean;
  setIsCustomizing: (customizing: boolean) => void;
}

const DashboardCustomizationContext = createContext<DashboardCustomizationContextType | undefined>(undefined);

export function useDashboardCustomization() {
  const context = useContext(DashboardCustomizationContext);
  if (!context) {
    throw new Error("useDashboardCustomization must be used within DashboardCustomizationProvider");
  }
  return context;
}

export function DashboardCustomizationProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<DashboardLayoutConfig>(() => {
    const stored = localStorage.getItem("dashboardConfig");
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return DEFAULT_CONFIG;
      }
    }
    return DEFAULT_CONFIG;
  });
  const [isCustomizing, setIsCustomizing] = useState(false);

  // Persist config changes
  useEffect(() => {
    localStorage.setItem("dashboardConfig", JSON.stringify(config));
  }, [config]);

  const updateWidgetVisibility = useCallback((id: string, visible: boolean) => {
    setConfig((prev) => ({
      ...prev,
      widgets: prev.widgets.map((w) => (w.id === id ? { ...w, visible } : w)),
    }));
  }, []);

  const updateWidgetSize = useCallback((id: string, size: WidgetLayout["size"]) => {
    setConfig((prev) => ({
      ...prev,
      widgets: prev.widgets.map((w) => (w.id === id ? { ...w, size } : w)),
    }));
  }, []);

  const updateWidgetOrder = useCallback((widgets: WidgetLayout[]) => {
    setConfig((prev) => ({ ...prev, widgets }));
  }, []);

  const setCompactMode = useCallback((compactMode: boolean) => {
    setConfig((prev) => ({ ...prev, compactMode }));
  }, []);

  const setAutoRefresh = useCallback((autoRefresh: boolean) => {
    setConfig((prev) => ({ ...prev, autoRefresh }));
  }, []);

  const setRefreshInterval = useCallback((refreshInterval: number) => {
    setConfig((prev) => ({ ...prev, refreshInterval }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setConfig(DEFAULT_CONFIG);
  }, []);

  return (
    <DashboardCustomizationContext.Provider
      value={{
        config,
        widgets: DEFAULT_WIDGETS,
        updateWidgetVisibility,
        updateWidgetSize,
        updateWidgetOrder,
        setCompactMode,
        setAutoRefresh,
        setRefreshInterval,
        resetToDefaults,
        isCustomizing,
        setIsCustomizing,
      }}
    >
      {children}
    </DashboardCustomizationContext.Provider>
  );
}

// Customization panel/modal
export function CustomizationPanel({ onClose }: { onClose: () => void }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const {
    config,
    widgets,
    updateWidgetVisibility,
    updateWidgetSize,
    setCompactMode,
    setAutoRefresh,
    setRefreshInterval,
    resetToDefaults,
  } = useDashboardCustomization();

  const categories = ["stats", "charts", "lists", "other"] as const;
  const categoryLabels: Record<typeof categories[number], string> = {
    stats: "Statistics",
    charts: "Charts",
    lists: "Lists",
    other: "Other",
  };

  const sizeOptions: { value: WidgetLayout["size"]; label: string }[] = [
    { value: "small", label: "S" },
    { value: "medium", label: "M" },
    { value: "large", label: "L" },
    { value: "full", label: "Full" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div
        className={clsx(
          "relative w-full max-w-2xl max-h-[80vh] rounded-lg border shadow-xl overflow-hidden",
          isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
        )}
      >
        {/* Header */}
        <div className={clsx("flex items-center justify-between px-6 py-4 border-b", isDark ? "border-gray-700" : "border-gray-200")}>
          <div className="flex items-center gap-3">
            <Layout className={clsx("w-5 h-5", isDark ? "text-blue-400" : "text-blue-500")} />
            <h2 className={clsx("text-lg font-semibold", isDark ? "text-white" : "text-gray-900")}>
              Customize Dashboard
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resetToDefaults}
              className={clsx(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors",
                isDark ? "text-gray-400 hover:bg-gray-700" : "text-gray-600 hover:bg-gray-100"
              )}
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
            <button onClick={onClose} className={clsx("p-2 rounded-lg", isDark ? "hover:bg-gray-700" : "hover:bg-gray-100")}>
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[60vh] px-6 py-4 space-y-6">
          {/* General settings */}
          <div>
            <h3 className={clsx("text-sm font-medium mb-3", isDark ? "text-gray-200" : "text-gray-700")}>
              General Settings
            </h3>
            <div className="space-y-3">
              <label className="flex items-center justify-between">
                <span className={clsx("text-sm", isDark ? "text-gray-300" : "text-gray-600")}>Compact mode</span>
                <button
                  onClick={() => setCompactMode(!config.compactMode)}
                  className={clsx(
                    "relative w-10 h-6 rounded-full transition-colors",
                    config.compactMode ? "bg-blue-500" : isDark ? "bg-gray-600" : "bg-gray-300"
                  )}
                >
                  <span
                    className={clsx(
                      "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                      config.compactMode ? "translate-x-5" : "translate-x-1"
                    )}
                  />
                </button>
              </label>
              <label className="flex items-center justify-between">
                <span className={clsx("text-sm", isDark ? "text-gray-300" : "text-gray-600")}>Auto refresh</span>
                <button
                  onClick={() => setAutoRefresh(!config.autoRefresh)}
                  className={clsx(
                    "relative w-10 h-6 rounded-full transition-colors",
                    config.autoRefresh ? "bg-blue-500" : isDark ? "bg-gray-600" : "bg-gray-300"
                  )}
                >
                  <span
                    className={clsx(
                      "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                      config.autoRefresh ? "translate-x-5" : "translate-x-1"
                    )}
                  />
                </button>
              </label>
              {config.autoRefresh && (
                <label className="flex items-center justify-between">
                  <span className={clsx("text-sm", isDark ? "text-gray-300" : "text-gray-600")}>Refresh interval</span>
                  <select
                    value={config.refreshInterval}
                    onChange={(e) => setRefreshInterval(parseInt(e.target.value))}
                    className={clsx(
                      "px-3 py-1.5 rounded-lg text-sm border",
                      isDark ? "bg-gray-700 border-gray-600 text-white" : "bg-white border-gray-300 text-gray-900"
                    )}
                  >
                    <option value={10}>10 seconds</option>
                    <option value={30}>30 seconds</option>
                    <option value={60}>1 minute</option>
                    <option value={300}>5 minutes</option>
                  </select>
                </label>
              )}
            </div>
          </div>

          {/* Widget visibility and size */}
          {categories.map((category) => {
            const categoryWidgets = widgets.filter((w) => w.category === category);
            if (categoryWidgets.length === 0) return null;

            return (
              <div key={category}>
                <h3 className={clsx("text-sm font-medium mb-3", isDark ? "text-gray-200" : "text-gray-700")}>
                  {categoryLabels[category]}
                </h3>
                <div className="space-y-2">
                  {categoryWidgets.map((widget) => {
                    const layout = config.widgets.find((w) => w.id === widget.id);
                    const isVisible = layout?.visible ?? widget.defaultVisible;
                    const size = layout?.size ?? widget.defaultSize;

                    return (
                      <div
                        key={widget.id}
                        className={clsx(
                          "flex items-center justify-between p-3 rounded-lg border",
                          isDark ? "bg-gray-900/50 border-gray-700" : "bg-gray-50 border-gray-200"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => updateWidgetVisibility(widget.id, !isVisible)}
                            className={clsx("p-1 rounded", isVisible ? "text-blue-500" : "text-gray-400")}
                          >
                            {isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                          </button>
                          <div>
                            <p className={clsx("text-sm font-medium", isDark ? "text-white" : "text-gray-900")}>
                              {widget.title}
                            </p>
                            {widget.description && (
                              <p className={clsx("text-xs", isDark ? "text-gray-400" : "text-gray-500")}>
                                {widget.description}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {sizeOptions.map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => updateWidgetSize(widget.id, opt.value)}
                              disabled={!isVisible}
                              className={clsx(
                                "px-2 py-1 text-xs rounded transition-colors",
                                size === opt.value
                                  ? "bg-blue-500 text-white"
                                  : isDark
                                  ? "bg-gray-700 text-gray-400 hover:bg-gray-600"
                                  : "bg-gray-200 text-gray-600 hover:bg-gray-300",
                                !isVisible && "opacity-50 cursor-not-allowed"
                              )}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className={clsx("flex items-center justify-end gap-3 px-6 py-4 border-t", isDark ? "border-gray-700" : "border-gray-200")}>
          <button
            onClick={onClose}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              "bg-blue-500 hover:bg-blue-600 text-white"
            )}
          >
            <Save className="w-4 h-4" />
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// Customize button for dashboard header
export function CustomizeButton() {
  const { setIsCustomizing } = useDashboardCustomization();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      onClick={() => setIsCustomizing(true)}
      className={clsx(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors",
        isDark ? "text-gray-400 hover:bg-gray-700" : "text-gray-600 hover:bg-gray-100"
      )}
    >
      <Settings className="w-4 h-4" />
      <span className="hidden sm:inline">Customize</span>
    </button>
  );
}

// Widget wrapper that applies size classes
export function DashboardWidget({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const { config, isCustomizing } = useDashboardCustomization();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const layout = config.widgets.find((w) => w.id === id);
  if (!layout?.visible) return null;

  const sizeClasses = {
    small: "col-span-1",
    medium: "col-span-1 lg:col-span-2",
    large: "col-span-1 lg:col-span-3",
    full: "col-span-full",
  };

  return (
    <div
      className={clsx(
        sizeClasses[layout.size],
        isCustomizing && "ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-900",
        className
      )}
    >
      {isCustomizing && (
        <div className={clsx("flex items-center gap-2 mb-2 px-2 py-1 rounded text-xs", isDark ? "bg-blue-900/30 text-blue-400" : "bg-blue-100 text-blue-600")}>
          <GripVertical className="w-3 h-3" />
          <span>Drag to reorder</span>
        </div>
      )}
      {children}
    </div>
  );
}
