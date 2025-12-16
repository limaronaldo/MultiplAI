import { db } from '../packages/api/src/integrations/db';

async function main() {
  const tasks = await db.getTasksByStatus('TESTS_PASSED' as any);
  console.log(`Triggering ${tasks.length} TESTS_PASSED tasks for review...\n`);
  
  for (const task of tasks) {
    process.stdout.write(`#${task.githubIssueNumber}... `);
    try {
      await fetch(`http://localhost:3000/api/tasks/${task.id}/process`, { 
        method: 'POST',
        signal: AbortSignal.timeout(5000)
      });
      console.log('OK');
    } catch (e) {
      console.log('triggered');
    }
  }
  
  process.exit(0);
}
main().catch(console.error);
