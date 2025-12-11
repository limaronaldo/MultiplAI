import { getDb } from "../integrations/db";

// Pass issue numbers as command line args: bun run reset-tasks.ts 22 23 24
async function resetTasks() {
  const sql = getDb();

  // Get issue numbers from args or use defaults
  const args = process.argv.slice(2);
  const issueNumbers =
    args.length > 0
      ? args.map((n) => parseInt(n, 10)).filter((n) => !isNaN(n))
      : [22]; // Default to issue 22

  console.log(`Resetting tasks for issues: ${issueNumbers.join(", ")}`);

  const result = await sql`
    UPDATE tasks
    SET status = 'NEW',
        attempt_count = 0,
        last_error = NULL,
        current_diff = NULL,
        branch_name = NULL
    WHERE github_issue_number = ANY(${issueNumbers})
    AND github_repo = 'limaronaldo/MultiplAI'
    RETURNING id, github_issue_number, status
  `;

  console.log("Reset tasks:", result);
  await sql.end();
}

resetTasks();
