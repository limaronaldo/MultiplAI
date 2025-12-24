"""Execution node that applies a planned change to a set of target files.

This module currently provides a placeholder implementation that produces a
unified diff based on the input state. In the future, this node will be wired
to an LLM client (e.g., Anthropic) to generate real patches.
"""

from __future__ import annotations

from langchain_anthropic import ChatAnthropic  # type: ignore[import-not-found]
from langchain_core.messages import (  # type: ignore[import-not-found]
    HumanMessage,
    SystemMessage,
)

from multiplai.config import get_settings
from multiplai.types import GraphState


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
        error_state = GraphState(**state)
        error_state["status"] = "error"
        error_state["error"] = "No target_files specified; unable to execute issue."
        return error_state

    # Read the content of the target files
    file_contents = {}
    for file_path in target_files:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                file_contents[file_path] = f.read()
        except FileNotFoundError:
            error_state = GraphState(**state)
            error_state["status"] = "error"
            error_state["error"] = f"File not found: {file_path}"
            return error_state
        except Exception as e:
            error_state = GraphState(**state)
            error_state["status"] = "error"
            error_state["error"] = f"Error reading file {file_path}: {e}"
            return error_state

    settings = get_settings()
    llm = ChatAnthropic(
        api_key=settings.anthropic_api_key, model="claude-3-5-sonnet-20240620"
    )

    system_prompt = (
        "You are an expert software engineer. Your task is to generate a unified diff "
        "to apply the planned changes to the codebase. "
        "You will be provided with the plan and the content of the target files. "
        "Output ONLY the unified diff. Do not include any explanations or markdown formatting."
    )

    user_content = f"Plan:\n{plan}\n\n"
    for file_path, content in file_contents.items():
        user_content += f"File: {file_path}\nContent:\n{content}\n\n"

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_content),
    ]

    try:
        response = await llm.ainvoke(messages)
        unified_diff = response.content
        if isinstance(unified_diff, list):
            # Handle case where content might be list of blocks (though unlikely for text model without tools)
            unified_diff = "\n".join(
                [block.text for block in unified_diff if hasattr(block, "text")]
            )

        # Strip markdown code blocks if present
        if unified_diff.startswith("```diff"):
            unified_diff = unified_diff[7:]
        elif unified_diff.startswith("```"):
            unified_diff = unified_diff[3:]

        if unified_diff.endswith("```"):
            unified_diff = unified_diff[:-3]

        unified_diff = unified_diff.strip()

    except Exception as e:
        error_state = GraphState(**state)
        error_state["status"] = "error"
        error_state["error"] = f"Error generating patch: {e}"
        return error_state

    success_state = GraphState(**state)
    success_state["diff"] = unified_diff
    success_state["status"] = "executed"
    return success_state
