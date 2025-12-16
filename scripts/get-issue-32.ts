import { db } from '../packages/api/src/integrations/db';

async function main() {
  const rejected = await db.getTasksByStatus('REVIEW_REJECTED' as any);
  const task = rejected.find(t => t.githubIssueNumber === 32);
  
  if (task) {
    console.log('Issue:', task.githubIssueNumber);
    console.log('Title:', task.githubIssueTitle);
    console.log('Repo:', task.githubRepo);
    console.log('\nIssue Body:');
    console.log(task.githubIssueBody);
    console.log('\nTarget Files:');
    console.log(task.targetFiles);
    console.log('\nCurrent Diff (first 80 lines):');
    console.log(task.currentDiff?.split('\n').slice(0, 80).join('\n'));
  }
  
  process.exit(0);
}
main().catch(console.error);
