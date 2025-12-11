import { getDb } from "./src/integrations/db";

async function resetTasks() {
  const sql = getDb();
  
  const result = await sql`
    UPDATE tasks 
    SET status = 'NEW', 
        attempt_count = 0, 
        last_error = NULL, 
        current_diff = NULL, 
        branch_name = NULL 
    WHERE github_issue_number IN (6, 7) 
    AND github_repo = 'limaronaldo/MultiplAI'
    RETURNING id, github_issue_number, status
  `;
  
  console.log("Reset tasks:", result);
  await sql.end();
}

resetTasks();
