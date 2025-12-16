import { db } from '../packages/api/src/integrations/db';

async function main() {
  // Check each status including FAILED
  const statuses = ['TESTS_FAILED', 'ORCHESTRATING', 'WAITING_HUMAN', 'COMPLETED', 'FAILED'];
  
  console.log('=== Current Status ===\n');
  
  for (const status of statuses) {
    const tasks = await db.getTasksByStatus(status as any);
    if (status === 'FAILED' || status === 'COMPLETED') {
      console.log(`${status}: ${tasks.length} tasks`);
    } else if (tasks.length > 0) {
      console.log(`${status}: ${tasks.length} tasks`);
      for (const t of tasks) {
        let extra = '';
        if (t.prUrl) extra = ` -> ${t.prUrl}`;
        console.log(`  #${t.githubIssueNumber}: ${t.githubIssueTitle?.slice(0, 40)}${extra}`);
      }
    }
  }
  
  // Check if #329 is in FAILED
  const failed = await db.getTasksByStatus('FAILED' as any);
  const task329 = failed.find(t => t.githubIssueNumber === 329);
  if (task329) {
    console.log(`\n#329 FAILED: ${task329.lastError?.slice(0, 150)}`);
  }
  
  process.exit(0);
}
main().catch(console.error);
