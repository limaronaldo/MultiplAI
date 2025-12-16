import { db } from '../packages/api/src/integrations/db';

async function main() {
  const approved = await db.getTasksByStatus('REVIEW_APPROVED' as any);
  const task = approved.find(t => t.githubIssueNumber === 90);
  
  if (task) {
    console.log('Issue:', task.githubIssueNumber);
    console.log('Title:', task.githubIssueTitle);
    console.log('Repo:', task.githubRepo);
    console.log('Branch:', task.branchName);
    console.log('\nDiff length:', task.currentDiff?.length || 0, 'chars');
    console.log('\nFirst 50 lines of diff:');
    console.log(task.currentDiff?.split('\n').slice(0, 50).join('\n'));
  }
  
  process.exit(0);
}
main().catch(console.error);
