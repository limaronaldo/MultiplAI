import { db } from '../packages/api/src/integrations/db';

async function main() {
  const rejected = await db.getTasksByStatus('REVIEW_REJECTED' as any);
  
  for (const t of rejected) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`#${t.githubIssueNumber}: ${t.githubIssueTitle}`);
    console.log(`Repo: ${t.githubRepo}`);
    console.log(`Target Files: ${JSON.stringify(t.targetFiles)}`);
  }
  
  process.exit(0);
}
main().catch(console.error);
