import { db } from '../packages/api/src/integrations/db';

async function main() {
  // Get all active tasks
  const statuses = ['PLANNING_DONE', 'CODING', 'CODING_DONE', 'TESTING', 'TESTS_PASSED', 'FIXING', 'REVIEWING', 'BREAKDOWN_DONE', 'ORCHESTRATING'];
  
  console.log('=== Active Tasks Status ===\n');
  
  for (const status of statuses) {
    const tasks = await db.getTasksByStatus(status as any);
    if (tasks.length > 0) {
      console.log(`${status}: ${tasks.length}`);
      for (const t of tasks) {
        console.log(`  #${t.githubIssueNumber}: ${t.githubIssueTitle?.slice(0, 45)}...`);
      }
    }
  }
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
