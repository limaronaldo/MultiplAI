import React, { useState } from "react";
import { TaskList, TaskDetail } from "@/components/tasks";

export function TasksPage() {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Tasks</h2>
        <p className="text-slate-400">All autonomous development tasks.</p>
      </div>

      <TaskList onSelectTask={setSelectedTaskId} />

      <TaskDetail
        taskId={selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
      />
    </div>
  );
}

export default TasksPage;
