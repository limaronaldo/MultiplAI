"""Data models and schemas for MultiplAI system."""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel  # type: ignore[import-not-found]


class TaskStatus(str, Enum):
    """Status values for task execution lifecycle."""

    NEW = "NEW"
    PLANNING = "PLANNING"
    PLANNING_DONE = "PLANNING_DONE"
    CODING = "CODING"
    CODING_DONE = "CODING_DONE"
    TESTING = "TESTING"
    TESTS_PASSED = "TESTS_PASSED"
    TESTS_FAILED = "TESTS_FAILED"
    FIXING = "FIXING"
    REVIEWING = "REVIEWING"
    REVIEW_APPROVED = "REVIEW_APPROVED"
    PR_CREATED = "PR_CREATED"
    WAITING_HUMAN = "WAITING_HUMAN"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class JobStatus(str, Enum):
    """Status values for job execution."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Task(BaseModel):
    """Represents a single task in the system."""

    id: str
    status: TaskStatus
    github_repo: str
    github_issue_number: int
    github_issue_title: str
    attempt_count: int = 0
    max_attempts: int = 3
    last_error: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class Job(BaseModel):
    """Represents a job containing multiple tasks."""

    id: str
    status: JobStatus
    task_ids: list[str]
    completed_count: int = 0
    failed_count: int = 0
    created_at: datetime
    updated_at: datetime


class ExecutionPlan(BaseModel):
    """Represents a plan for executing a task."""

    steps: list[str]
    target_files: list[str]
    estimated_complexity: str
