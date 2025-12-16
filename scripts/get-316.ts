import { db } from '../packages/api/src/integrations/db';

async function main() {
  const tasks = await db.getTasksByStatus('WAITING_HUMAN' as any);
  const task = tasks.find(t => t.githubIssueNumber === 316);
  
  if (task) {
    console.log('Issue:', task.githubIssueNumber);
    console.log('Title:', task.githubIssueTitle);
    console.log('Repo:', task.githubRepo);
    console.log('PR:', task.prUrl);
    console.log('PR Number:', task.prNumber);
    console.log('Branch:', task.branchName);
  }
  
  process.exit(0);
}
main().catch(console.error);
