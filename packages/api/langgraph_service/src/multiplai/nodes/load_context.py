from __future__ import annotations

from typing import Any, NotRequired, TypedDict


class GraphState(TypedDict):
    github_repo: str
    issue_number: int
    issue_title: str
    issue_body: str
    target_files: NotRequired[list[str]]
    file_contents: NotRequired[dict[str, str]]
    plan: NotRequired[str]
    diff: NotRequired[str]
    pr_data: NotRequired[dict[str, Any]]
    status: NotRequired[str]
    error: NotRequired[str]


async def load_context(state: GraphState) -> GraphState:
    """Load/prepare contextual information required to process an issue.

    This node is expected to:
    - Validate required identifiers (repo + issue metadata)
    - Fetch/prepare repository context and target file contents
    - Populate `target_files` and `file_contents` in the shared graph state

    For now this implementation is a placeholder that only marks the state as
    having completed context loading.
    """

    updated_state: GraphState = dict(state)
    updated_state["status"] = "context_loaded"
    # Clear any previous error when successfully loading context.
    updated_state.pop("error", None)
    return updated_state


async def plan_issue(state: GraphState) -> GraphState:
    """Placeholder node that would generate an implementation plan."""

    updated_state: GraphState = dict(state)
    updated_state["status"] = "planned"
    updated_state.pop("error", None)
    return updated_state


async def execute_issue(state: GraphState) -> GraphState:
    """Placeholder node that would execute the implementation plan and produce a diff."""

    updated_state: GraphState = dict(state)
    updated_state["status"] = "executed"
    updated_state.pop("error", None)
    return updated_state


async def create_pr(state: GraphState) -> GraphState:
    """Placeholder node that would open a pull request from the produced diff."""

    updated_state: GraphState = dict(state)
    updated_state["status"] = "pr_created"
    updated_state.pop("error", None)
    return updated_state