import { db } from '../packages/api/src/integrations/db';

async function main() {
  const approved = await db.getTasksByStatus('REVIEW_APPROVED' as any);
  const rejected = await db.getTasksByStatus('REVIEW_REJECTED' as any);
  const passed = await db.getTasksByStatus('TESTS_PASSED' as any);
  
  console.log(`Triggering ${approved.length} REVIEW_APPROVED (-> PR)...`);
  for (const t of approved) {
    process.stdout.write(`#${t.githubIssueNumber}... `);
    try {
      await fetch(`http://localhost:3000/api/tasks/${t.id}/process`, { method: 'POST', signal: AbortSignal.timeout(5000) });
      console.log('OK');
    } catch { console.log('triggered'); }
  }
  
  console.log(`\nTriggering ${rejected.length} REVIEW_REJECTED (-> recode)...`);
  for (const t of rejected) {
    process.stdout.write(`#${t.githubIssueNumber}... `);
    try {
      await fetch(`http://localhost:3000/api/tasks/${t.id}/process`, { method: 'POST', signal: AbortSignal.timeout(5000) });
      console.log('OK');
    } catch { console.log('triggered'); }
  }
  
  console.log(`\nTriggering ${passed.length} TESTS_PASSED (-> review)...`);
  for (const t of passed) {
    process.stdout.write(`#${t.githubIssueNumber}... `);
    try {
      await fetch(`http://localhost:3000/api/tasks/${t.id}/process`, { method: 'POST', signal: AbortSignal.timeout(5000) });
      console.log('OK');
    } catch { console.log('triggered'); }
  }
  
  process.exit(0);
}
main().catch(console.error);
