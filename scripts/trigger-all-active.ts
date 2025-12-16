import { db } from '../packages/api/src/integrations/db';

async function main() {
  const statuses = ['CODING_DONE', 'TESTS_FAILED', 'BREAKDOWN_DONE', 'ORCHESTRATING'];
  
  for (const status of statuses) {
    const tasks = await db.getTasksByStatus(status as any);
    console.log(`\n=== ${status} (${tasks.length}) ===`);
    
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
  }
  
  process.exit(0);
}
main().catch(console.error);
