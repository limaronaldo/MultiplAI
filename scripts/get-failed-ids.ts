import { db } from '../packages/api/src/integrations/db';

async function main() {
  const testsFailed = await db.getTasksByStatus('TESTS_FAILED' as any);
  
  console.log('TESTS_FAILED task IDs:');
  for (const t of testsFailed) {
    console.log(`${t.id}|#${t.githubIssueNumber}`);
  }
  
  process.exit(0);
}
main().catch(console.error);
