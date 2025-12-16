import { db } from '../packages/api/src/integrations/db';

async function checkStatus() {
  const statuses = ['NEW', 'PLANNING', 'PLANNING_DONE', 'CODING', 'CODING_DONE', 'TESTING', 'TESTS_FAILED', 'TESTS_PASSED', 'FIXING', 'REVIEWING', 'REVIEW_APPROVED', 'REVIEW_REJECTED', 'ORCHESTRATING', 'BREAKDOWN_DONE', 'WAITING_HUMAN'];
  
  console.log('=== Current Task Status ===\n');
  
  for (const status of statuses) {
    const tasks = await db.getTasksByStatus(status as any);
    if (tasks.length > 0) {
      console.log(`\n${status}: ${tasks.length} tasks`);
      for (const t of tasks) {
        console.log(`  - #${t.githubIssueNumber}: ${t.githubIssueTitle?.slice(0, 50)}... (attempts: ${t.attempts})`);
      }
    }
  }
  
  process.exit(0);
}
checkStatus().catch(console.error);
