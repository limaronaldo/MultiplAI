import { db } from '../packages/api/src/integrations/db';

async function main() {
  const reviewing = await db.getTasksByStatus('REVIEWING' as any);
  const approved = await db.getTasksByStatus('REVIEW_APPROVED' as any);
  const waiting = await db.getTasksByStatus('WAITING_HUMAN' as any);
  
  console.log('REVIEWING:', reviewing.length);
  for (const t of reviewing) console.log(`  #${t.githubIssueNumber}`);
  
  console.log('REVIEW_APPROVED:', approved.length);
  for (const t of approved) console.log(`  #${t.githubIssueNumber}`);
  
  console.log('WAITING_HUMAN:', waiting.length);
  for (const t of waiting) console.log(`  #${t.githubIssueNumber}: ${t.prUrl || 'no PR'}`);
  
  process.exit(0);
}
main().catch(console.error);
