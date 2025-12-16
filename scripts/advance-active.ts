import { db } from '../packages/api/src/integrations/db';

const API_URL = 'http://localhost:3000';

async function advanceTasks() {
  // Get tasks that need to advance
  const testsPassed = await db.getTasksByStatus('TESTS_PASSED' as any);
  const planningDone = await db.getTasksByStatus('PLANNING_DONE' as any);
  const breakdownDone = await db.getTasksByStatus('BREAKDOWN_DONE' as any);
  
  const tasksToProcess = [...testsPassed, ...planningDone, ...breakdownDone];
  
  console.log(`Found ${tasksToProcess.length} tasks to advance:`);
  console.log(`  - TESTS_PASSED: ${testsPassed.length} (-> REVIEWING)`);
  console.log(`  - PLANNING_DONE: ${planningDone.length} (-> CODING)`);
  console.log(`  - BREAKDOWN_DONE: ${breakdownDone.length} (-> ORCHESTRATING)`);
  console.log('');
  
  for (const task of tasksToProcess) {
    console.log(`Triggering #${task.githubIssueNumber} (${task.status})...`);
    try {
      const res = await fetch(`${API_URL}/api/tasks/${task.id}/process`, { method: 'POST' });
      const data = await res.json();
      console.log(`  -> ${res.ok ? 'OK' : 'Failed'}`);
    } catch (e: any) {
      console.log(`  -> Error: ${e.message}`);
    }
  }
  
  process.exit(0);
}

advanceTasks().catch(console.error);
