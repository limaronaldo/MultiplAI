import { db } from '../packages/api/src/integrations/db';

async function main() {
  const tasks = await db.getTasksByStatus('ORCHESTRATING' as any);
  
  console.log(`=== ORCHESTRATING Tasks (${tasks.length}) ===\n`);
  
  for (const task of tasks) {
    const state = await db.getOrchestrationState(task.id);
    console.log(`#${task.githubIssueNumber}: ${task.githubIssueTitle?.slice(0, 45)}`);
    
    if (state?.subtasks) {
      const completed = state.subtasks.filter(s => s.status === 'completed').length;
      const failed = state.subtasks.filter(s => s.status === 'failed').length;
      const pending = state.subtasks.filter(s => s.status === 'pending').length;
      const inProgress = state.subtasks.filter(s => s.status === 'in_progress').length;
      console.log(`  Progress: ${completed}/${state.subtasks.length} done, ${inProgress} active, ${pending} pending, ${failed} failed`);
    } else {
      console.log('  No subtask state');
    }
  }
  
  process.exit(0);
}
main().catch(console.error);
