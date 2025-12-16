import { db } from '../packages/api/src/integrations/db';

async function main() {
  const approved = await db.getTasksByStatus('REVIEW_APPROVED' as any);
  const task90 = approved.find(t => t.githubIssueNumber === 90);
  
  if (task90) {
    console.log(`Triggering #90 (${task90.id})...`);
    const res = await fetch(`http://localhost:3000/api/tasks/${task90.id}/process`, { method: 'POST' });
    console.log('Response:', res.ok ? 'OK' : 'Failed');
  }
  
  process.exit(0);
}
main().catch(console.error);
