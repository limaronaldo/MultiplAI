import { db } from '../packages/api/src/integrations/db';

async function main() {
  const rejected = await db.getTasksByStatus('REVIEW_REJECTED' as any);
  const task = rejected.find(t => t.githubIssueNumber === 78);
  
  if (task) {
    console.log('Issue Title:', task.githubIssueTitle);
    console.log('\nIssue Body:');
    console.log(task.githubIssueBody);
    console.log('\nDefinition of Done:');
    console.log(JSON.stringify(task.definitionOfDone, null, 2));
    console.log('\nPlan:');
    console.log(JSON.stringify(task.plan, null, 2));
    console.log('\nTarget Files:');
    console.log(task.targetFiles);
  }
  
  process.exit(0);
}
main().catch(console.error);
