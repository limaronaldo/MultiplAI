-- Create visual_test_runs table
CREATE TABLE visual_test_runs (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    pass_rate DECIMAL(5,2),
    results JSONB,
    screenshots JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_visual_test_runs_task_id ON visual_test_runs (task_id);
CREATE INDEX idx_visual_test_runs_created_at ON visual_test_runs (created_at);