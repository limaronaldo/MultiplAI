import { db } from '../packages/api/src/integrations/db';

async function main() {
  const reviewApproved = await db.getTasksByStatus('REVIEW_APPROVED' as any);
  const planningDone = await db.getTasksByStatus('PLANNING_DONE' as any);
  const breakdownDone = await db.getTasksByStatus('BREAKDOWN_DONE' as any);
  
  console.log('=== REVIEW_APPROVED ===');
  for (const t of reviewApproved) {
    console.log(`${t.id} | #${t.githubIssueNumber}`);
  }
  
  console.log('\n=== PLANNING_DONE ===');
  for (const t of planningDone) {
    console.log(`${t.id} | #${t.githubIssueNumber}`);
  }
  
  console.log('\n=== BREAKDOWN_DONE ===');
  for (const t of breakdownDone) {
    console.log(`${t.id} | #${t.githubIssueNumber}`);
  }
  
  process.exit(0);
}
main().catch(console.error);
