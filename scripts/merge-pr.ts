import { GitHubClient } from '../packages/api/src/integrations/github';

async function main() {
  const github = new GitHubClient();
  
  try {
    // First check PR status
    const pr = await github.octokit.rest.pulls.get({
      owner: 'limaronaldo',
      repo: 'MultiplAI',
      pull_number: 405
    });
    
    console.log('PR State:', pr.data.state);
    console.log('Mergeable:', pr.data.mergeable);
    console.log('Mergeable State:', pr.data.mergeable_state);
    
    if (pr.data.state !== 'open') {
      console.log('PR is not open, cannot merge');
      process.exit(1);
    }
    
    if (pr.data.mergeable === false) {
      console.log('PR has merge conflicts');
      process.exit(1);
    }
    
    // Merge the PR
    console.log('\nMerging PR #405...');
    const merge = await github.octokit.rest.pulls.merge({
      owner: 'limaronaldo',
      repo: 'MultiplAI',
      pull_number: 405,
      merge_method: 'squash',
      commit_title: 'feat(cua): add CUA types and action schemas (#316)',
      commit_message: 'Adds TypeScript interfaces and Zod schemas for Computer Use Actions (CUA).\n\nIncludes: ClickAction, DoubleClickAction, ScrollAction, TypeAction, KeypressAction, WaitAction, ScreenshotAction, DragAction, and related result/config types.'
    });
    
    console.log('Merge successful!');
    console.log('SHA:', merge.data.sha);
    
  } catch (error: any) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
  
  process.exit(0);
}

main();
