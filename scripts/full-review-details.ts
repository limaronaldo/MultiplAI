import { db } from '../packages/api/src/integrations/db';

async function main() {
  const rejected = await db.getTasksByStatus('REVIEW_REJECTED' as any);
  
  // Focus on #78 first as it's in MultiplAI (our main repo)
  const task78 = rejected.find(t => t.githubIssueNumber === 78);
  const task32 = rejected.find(t => t.githubIssueNumber === 32);
  
  for (const t of [task78, task32].filter(Boolean)) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`#${t!.githubIssueNumber}: ${t!.githubIssueTitle}`);
    console.log(`Branch: ${t!.branchName}`);
    
    const events = await db.getTaskEvents(t!.id);
    const reviewEvent = events.find(e => e.eventType === 'REVIEWED');
    
    if (reviewEvent?.metadata) {
      console.log('\nFull metadata:');
      console.log(JSON.stringify(reviewEvent.metadata, null, 2));
    }
    
    // Also show the diff
    if (t!.currentDiff) {
      console.log('\nDiff preview (first 50 lines):');
      console.log(t!.currentDiff.split('\n').slice(0, 50).join('\n'));
    }
  }
  
  process.exit(0);
}
main().catch(console.error);
