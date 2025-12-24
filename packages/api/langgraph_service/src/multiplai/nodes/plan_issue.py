"""Planning node for MultiplAI LangGraph workflows.

This module contains the `plan_issue` node, responsible for generating an
implementation plan from the current graph state.
"""

from __future__ import annotations

import os
from typing import Any, List, Literal

from langchain_anthropic import ChatAnthropic  # type: ignore[import-not-found]
from langchain_core.messages import (  # type: ignore[import-not-found]
    HumanMessage,
    SystemMessage,
)
from pydantic import BaseModel, Field  # type: ignore[import-not-found]

from multiplai.config import get_settings
from multiplai.types import GraphState, Plan


class PlanModel(BaseModel):
    """Pydantic model for structured plan generation."""

    definition_of_done: List[str] = Field(
        description="List of criteria to consider the task done"
    )
    steps: List[str] = Field(description="List of implementation steps")
    target_files: List[str] = Field(
        description="List of files to modify or create (relative paths)"
    )
    estimated_complexity: Literal["low", "medium", "high"] = Field(
        description="Estimated complexity of the task"
    )


def _get_repository_context(root_dir: str = ".") -> str:
    """Generate a simple tree view of the repository files."""
    tree: List[str] = []
    # Limit depth or excluded dirs could be improved
    exclude_dirs = {
        "__pycache__",
        ".git",
        ".github",
        "node_modules",
        "dist",
        "build",
        ".venv",
        "venv",
    }

    # Try to list mostly src/ files to fit in context window
    # If root_dir is ".", we walk everything.

    count = 0
    max_files = 500  # Safety limit

    for root, dirs, files in os.walk(root_dir):
        # Modify dirs in-place to skip excluded
        dirs[:] = [d for d in dirs if d not in exclude_dirs and not d.startswith(".")]

        level = root.replace(root_dir, "").count(os.sep)
        indent = "  " * level
        tree.append(f"{indent}{os.path.basename(root)}/")

        for f in files:
            if (
                f.endswith(".py")
                or f.endswith(".md")
                or f.endswith(".ts")
                or f.endswith(".json")
            ):
                tree.append(f"{indent}  {f}")
                count += 1

        if count > max_files:
            tree.append(f"{indent}  ... (truncated)")
            break

    return "\n".join(tree)


async def plan_issue(state: GraphState) -> GraphState:
    """Generate an implementation plan for the current issue.

    Args:
        state: Current graph state.

    Returns:
        Updated graph state with:
        - status set to 'planned'
        - plan containing: definition_of_done, steps, target_files,
          estimated_complexity
    """
    settings = get_settings()
    llm = ChatAnthropic(
        api_key=settings.anthropic_api_key, model="claude-3-5-sonnet-20240620"
    )
    structured_llm = llm.with_structured_output(PlanModel)

    # Extract issue details robustly
    issue_data: Any = state.get("issue")
    title: str = ""
    body: str = ""
    number: str = ""

    if issue_data:
        # Check if it's an object with attributes
        if hasattr(issue_data, "title"):
            title = str(issue_data.title)
            body = str(getattr(issue_data, "body", ""))
            number = str(getattr(issue_data, "number", ""))
        # Check if it's a dict
        elif isinstance(issue_data, dict):
            title = str(issue_data.get("title", ""))
            body = str(issue_data.get("body", ""))
            number = str(issue_data.get("number", ""))

    # Fallback to flat state properties if issue object didn't provide data
    if not title:
        title = str(state.get("issue_title", "Unknown Title"))
    if not body:
        body = str(state.get("issue_body", "No description provided."))
    if not number:
        number = str(state.get("issue_number", "Unknown"))

    # Generate file context
    # Assume we are in the package root or similar.
    # We'll list files from current directory.
    file_context = _get_repository_context(".")

    system_prompt = (
        "You are an expert software engineer and architect. "
        "Your goal is to analyze the provided GitHub issue and create a detailed "
        "implementation plan.\n"
        "The plan must include:\n"
        "1. Definition of Done: clear criteria to verify the task.\n"
        "2. Steps: step-by-step implementation guide.\n"
        "3. Target Files: list of files that likely need to be modified or created.\n"
        "4. Estimated Complexity: low, medium, or high.\n\n"
        "Be specific and technical. "
        "Use the provided repository file structure to identify correct file paths."
    )

    user_message = (
        f"Issue #{number}: {title}\n\n"
        f"Description:\n{body}\n\n"
        f"Repository Context:\n{file_context}"
    )

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_message),
    ]

    try:
        result = await structured_llm.ainvoke(messages)
        # result is an instance of PlanModel
        plan: Plan = result.model_dump()  # type: ignore[assignment]
    except Exception as e:
        error_state = GraphState(**state)
        error_state["status"] = "error"
        error_state["error"] = f"Failed to generate plan: {str(e)}"
        return error_state

    success_state = GraphState(**state)
    success_state["status"] = "planned"
    success_state["plan"] = plan
    return success_state
