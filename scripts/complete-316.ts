import { db } from '../packages/api/src/integrations/db';

async function main() {
  const tasks = await db.getTasksByStatus('WAITING_HUMAN' as any);
  const task = tasks.find(t => t.githubIssueNumber === 316);
  
  if (!task) {
    console.log('Task #316 not found in WAITING_HUMAN');
    process.exit(1);
  }
  
  // Update to COMPLETED
  await db.updateTask(task.id, {
    status: 'COMPLETED'
  });
  
  await db.createTaskEvent({
    taskId: task.id,
    eventType: 'COMPLETED',
    agent: 'human',
    metadata: { 
      action: 'PR merged manually',
      mergeCommit: 'bca987ab4609df203337da9e00d071ca1a001a3b'
    }
  });
  
  console.log('Task #316 marked as COMPLETED');
  process.exit(0);
}

main().catch(console.error);
