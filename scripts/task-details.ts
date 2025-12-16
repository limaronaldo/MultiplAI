import { db } from '../packages/api/src/integrations/db';

async function main() {
  // Check #316 (WAITING_HUMAN)
  const waiting = await db.getTasksByStatus('WAITING_HUMAN' as any);
  console.log('=== WAITING_HUMAN (PRs Created) ===');
  for (const t of waiting) {
    console.log(`#${t.githubIssueNumber}: ${t.githubIssueTitle?.slice(0, 40)}`);
    if (t.prUrl) console.log(`  PR: ${t.prUrl}`);
  }
  
  // Check for #7 in any status
  const coding = await db.getTasksByStatus('CODING' as any);
  const codingDone = await db.getTasksByStatus('CODING_DONE' as any);
  const failed = await db.getTasksByStatus('FAILED' as any);
  
  console.log('\n=== CODING ===');
  for (const t of coding) {
    console.log(`#${t.githubIssueNumber}: ${t.githubIssueTitle?.slice(0, 40)}`);
  }
  
  console.log('\n=== CODING_DONE ===');
  for (const t of codingDone) {
    console.log(`#${t.githubIssueNumber}: ${t.githubIssueTitle?.slice(0, 40)}`);
  }
  
  // Check recent failures
  const recentFailed = failed.filter(t => 
    t.updatedAt && new Date(t.updatedAt) > new Date(Date.now() - 30 * 60 * 1000)
  );
  if (recentFailed.length > 0) {
    console.log('\n=== RECENTLY FAILED (last 30 min) ===');
    for (const t of recentFailed) {
      console.log(`#${t.githubIssueNumber}: ${t.lastError?.slice(0, 60)}`);
    }
  }
  
  process.exit(0);
}
main().catch(console.error);
