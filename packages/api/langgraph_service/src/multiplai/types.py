"""Shared types for MultiplAI system."""

from __future__ import annotations

from typing import Any, Dict, List, Literal, TypedDict


class Plan(TypedDict):
    definition_of_done: List[str]
    steps: List[str]
    target_files: List[str]
    estimated_complexity: Literal["low", "medium", "high"]


class GraphState(TypedDict, total=False):
    """Shared graph state type.

    This is intentionally permissive (total=False) so nodes can preserve any
    existing keys in the state. All fields are optional.
    """

    # Core identifiers
    github_repo: str
    issue_number: int
    issue_title: str
    issue_body: str
    issue: Any  # Full issue object

    # Processing status
    status: str
    error: str

    # Context and planning
    context: Dict[str, Any]
    plan: Plan
    target_files: List[str]
    file_contents: Dict[str, str]

    # Execution results
    execution_result: Dict[str, Any]
    diff: str

    # PR data
    pr_url: str
    pr_data: Dict[str, Any]

    # Debug/trace
    trace: List[str]
