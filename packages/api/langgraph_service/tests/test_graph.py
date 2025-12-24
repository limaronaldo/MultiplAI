import pytest

from multiplai.graph import GraphState, graph


@pytest.mark.asyncio
async def test_graph_happy_path() -> None:
    initial_state: GraphState = {
        "status": "new",
        "trace": [],
    }

    final_state = await graph.ainvoke(
        initial_state,
        config={"configurable": {"thread_id": "test-thread"}},
    )

    assert final_state["status"] == "pr_ready"
    assert final_state["pr_url"]
    assert final_state["trace"] == [
        "load_context",
        "plan_issue",
        "execute_issue",
        "create_pr",
    ]

    # Ensure the state object contains expected intermediate artifacts.
    assert final_state["context"]["loaded"] is True
    assert "steps" in final_state["plan"]
    assert final_state["execution_result"]["ok"] is True
