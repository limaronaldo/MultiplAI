import { Pool } from 'pg';

// Assuming pool is configured elsewhere; for this implementation, we'll use a placeholder
// In a real setup, import or create the pool from a config file
const pool = new Pool({
  // connection details
});

export interface VisualTestRun {
  id: number;
  taskId: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  passRate: number | null;
  results: any | null; // JSONB
  screenshots: any | null; // JSONB
  createdAt: Date;
  updatedAt: Date;
}

export async function createVisualTestRun(data: Omit<VisualTestRun, 'id' | 'createdAt' | 'updatedAt'>): Promise<VisualTestRun> {
  const query = `
    INSERT INTO visual_test_runs (task_id, status, pass_rate, results, screenshots, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
    RETURNING id, task_id, status, pass_rate, results, screenshots, created_at, updated_at
  `;
  const values = [data.taskId, data.status, data.passRate, data.results, data.screenshots];
  const result = await pool.query(query, values);
  const row = result.rows[0];
  return {
    id: row.id,
    taskId: row.task_id,
    status: row.status,
    passRate: row.pass_rate ?? null,
    results: row.results ?? null,
    screenshots: row.screenshots ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function updateVisualTestRun(id: number, updates: Partial<Omit<VisualTestRun, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
  const fields = [];
  const values = [];
  let paramIndex = 1;
  if (updates.taskId !== undefined) {
    fields.push(`task_id = $${paramIndex++}`);
    values.push(updates.taskId);
  }
  if (updates.status !== undefined) {
    fields.push(`status = $${paramIndex++}`);
    values.push(updates.status);
  }
  if (updates.passRate !== undefined) {
    fields.push(`pass_rate = $${paramIndex++}`);
    values.push(updates.passRate);
  }
  if (updates.results !== undefined) {
    fields.push(`results = $${paramIndex++}`);
    values.push(updates.results);
  }
  if (updates.screenshots !== undefined) {
    fields.push(`screenshots = $${paramIndex++}`);
    values.push(updates.screenshots);
  }
  fields.push(`updated_at = NOW()`);
  const query = `UPDATE visual_test_runs SET ${fields.join(', ')} WHERE id = $${paramIndex}`;
  values.push(id);
  await pool.query(query, values);
}

export async function getVisualTestRun(id: number): Promise<VisualTestRun | null> {
  const query = 'SELECT id, task_id, status, pass_rate, results, screenshots, created_at, updated_at FROM visual_test_runs WHERE id = $1';
  const result = await pool.query(query, [id]);
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    taskId: row.task_id,
    status: row.status,
    passRate: row.pass_rate ?? null,
    results: row.results ?? null,
    screenshots: row.screenshots ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getVisualTestRunsForTask(taskId: number): Promise<VisualTestRun[]> {
  const query = 'SELECT id, task_id, status, pass_rate, results, screenshots, created_at, updated_at FROM visual_test_runs WHERE task_id = $1 ORDER BY created_at DESC';
  const result = await pool.query(query, [taskId]);
  return result.rows.map(row => ({
    id: row.id,
    taskId: row.task_id,
    status: row.status,
    passRate: row.pass_rate ?? null,
    results: row.results ?? null,
    screenshots: row.screenshots ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}