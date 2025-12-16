import { db } from '../packages/api/src/integrations/db';

const API_URL = 'http://localhost:3000';

async function advanceTasks() {
  // Get tasks that need to advance
  const planningDone = await db.getTasksByStatus('PLANNING_DONE' as any);
  const codingDone = await db.getTasksByStatus('CODING_DONE' as any);
  const newTasks = await db.getTasksByStatus('NEW' as any);
  
  const tasksToProcess = [...newTasks, ...planningDone, ...codingDone];
  
  console.log(`Found ${tasksToProcess.length} tasks to advance:`);
  console.log(`  - NEW: ${newTasks.length}`);
  console.log(`  - PLANNING_DONE: ${planningDone.length}`);
  console.log(`  - CODING_DONE: ${codingDone.length}`);
  console.log('');
  
  for (const task of tasksToProcess) {
    console.log(`Triggering #${task.githubIssueNumber} (${task.status})...`);
    try {
      const res = await fetch(`${API_URL}/api/tasks/${task.id}/process`, { method: 'POST' });
      const data = await res.json();
      console.log(`  -> ${res.ok ? 'OK' : 'Failed'}: ${data.message || JSON.stringify(data)}`);
    } catch (e: any) {
      console.log(`  -> Error: ${e.message}`);
    }
  }
  
  process.exit(0);
}

advanceTasks().catch(console.error);
