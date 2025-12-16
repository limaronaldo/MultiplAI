import { db } from '../packages/api/src/integrations/db';

async function main() {
  const failed = await db.getTasksByStatus('FAILED' as any);
  const task329 = failed.find(t => t.githubIssueNumber === 329);
  
  if (!task329) {
    console.log('Task #329 not found in FAILED');
    process.exit(1);
  }
  
  console.log('Task #329 found:', task329.id);
  console.log('Last error:', task329.lastError?.slice(0, 100));
  
  // Reset to BREAKDOWN_DONE so it can retry orchestration
  await db.updateTask(task329.id, {
    status: 'BREAKDOWN_DONE',
    lastError: null
  });
  
  console.log('Reset to BREAKDOWN_DONE');
  
  // Trigger processing
  const res = await fetch(`http://localhost:3000/api/tasks/${task329.id}/process`, { method: 'POST' });
  console.log('Triggered:', res.ok ? 'OK' : 'Failed');
  
  process.exit(0);
}
main().catch(console.error);
