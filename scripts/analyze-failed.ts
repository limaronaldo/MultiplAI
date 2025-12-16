import { db } from '../packages/api/src/integrations/db';

async function main() {
  const failed = await db.getTasksByStatus('FAILED' as any);
  
  // Group by error type
  const errorGroups: Record<string, number> = {};
  const recoverableCount = { prClosed: 0, apiError: 0, maxAttempts: 0, syntaxError: 0, other: 0 };
  
  for (const t of failed) {
    const err = t.lastError || 'unknown';
    
    if (err.includes('PR was closed without merging')) {
      recoverableCount.prClosed++;
    } else if (err.includes('No content in responses') || err.includes('Failed to parse JSON')) {
      recoverableCount.apiError++;
    } else if (err.includes('MAX_ATTEMPTS')) {
      recoverableCount.maxAttempts++;
    } else if (err.includes('SYNTAX_ERROR')) {
      recoverableCount.syntaxError++;
    } else {
      recoverableCount.other++;
    }
  }
  
  console.log(`=== FAILED Tasks Analysis (${failed.length} total) ===\n`);
  console.log(`PR closed (not recoverable): ${recoverableCount.prClosed}`);
  console.log(`API errors (recoverable):    ${recoverableCount.apiError}`);
  console.log(`Max attempts reached:        ${recoverableCount.maxAttempts}`);
  console.log(`Syntax errors:               ${recoverableCount.syntaxError}`);
  console.log(`Other:                       ${recoverableCount.other}`);
  
  // List API error tasks (most recoverable)
  console.log('\n=== API Error Tasks (can retry) ===');
  const apiErrorTasks = failed.filter(t => 
    t.lastError?.includes('No content in responses') || 
    t.lastError?.includes('Failed to parse JSON')
  ).slice(0, 10);
  
  for (const t of apiErrorTasks) {
    console.log(`#${t.githubIssueNumber}: ${t.githubIssueTitle?.slice(0, 40)}`);
  }
  
  process.exit(0);
}
main().catch(console.error);
