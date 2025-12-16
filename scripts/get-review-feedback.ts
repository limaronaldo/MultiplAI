import { db } from '../packages/api/src/integrations/db';

async function main() {
  const rejected = await db.getTasksByStatus('REVIEW_REJECTED' as any);
  
  for (const t of rejected) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`#${t.githubIssueNumber}: ${t.githubIssueTitle?.slice(0, 50)}`);
    
    const events = await db.getTaskEvents(t.id);
    // Find the most recent REVIEWING or review-related event
    const reviewEvents = events.filter(e => 
      e.eventType.includes('REVIEW') || e.agent === 'reviewer'
    ).slice(-2);
    
    for (const e of reviewEvents) {
      console.log(`\nEvent: ${e.eventType}`);
      if (e.metadata) {
        const meta = typeof e.metadata === 'string' ? JSON.parse(e.metadata) : e.metadata;
        if (meta.verdict) console.log(`Verdict: ${meta.verdict}`);
        if (meta.feedback) console.log(`Feedback: ${meta.feedback?.slice(0, 300)}`);
        if (meta.comments) console.log(`Comments: ${JSON.stringify(meta.comments)?.slice(0, 300)}`);
      }
    }
  }
  
  process.exit(0);
}
main().catch(console.error);
