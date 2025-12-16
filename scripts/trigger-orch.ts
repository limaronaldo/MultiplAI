import { db } from '../packages/api/src/integrations/db';

async function main() {
  const tasks = await db.getTasksByStatus('ORCHESTRATING' as any);
  
  for (const task of tasks) {
    console.log(`Triggering #${task.githubIssueNumber}...`);
    try {
      const res = await fetch(`http://localhost:3000/api/tasks/${task.id}/process`, { method: 'POST' });
      console.log(`  -> ${res.ok ? 'OK' : 'Failed'}`);
    } catch (e: any) {
      console.log(`  -> Error: ${e.message}`);
    }
  }
  
  process.exit(0);
}
main().catch(console.error);
