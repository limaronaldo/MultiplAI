from __future__ import annotations

from multiplai.types import GraphState


async def load_context(state: GraphState) -> GraphState:
    """Load/prepare contextual information required to process an issue.

    This node is expected to:
    - Validate required identifiers (repo + issue metadata)
    - Fetch/prepare repository context and target file contents
    - Populate `target_files` and `file_contents` in the shared graph state

    For now this implementation is a placeholder that only marks the state as
    having completed context loading.
    """

    updated_state = GraphState(**state)
    updated_state["status"] = "context_loaded"
    # Clear any previous error when successfully loading context.
    updated_state.pop("error", None)  # type: ignore[misc]
    return updated_state


async def plan_issue_placeholder(state: GraphState) -> GraphState:
    """Placeholder node that would generate an implementation plan."""

    updated_state = GraphState(**state)
    updated_state["status"] = "planned"
    updated_state.pop("error", None)  # type: ignore[misc]
    return updated_state


async def execute_issue_placeholder(state: GraphState) -> GraphState:
    """Placeholder node that would execute the implementation plan and produce a diff."""

    updated_state = GraphState(**state)
    updated_state["status"] = "executed"
    updated_state.pop("error", None)  # type: ignore[misc]
    return updated_state


async def create_pr_placeholder(state: GraphState) -> GraphState:
    """Placeholder node that would open a pull request from the produced diff."""

    updated_state = GraphState(**state)
    updated_state["status"] = "pr_created"
    updated_state.pop("error", None)  # type: ignore[misc]
    return updated_state
