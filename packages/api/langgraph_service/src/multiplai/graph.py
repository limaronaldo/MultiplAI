"""Graph wiring for the MultiPLAI workflow.

This module intentionally keeps a small, self-contained StateGraph-like
implementation so tests can run without requiring external dependencies.

The workflow is linear:

load_context -> plan_issue -> execute_issue -> create_pr -> END
"""

from __future__ import annotations

import copy
import inspect
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, Optional

from multiplai.types import GraphState

END = "__end__"


class MemorySaver:
    """A minimal in-memory checkpointer compatible with this module's graph."""

    def __init__(self) -> None:
        self._store: Dict[str, GraphState] = {}

    def get(self, thread_id: str) -> Optional[GraphState]:
        value = self._store.get(thread_id)
        return copy.deepcopy(value) if value is not None else None

    def put(self, thread_id: str, state: GraphState) -> None:
        self._store[thread_id] = copy.deepcopy(state)


NodeFn = Callable[
    [GraphState],
    Dict[str, Any] | GraphState | None | Awaitable[Dict[str, Any] | GraphState | None],
]


@dataclass(frozen=True)
class _CompiledGraph:
    nodes: Dict[str, NodeFn]
    edges: Dict[str, str]
    entry_point: str
    checkpointer: MemorySaver

    async def ainvoke(
        self, state: GraphState, config: Optional[Dict[str, Any]] = None
    ) -> GraphState:
        current = self.entry_point
        thread_id = "default"
        if config is not None:
            thread_id = (
                config.get("configurable", {}).get("thread_id")
                or config.get("thread_id")
                or thread_id
            )

        working_state: GraphState = copy.deepcopy(state)
        self.checkpointer.put(thread_id, working_state)

        while current != END:
            node = self.nodes[current]
            result = node(working_state)
            if inspect.isawaitable(result):
                result = await result
            if result:
                # Treat the node output as a partial state update.
                for key, value in result.items():
                    working_state[key] = value  # type: ignore[literal-required]
            self.checkpointer.put(thread_id, working_state)

            current = self.edges.get(current, END)

        return working_state


class StateGraph:
    """A small subset of a StateGraph API.

    The real project intends to use LangGraph. This local implementation is
    sufficient for wiring, compilation, and testing of node sequencing.
    """

    def __init__(self, state_schema: type) -> None:
        self._state_schema = state_schema
        self._nodes: Dict[str, NodeFn] = {}
        self._edges: Dict[str, str] = {}
        self._entry_point: Optional[str] = None

    def add_node(self, name: str, fn: NodeFn) -> None:
        self._nodes[name] = fn

    def set_entry_point(self, name: str) -> None:
        self._entry_point = name

    def add_edge(self, source: str, dest: str) -> None:
        self._edges[source] = dest

    def compile(self, checkpointer: MemorySaver) -> _CompiledGraph:
        if not self._entry_point:
            raise ValueError("Entry point must be set before compiling")
        return _CompiledGraph(
            nodes=dict(self._nodes),
            edges=dict(self._edges),
            entry_point=self._entry_point,
            checkpointer=checkpointer,
        )


def _append_trace(state: GraphState, node_name: str) -> None:
    trace = state.get("trace")
    if trace is None:
        trace = []
        state["trace"] = trace
    trace.append(node_name)


async def load_context(state: GraphState) -> Dict[str, Any]:
    _append_trace(state, "load_context")
    return {
        "status": "context_loaded",
        "context": {"loaded": True},
    }


async def plan_issue(state: GraphState) -> Dict[str, Any]:
    _append_trace(state, "plan_issue")
    return {
        "status": "planned",
        "plan": {
            "steps": ["execute", "create_pr"],
            "definition_of_done": [],
            "target_files": [],
            "estimated_complexity": "low",
        },
    }


async def execute_issue(state: GraphState) -> Dict[str, Any]:
    _append_trace(state, "execute_issue")
    return {
        "status": "executed",
        "execution_result": {"ok": True},
    }


async def create_pr(state: GraphState) -> Dict[str, Any]:
    _append_trace(state, "create_pr")
    return {
        "status": "pr_ready",
        "pr_url": "https://example.local/pr/1",
    }


def should_continue(state: GraphState) -> str:
    """Decide whether to continue or end.

    Included per spec. The current workflow is linear and does not use this.
    """

    if state.get("status") == "pr_ready":
        return END
    return "create_pr"


def build_graph() -> _CompiledGraph:
    workflow = StateGraph(GraphState)

    workflow.add_node("load_context", load_context)
    workflow.add_node("plan_issue", plan_issue)
    workflow.add_node("execute_issue", execute_issue)
    workflow.add_node("create_pr", create_pr)

    workflow.set_entry_point("load_context")

    workflow.add_edge("load_context", "plan_issue")
    workflow.add_edge("plan_issue", "execute_issue")
    workflow.add_edge("execute_issue", "create_pr")
    workflow.add_edge("create_pr", END)

    return workflow.compile(checkpointer=MemorySaver())


graph = build_graph()
