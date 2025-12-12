"""Planning node for MultiplAI LangGraph workflows.

This module contains the `plan_issue` node, responsible for generating an
implementation plan from the current graph state.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from multiplai.types import GraphState, Plan


async def plan_issue(state: GraphState) -> GraphState:
    """Generate an implementation plan for the current issue.

    Args:
        state: Current graph state.

    Returns:
        Updated graph state with:
        - status set to 'planned'
        - plan containing: definition_of_done, steps, target_files,
          estimated_complexity

    Behavior:
        This is a placeholder implementation that returns a static plan.
        A future version should use an LLM to generate the plan based on the
        issue content and repository context.
    """

    # TODO: Integrate Anthropic client to generate the plan dynamically.
    plan: Plan = {
        "definition_of_done": [
            "A plan is returned with definition_of_done, steps, target_files, and estimated_complexity",
            "The graph state is updated with status='planned'",
        ],
        "steps": [
            "Inspect the issue description and available repository context",
            "Draft concrete implementation steps that follow the plan",
            "Identify the specific target files impacted by the change",
            "Estimate complexity and return the updated graph state",
        ],
        "target_files": [
            "langgraph_service/src/multiplai/nodes/plan_issue.py",
        ],
        "estimated_complexity": "low",
    }

    return {**state, "status": "planned", "plan": plan}