import { db } from '../packages/api/src/integrations/db';

async function main() {
  const tasks = await db.getTasksByStatus('BREAKDOWN_DONE' as any);
  
  for (const task of tasks) {
    console.log(`\n=== #${task.githubIssueNumber}: ${task.githubIssueTitle?.slice(0, 50)} ===`);
    console.log(`Status: ${task.status}`);
    console.log(`Complexity: ${task.estimatedComplexity}`);
    
    const state = await db.getOrchestrationState(task.id);
    if (state) {
      console.log(`Subtasks: ${state.subtasks?.length || 0}`);
      if (state.subtasks) {
        for (const s of state.subtasks) {
          console.log(`  - ${s.title?.slice(0, 40)} | ${s.status}`);
        }
      }
    } else {
      console.log('No orchestration state found');
    }
  }
  
  process.exit(0);
}
main().catch(console.error);
