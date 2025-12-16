/**
 * Interactive Chart Component with zoom and filtering
 * Issue #347
 */

import { useState, useCallback, useMemo } from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Brush,
  ReferenceLine,
} from "recharts";
import { useTheme } from "../../contexts/ThemeContext";
import { ZoomIn, ZoomOut, RotateCcw, Download } from "lucide-react";
import clsx from "clsx";

export interface ChartDataPoint {
  date: string;
  [key: string]: string | number;
}

export interface ChartSeries {
  dataKey: string;
  name: string;
  color: string;
  type?: "line" | "area" | "bar";
  hidden?: boolean;
}

export interface InteractiveChartProps {
  data: ChartDataPoint[];
  series: ChartSeries[];
  title?: string;
  subtitle?: string;
  height?: number;
  showBrush?: boolean;
  showLegend?: boolean;
  showGrid?: boolean;
  xAxisKey?: string;
  yAxisLabel?: string;
  referenceLines?: { value: number; label: string; color: string }[];
  onExport?: (format: "png" | "csv") => void;
}

export function InteractiveChart({
  data,
  series,
  title,
  subtitle,
  height = 300,
  showBrush = true,
  showLegend = true,
  showGrid = true,
  xAxisKey = "date",
  yAxisLabel,
  referenceLines = [],
  onExport,
}: InteractiveChartProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [visibleSeries, setVisibleSeries] = useState<Set<string>>(
    new Set(series.filter((s) => !s.hidden).map((s) => s.dataKey))
  );
  const [zoomDomain, setZoomDomain] = useState<[number, number] | null>(null);

  const colors = useMemo(
    () => ({
      grid: isDark ? "#374151" : "#e5e7eb",
      text: isDark ? "#9ca3af" : "#6b7280",
      tooltip: {
        bg: isDark ? "#1f2937" : "#ffffff",
        border: isDark ? "#374151" : "#e5e7eb",
        text: isDark ? "#f3f4f6" : "#111827",
      },
    }),
    [isDark]
  );

  const toggleSeries = useCallback((dataKey: string) => {
    setVisibleSeries((prev) => {
      const next = new Set(prev);
      if (next.has(dataKey)) {
        next.delete(dataKey);
      } else {
        next.add(dataKey);
      }
      return next;
    });
  }, []);

  const resetZoom = useCallback(() => {
    setZoomDomain(null);
  }, []);

  const handleBrushChange = useCallback(
    (domain: { startIndex?: number; endIndex?: number }) => {
      if (domain.startIndex !== undefined && domain.endIndex !== undefined) {
        setZoomDomain([domain.startIndex, domain.endIndex]);
      }
    },
    []
  );

  const filteredData = useMemo(() => {
    if (!zoomDomain) return data;
    return data.slice(zoomDomain[0], zoomDomain[1] + 1);
  }, [data, zoomDomain]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload) return null;

    return (
      <div
        className={clsx(
          "rounded-lg border p-3 shadow-lg",
          isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
        )}
      >
        <p className={clsx("font-medium mb-2", isDark ? "text-gray-200" : "text-gray-900")}>
          {label}
        </p>
        {payload.map((entry: any, index: number) => (
          <p
            key={index}
            className="text-sm flex items-center gap-2"
            style={{ color: entry.color }}
          >
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span>{entry.name}:</span>
            <span className="font-medium">{entry.value}</span>
          </p>
        ))}
      </div>
    );
  };

  const renderChart = () => {
    const chartType = series[0]?.type || "line";
    const commonProps = {
      data: filteredData,
      margin: { top: 10, right: 30, left: 0, bottom: 0 },
    };

    const renderSeries = () =>
      series
        .filter((s) => visibleSeries.has(s.dataKey))
        .map((s) => {
          const props = {
            key: s.dataKey,
            type: "monotone" as const,
            dataKey: s.dataKey,
            name: s.name,
            stroke: s.color,
            fill: s.color,
            strokeWidth: 2,
            dot: false,
            activeDot: { r: 6, strokeWidth: 2 },
          };

          if (s.type === "area" || chartType === "area") {
            return <Area {...props} fillOpacity={0.3} />;
          }
          if (s.type === "bar" || chartType === "bar") {
            return <Bar {...props} />;
          }
          return <Line {...props} />;
        });

    const ChartComponent =
      chartType === "area" ? AreaChart : chartType === "bar" ? BarChart : LineChart;

    return (
      <ChartComponent {...commonProps}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />}
        <XAxis
          dataKey={xAxisKey}
          stroke={colors.text}
          tick={{ fill: colors.text, fontSize: 12 }}
          tickLine={{ stroke: colors.grid }}
        />
        <YAxis
          stroke={colors.text}
          tick={{ fill: colors.text, fontSize: 12 }}
          tickLine={{ stroke: colors.grid }}
          label={
            yAxisLabel
              ? {
                  value: yAxisLabel,
                  angle: -90,
                  position: "insideLeft",
                  fill: colors.text,
                }
              : undefined
          }
        />
        <Tooltip content={<CustomTooltip />} />
        {showLegend && (
          <Legend
            onClick={(e) => toggleSeries(e.dataKey as string)}
            wrapperStyle={{ cursor: "pointer" }}
          />
        )}
        {renderSeries()}
        {referenceLines.map((ref, i) => (
          <ReferenceLine
            key={i}
            y={ref.value}
            label={ref.label}
            stroke={ref.color}
            strokeDasharray="5 5"
          />
        ))}
        {showBrush && data.length > 10 && (
          <Brush
            dataKey={xAxisKey}
            height={30}
            stroke={isDark ? "#4b5563" : "#9ca3af"}
            fill={isDark ? "#1f2937" : "#f3f4f6"}
            onChange={handleBrushChange}
          />
        )}
      </ChartComponent>
    );
  };

  return (
    <div
      className={clsx(
        "rounded-lg border p-4",
        isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
      )}
    >
      {(title || subtitle) && (
        <div className="mb-4 flex items-start justify-between">
          <div>
            {title && (
              <h3 className={clsx("text-lg font-semibold", isDark ? "text-white" : "text-gray-900")}>
                {title}
              </h3>
            )}
            {subtitle && (
              <p className={clsx("text-sm", isDark ? "text-gray-400" : "text-gray-500")}>
                {subtitle}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {zoomDomain && (
              <button
                onClick={resetZoom}
                className={clsx(
                  "p-1.5 rounded-md transition-colors",
                  isDark
                    ? "hover:bg-gray-700 text-gray-400"
                    : "hover:bg-gray-100 text-gray-500"
                )}
                title="Reset zoom"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            {onExport && (
              <button
                onClick={() => onExport("png")}
                className={clsx(
                  "p-1.5 rounded-md transition-colors",
                  isDark
                    ? "hover:bg-gray-700 text-gray-400"
                    : "hover:bg-gray-100 text-gray-500"
                )}
                title="Export chart"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Series toggles */}
      <div className="flex flex-wrap gap-2 mb-4">
        {series.map((s) => (
          <button
            key={s.dataKey}
            onClick={() => toggleSeries(s.dataKey)}
            className={clsx(
              "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all",
              visibleSeries.has(s.dataKey)
                ? "opacity-100"
                : "opacity-50 line-through"
            )}
            style={{
              backgroundColor: visibleSeries.has(s.dataKey)
                ? `${s.color}20`
                : isDark
                ? "#374151"
                : "#e5e7eb",
              color: visibleSeries.has(s.dataKey)
                ? s.color
                : isDark
                ? "#9ca3af"
                : "#6b7280",
            }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            {s.name}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={height}>
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
}
