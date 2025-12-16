import { db } from '../packages/api/src/integrations/db';

async function main() {
  const failed = await db.getTasksByStatus('FAILED' as any);
  
  const apiErrorTasks = failed.filter(t => 
    t.lastError?.includes('No content in responses') || 
    t.lastError?.includes('Failed to parse JSON')
  );
  
  console.log(`Found ${apiErrorTasks.length} API error tasks to retry\n`);
  
  // Only retry first 10 to avoid overwhelming the system
  const toRetry = apiErrorTasks.slice(0, 10);
  
  for (const task of toRetry) {
    console.log(`Resetting #${task.githubIssueNumber}...`);
    
    // Reset to appropriate state based on where it failed
    let newStatus = 'PLANNING_DONE';
    if (task.currentDiff) {
      newStatus = 'CODING_DONE';
    }
    
    await db.updateTask(task.id, {
      status: newStatus as any,
      lastError: null
    });
    
    // Trigger processing
    try {
      await fetch(`http://localhost:3000/api/tasks/${task.id}/process`, { 
        method: 'POST',
        signal: AbortSignal.timeout(5000)
      });
      console.log(`  -> Triggered`);
    } catch (e) {
      console.log(`  -> Triggered (async)`);
    }
  }
  
  console.log(`\nRetried ${toRetry.length} tasks`);
  process.exit(0);
}
main().catch(console.error);
