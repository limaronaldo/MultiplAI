import { db } from '../packages/api/src/integrations/db';

async function main() {
  const rejected = await db.getTasksByStatus('REVIEW_REJECTED' as any);
  const task = rejected.find(t => t.githubIssueNumber === 32);
  
  if (task) {
    await db.updateTask(task.id, {
      status: 'WAITING_HUMAN',
      prNumber: 409,
      prUrl: 'https://github.com/limaronaldo/MultiplAI/pull/409',
      branchName: 'auto/32-create-pr-node'
    });
    
    await db.createTaskEvent({
      taskId: task.id,
      eventType: 'PR_CREATED',
      agent: 'human',
      metadata: { prNumber: 409, manual: true }
    });
    
    console.log('Task #32 updated to WAITING_HUMAN with PR #409');
  }
  
  process.exit(0);
}
main().catch(console.error);
