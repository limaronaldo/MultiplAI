import { db } from '../packages/api/src/integrations/db';

async function main() {
  const rejected = await db.getTasksByStatus('REVIEW_REJECTED' as any);
  
  for (const t of rejected) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`#${t.githubIssueNumber}: ${t.githubIssueTitle}`);
    console.log(`Repo: ${t.githubRepo}`);
    console.log(`Branch: ${t.branchName || 'none'}`);
    
    // Get the latest review event
    const events = await db.getTaskEvents(t.id);
    const reviewEvent = events.find(e => e.eventType === 'REVIEW_REJECTED');
    if (reviewEvent?.metadata) {
      const meta = typeof reviewEvent.metadata === 'string' 
        ? JSON.parse(reviewEvent.metadata) 
        : reviewEvent.metadata;
      console.log(`\nRejection reason:`);
      console.log(meta.feedback || meta.reason || JSON.stringify(meta).slice(0, 500));
    }
  }
  
  process.exit(0);
}
main().catch(console.error);
