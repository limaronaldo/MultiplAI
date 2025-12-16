import { db } from '../packages/api/src/integrations/db';

async function main() {
  const failed = await db.getTasksByStatus('TESTS_FAILED' as any);
  
  for (const t of failed.filter(t => [56, 63].includes(t.githubIssueNumber))) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`#${t.githubIssueNumber}: ${t.githubIssueTitle}`);
    console.log(`Repo: ${t.githubRepo}`);
    console.log(`Branch: ${t.branchName}`);
    console.log(`Last Error: ${t.lastError?.slice(0, 200)}`);
    console.log(`\nTarget Files: ${JSON.stringify(t.targetFiles)}`);
    console.log(`\nDiff preview (first 40 lines):`);
    console.log(t.currentDiff?.split('\n').slice(0, 40).join('\n'));
  }
  
  process.exit(0);
}
main().catch(console.error);
