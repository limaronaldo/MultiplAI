import { db } from '../packages/api/src/integrations/db';

async function main() {
  const failed = await db.getTasksByStatus('TESTS_FAILED' as any);
  const task = failed.find(t => t.githubIssueNumber === 56);
  
  if (task) {
    console.log('Definition of Done:');
    console.log(JSON.stringify(task.definitionOfDone, null, 2));
  }
  
  process.exit(0);
}
main().catch(console.error);
