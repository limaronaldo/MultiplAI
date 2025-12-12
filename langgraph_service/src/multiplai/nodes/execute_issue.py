"""Execution node that applies a planned change to a set of target files.

This module currently provides a placeholder implementation that produces a
unified diff based on the input state. In the future, this node will be wired
to an LLM client (e.g., Anthropic) to generate real patches.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, TypeAlias

GraphState: TypeAlias = Dict[str, Any]

if TYPE_CHECKING:
    # This block exists to mirror the project's pattern of importing types only
    # for static analysis. A shared GraphState definition may be introduced in
    # the future; at that point this module should import it here.
    pass


async def execute_issue(state: GraphState) -> GraphState:
    """Execute a planned change and attach a unified diff to the graph state.

    Args:
        state: Mutable graph state dictionary. Expected keys include:
            - "plan": A description of the intended changes (currently unused).
            - "target_files": A list of repository-relative file paths to modify.

    Returns:
        The updated graph state.

        On success:
            - state["diff"] is a unified diff string describing the changes
            - state["status"] == "executed"

        On error (missing/empty target_files):
            - state["status"] == "error"
            - state["error"] contains a human-readable error message
    """

    plan = state.get("plan")
    target_files = state.get("target_files")

    if not target_files:
        new_state: GraphState = dict(state)
        new_state["status"] = "error"
        new_state["error"] = "No target_files specified; unable to execute issue."
        return new_state

    # plan is intentionally unused in this placeholder implementation.
    _ = plan

    # TODO: Integrate Anthropic client to convert `plan` into an actual patch.
    removed_prefix = "-" * 3 + " a/"
    added_prefix = "+" * 3 + " b/"
    hunk_header = "@" * 2 + " -0,0 +1,1 " + "@" * 2

    diff_lines: List[str] = []
    for file_path in target_files:
        diff_lines.extend(
            [
                f"{removed_prefix}{file_path}",
                f"{added_prefix}{file_path}",
                hunk_header,
                "+# TODO: apply planned changes",
                "",
            ]
        )

    unified_diff = "\n".join(diff_lines).rstrip("\n") + "\n"

    new_state: GraphState = dict(state)
    new_state["diff"] = unified_diff
    new_state["status"] = "executed"
    return new_state