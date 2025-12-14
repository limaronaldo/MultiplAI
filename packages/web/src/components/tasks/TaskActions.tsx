import { useState } from "react";
import { RefreshCw, Play, XCircle, RotateCcw } from "lucide-react";
import type { TaskStatus } from "@autodev/shared";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";

interface TaskActionsProps {
  taskId: string;
  status: TaskStatus;
  onActionComplete?: (action: string, success: boolean, message?: string) => void;
}

type ActionType = "retry" | "rerun" | "cancel" | null;

export function TaskActions({ taskId, status, onActionComplete }: TaskActionsProps) {
  const [loading, setLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ActionType>(null);

  const canRetry = status === "FAILED" || status === "TESTS_FAILED" || status === "REVIEW_REJECTED";
  const canRerun = status === "COMPLETED" || status === "PR_CREATED" || status === "WAITING_HUMAN";
  const canCancel = !["COMPLETED", "FAILED", "WAITING_HUMAN"].includes(status);

  const handleAction = async (action: ActionType) => {
    if (!action) return;

    setLoading(true);
    setConfirmAction(null);

    try {
      let endpoint = "";
      let method = "POST";
      let body: Record<string, unknown> | undefined;

      switch (action) {
        case "retry":
        case "rerun":
          endpoint = `/api/tasks/${taskId}/process`;
          break;
        case "cancel":
          endpoint = `/api/tasks/${taskId}/reject`;
          body = { feedback: "Cancelled by user from dashboard" };
          break;
      }

      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(error.error || `Failed to ${action} task`);
      }

      onActionComplete?.(action, true, `Task ${action} initiated successfully`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      onActionComplete?.(action, false, message);
    } finally {
      setLoading(false);
    }
  };

  const getConfirmConfig = (action: ActionType) => {
    switch (action) {
      case "retry":
        return {
          title: "Retry Task",
          message: "This will attempt to process the task again from its current state. Continue?",
          confirmLabel: "Retry",
          variant: "warning" as const,
        };
      case "rerun":
        return {
          title: "Rerun Task",
          message: "This will process the task again from the beginning. Any existing changes will be replaced. Continue?",
          confirmLabel: "Rerun",
          variant: "warning" as const,
        };
      case "cancel":
        return {
          title: "Cancel Task",
          message: "This will stop the task and mark it as failed. This action cannot be undone. Continue?",
          confirmLabel: "Cancel Task",
          variant: "danger" as const,
        };
      default:
        return null;
    }
  };

  const confirmConfig = getConfirmConfig(confirmAction);

  return (
    <>
      <div className="flex items-center gap-2">
        {canRetry && (
          <button
            onClick={() => setConfirmAction("retry")}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg transition-colors disabled:opacity-50"
            title="Retry failed task"
          >
            <RotateCcw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Retry
          </button>
        )}

        {canRerun && (
          <button
            onClick={() => setConfirmAction("rerun")}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg transition-colors disabled:opacity-50"
            title="Rerun completed task"
          >
            <Play className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Rerun
          </button>
        )}

        {canCancel && (
          <button
            onClick={() => setConfirmAction("cancel")}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
            title="Cancel in-progress task"
          >
            <XCircle className="w-4 h-4" />
            Cancel
          </button>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Processing...
          </div>
        )}
      </div>

      {confirmConfig && (
        <ConfirmDialog
          isOpen={confirmAction !== null}
          title={confirmConfig.title}
          message={confirmConfig.message}
          confirmLabel={confirmConfig.confirmLabel}
          variant={confirmConfig.variant}
          isLoading={loading}
          onConfirm={() => handleAction(confirmAction)}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </>
  );
}
