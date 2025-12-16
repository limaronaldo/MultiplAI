import { db } from '../packages/api/src/integrations/db';

async function main() {
  const rejected = await db.getTasksByStatus('REVIEW_REJECTED' as any);
  const task = rejected.find(t => t.githubIssueNumber === 78);
  
  if (task) {
    await db.updateTask(task.id, {
      status: 'WAITING_HUMAN',
      prNumber: 408,
      prUrl: 'https://github.com/limaronaldo/MultiplAI/pull/408',
      branchName: 'auto/78-mobile-nav'
    });
    
    await db.createTaskEvent({
      taskId: task.id,
      eventType: 'PR_CREATED',
      agent: 'human',
      metadata: { prNumber: 408, manual: true }
    });
    
    console.log('Task #78 updated to WAITING_HUMAN with PR #408');
  }
  
  process.exit(0);
}
main().catch(console.error);
