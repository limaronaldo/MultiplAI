import { db } from "../packages/api/src/integrations/db";

async function main() {
  const tasks = await db.getTasksByStatus("ORCHESTRATING");
  
  for (const task of tasks) {
    const state = await db.getOrchestrationState(task.id);
    
    console.log(`\n=== Issue #${task.githubIssueNumber}: ${task.githubIssueTitle.slice(0, 50)} ===`);
    
    if (!state) {
      console.log("  No orchestration state found!");
      continue;
    }
    
    const subtasks = state.subtasks || [];
    const completed = subtasks.filter(s => s.status === 'completed').length;
    const pending = subtasks.filter(s => s.status === 'pending').length;
    const failed = subtasks.filter(s => s.status === 'failed').length;
    
    console.log(`  Total subtasks: ${subtasks.length}`);
    console.log(`  Completed: ${completed}, Pending: ${pending}, Failed: ${failed}`);
    console.log(`  Current index: ${state.currentSubtaskIndex ?? 'N/A'}`);
  }
  
  process.exit(0);
}

main().catch(console.error);
