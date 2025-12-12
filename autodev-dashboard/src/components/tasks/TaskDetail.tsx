import React from "react";
import { FileCode, CheckCircle, ListChecks } from "lucide-react";
import { useTask } from "@/hooks";
import { SlideOutPanel } from "@/components/ui/SlideOutPanel";
import { TaskDetailHeader } from "./TaskDetailHeader";

interface TaskDetailProps {
  taskId: string | null;
  onClose: () => void;
}

function LoadingState() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 bg-slate-800 rounded w-3/4" />
      <div className="h-4 bg-slate-800 rounded w-1/2" />
      <div className="h-24 bg-slate-800 rounded" />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="text-center py-8">
      <p className="text-red-400">Failed to load task</p>
      <p className="text-sm text-slate-500 mt-2">{message}</p>
    </div>
  );
}

export function TaskDetail({ taskId, onClose }: TaskDetailProps) {
  const { task, isLoading, error } = useTask(taskId, true);

  const isOpen = taskId !== null;
  const title = task ? `Task: #${task.github_issue_number}` : "Task Details";

  return (
    <SlideOutPanel isOpen={isOpen} onClose={onClose} title={title}>
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : task ? (
        <div className="space-y-6">
          {/* Header */}
          <TaskDetailHeader task={task} />

          {/* Definition of Done */}
          {task.definition_of_done && task.definition_of_done.length > 0 && (
            <Section title="Definition of Done" icon={CheckCircle}>
              <ul className="space-y-2">
                {task.definition_of_done.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="text-emerald-400 mt-0.5">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Plan */}
          {task.plan && task.plan.length > 0 && (
            <Section title="Implementation Plan" icon={ListChecks}>
              <ol className="space-y-2 list-decimal list-inside">
                {task.plan.map((step, i) => (
                  <li key={i} className="text-sm text-slate-300">
                    {step}
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {/* Target Files */}
          {task.target_files && task.target_files.length > 0 && (
            <Section title="Target Files" icon={FileCode}>
              <div className="flex flex-wrap gap-2">
                {task.target_files.map((file, i) => (
                  <code
                    key={i}
                    className="text-xs text-slate-300 bg-slate-800 px-2 py-1 rounded border border-slate-700"
                  >
                    {file}
                  </code>
                ))}
              </div>
            </Section>
          )}

          {/* Current Diff */}
          {task.current_diff && (
            <Section title="Current Diff" icon={FileCode}>
              <pre className="text-xs text-slate-300 bg-slate-950 p-4 rounded-lg overflow-x-auto border border-slate-800 max-h-96">
                {task.current_diff}
              </pre>
            </Section>
          )}
        </div>
      ) : null}
    </SlideOutPanel>
  );
}

interface SectionProps {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}

function Section({ title, icon: Icon, children }: SectionProps) {
  return (
    <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-800">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
        <Icon className="w-4 h-4" />
        {title}
      </h4>
      {children}
    </div>
  );
}

export default TaskDetail;
