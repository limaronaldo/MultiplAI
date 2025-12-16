/**
 * Task Timeline / Gantt View Component
 * Issue #348
 */

import { useMemo } from "react";
import { format, differenceInMinutes, parseISO } from "date-fns";
import { useTheme } from "../../contexts/ThemeContext";
import { Clock, CheckCircle, XCircle, Loader2, AlertCircle } from "lucide-react";
import clsx from "clsx";

export interface TaskEvent {
  id: string;
  eventType: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

export interface TimelineTask {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  events?: TaskEvent[];
}

interface TimelineProps {
  task: TimelineTask;
  showDetails?: boolean;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  NEW: { bg: "bg-gray-100 dark:bg-gray-700", text: "text-gray-700 dark:text-gray-300", border: "border-gray-300 dark:border-gray-600" },
  PLANNING: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300", border: "border-blue-300 dark:border-blue-700" },
  PLANNING_DONE: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300", border: "border-blue-300 dark:border-blue-700" },
  CODING: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-300", border: "border-purple-300 dark:border-purple-700" },
  CODING_DONE: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-300", border: "border-purple-300 dark:border-purple-700" },
  TESTING: { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-300", border: "border-yellow-300 dark:border-yellow-700" },
  TESTS_PASSED: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300", border: "border-green-300 dark:border-green-700" },
  TESTS_FAILED: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300", border: "border-red-300 dark:border-red-700" },
  FIXING: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-300", border: "border-orange-300 dark:border-orange-700" },
  REVIEWING: { bg: "bg-indigo-100 dark:bg-indigo-900/30", text: "text-indigo-700 dark:text-indigo-300", border: "border-indigo-300 dark:border-indigo-700" },
  REVIEW_APPROVED: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300", border: "border-green-300 dark:border-green-700" },
  REVIEW_REJECTED: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300", border: "border-red-300 dark:border-red-700" },
  PR_CREATED: { bg: "bg-teal-100 dark:bg-teal-900/30", text: "text-teal-700 dark:text-teal-300", border: "border-teal-300 dark:border-teal-700" },
  WAITING_HUMAN: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-300", border: "border-amber-300 dark:border-amber-700" },
  COMPLETED: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300", border: "border-green-300 dark:border-green-700" },
  FAILED: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300", border: "border-red-300 dark:border-red-700" },
};

const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  COMPLETED: CheckCircle,
  FAILED: XCircle,
  TESTS_PASSED: CheckCircle,
  TESTS_FAILED: XCircle,
  REVIEW_APPROVED: CheckCircle,
  REVIEW_REJECTED: XCircle,
};

function getStatusColor(status: string) {
  return STATUS_COLORS[status] || STATUS_COLORS.NEW;
}

function getStatusIcon(status: string) {
  return STATUS_ICONS[status] || Clock;
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return "< 1m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function TaskTimeline({ task, showDetails = true }: TimelineProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const statusTransitions = useMemo(() => {
    if (!task.events || task.events.length === 0) {
      return [
        {
          status: task.status,
          timestamp: task.createdAt,
          duration: differenceInMinutes(parseISO(task.updatedAt), parseISO(task.createdAt)),
          isCurrent: true,
        },
      ];
    }

    // Extract status changes from events
    const transitions: Array<{
      status: string;
      timestamp: string;
      duration: number;
      details?: string;
      isCurrent: boolean;
    }> = [];

    const statusEvents = task.events
      .filter((e) => e.eventType === "STATUS_CHANGE" || e.eventType.includes("_DONE") || e.eventType.includes("_STARTED"))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // Add initial NEW status
    transitions.push({
      status: "NEW",
      timestamp: task.createdAt,
      duration: 0,
      isCurrent: false,
    });

    statusEvents.forEach((event, index) => {
      const status = (event.payload?.status as string) || event.eventType.replace("_STARTED", "").replace("_DONE", "_DONE");
      const nextEvent = statusEvents[index + 1];
      const endTime = nextEvent ? parseISO(nextEvent.createdAt) : parseISO(task.updatedAt);
      const startTime = parseISO(event.createdAt);

      transitions.push({
        status,
        timestamp: event.createdAt,
        duration: differenceInMinutes(endTime, startTime),
        details: event.payload?.message as string,
        isCurrent: !nextEvent && task.status === status,
      });
    });

    // Ensure current status is shown
    if (transitions.length > 0 && transitions[transitions.length - 1].status !== task.status) {
      transitions.push({
        status: task.status,
        timestamp: task.updatedAt,
        duration: 0,
        isCurrent: true,
      });
    }

    return transitions;
  }, [task]);

  const totalDuration = useMemo(() => {
    return differenceInMinutes(parseISO(task.updatedAt), parseISO(task.createdAt));
  }, [task]);

  return (
    <div className={clsx("rounded-lg border p-4", isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200")}>
      <div className="flex items-center justify-between mb-4">
        <h3 className={clsx("text-lg font-semibold", isDark ? "text-white" : "text-gray-900")}>
          Task Timeline
        </h3>
        <div className={clsx("flex items-center gap-2 text-sm", isDark ? "text-gray-400" : "text-gray-500")}>
          <Clock className="w-4 h-4" />
          <span>Total: {formatDuration(totalDuration)}</span>
        </div>
      </div>

      {/* Gantt-style bar */}
      <div className="mb-6">
        <div className={clsx("h-8 rounded-lg overflow-hidden flex", isDark ? "bg-gray-700" : "bg-gray-100")}>
          {statusTransitions.map((transition, index) => {
            const width = totalDuration > 0 ? (transition.duration / totalDuration) * 100 : 100 / statusTransitions.length;
            const colors = getStatusColor(transition.status);

            return (
              <div
                key={index}
                className={clsx(
                  "h-full flex items-center justify-center text-xs font-medium transition-all",
                  colors.bg,
                  colors.text,
                  transition.isCurrent && "animate-pulse"
                )}
                style={{ width: `${Math.max(width, 5)}%` }}
                title={`${transition.status}: ${formatDuration(transition.duration)}`}
              >
                {width > 15 && transition.status.replace(/_/g, " ")}
              </div>
            );
          })}
        </div>
      </div>

      {/* Timeline list */}
      {showDetails && (
        <div className="relative">
          <div
            className={clsx(
              "absolute left-4 top-0 bottom-0 w-0.5",
              isDark ? "bg-gray-700" : "bg-gray-200"
            )}
          />

          <div className="space-y-4">
            {statusTransitions.map((transition, index) => {
              const colors = getStatusColor(transition.status);
              const Icon = getStatusIcon(transition.status);
              const isLast = index === statusTransitions.length - 1;

              return (
                <div key={index} className="relative flex items-start gap-4 pl-8">
                  {/* Timeline dot */}
                  <div
                    className={clsx(
                      "absolute left-2.5 w-3 h-3 rounded-full border-2 -translate-x-1/2",
                      colors.bg,
                      colors.border,
                      transition.isCurrent && "ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-gray-800"
                    )}
                  />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Icon className={clsx("w-4 h-4", colors.text)} />
                      <span className={clsx("font-medium", colors.text)}>
                        {transition.status.replace(/_/g, " ")}
                      </span>
                      {transition.isCurrent && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Current
                        </span>
                      )}
                    </div>

                    <div className={clsx("flex items-center gap-4 mt-1 text-sm", isDark ? "text-gray-400" : "text-gray-500")}>
                      <span>{format(parseISO(transition.timestamp), "MMM d, HH:mm:ss")}</span>
                      {transition.duration > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDuration(transition.duration)}
                        </span>
                      )}
                    </div>

                    {transition.details && (
                      <p className={clsx("mt-1 text-sm", isDark ? "text-gray-400" : "text-gray-600")}>
                        {transition.details}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Compact horizontal timeline for task cards
export function TaskTimelineCompact({ task }: { task: TimelineTask }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const duration = differenceInMinutes(parseISO(task.updatedAt), parseISO(task.createdAt));
  const colors = getStatusColor(task.status);

  return (
    <div className="flex items-center gap-2">
      <div className={clsx("flex-1 h-1.5 rounded-full overflow-hidden", isDark ? "bg-gray-700" : "bg-gray-200")}>
        <div
          className={clsx("h-full rounded-full", colors.bg)}
          style={{ width: task.status === "COMPLETED" || task.status === "FAILED" ? "100%" : "50%" }}
        />
      </div>
      <span className={clsx("text-xs whitespace-nowrap", isDark ? "text-gray-400" : "text-gray-500")}>
        {formatDuration(duration)}
      </span>
    </div>
  );
}
