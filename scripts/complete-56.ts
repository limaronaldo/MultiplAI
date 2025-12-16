import { db } from '../packages/api/src/integrations/db';

async function main() {
  const failed = await db.getTasksByStatus('TESTS_FAILED' as any);
  const task = failed.find(t => t.githubIssueNumber === 56);
  
  if (task) {
    await db.updateTask(task.id, {
      status: 'COMPLETED',
      lastError: null
    });
    
    await db.createTaskEvent({
      taskId: task.id,
      eventType: 'COMPLETED',
      agent: 'human',
      metadata: { 
        reason: 'Feature already exists in packages/web/src/components/notifications/NotificationCenter.tsx',
        manual: true
      }
    });
    
    console.log('Task #56 marked as COMPLETED - feature already exists');
  }
  
  process.exit(0);
}
main().catch(console.error);
