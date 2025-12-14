"""Shared types for MultiplAI system."""

from __future__ import annotations

from typing import Any, List, Literal, TypedDict


class Plan(TypedDict):
    definition_of_done: List[str]
    steps: List[str]
    target_files: List[str]
    estimated_complexity: Literal["low", "medium", "high"]


class GraphState(TypedDict, total=False):
    """Shared graph state type.

    This is intentionally permissive (total=False) so nodes can preserve any
    existing keys in the state.
    """

    status: str
    plan: Plan
    issue: Any
