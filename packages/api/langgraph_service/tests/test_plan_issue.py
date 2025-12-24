from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from multiplai.nodes.plan_issue import PlanModel, plan_issue
from multiplai.types import GraphState


@pytest.fixture
def mock_settings():
    with patch("multiplai.nodes.plan_issue.get_settings") as mock:
        mock.return_value.anthropic_api_key = "dummy_key"
        yield mock


@pytest.fixture
def mock_chat_anthropic():
    with patch("multiplai.nodes.plan_issue.ChatAnthropic") as mock:
        llm_instance = MagicMock()
        mock.return_value = llm_instance

        structured_llm = AsyncMock()
        llm_instance.with_structured_output.return_value = structured_llm

        yield structured_llm


@pytest.mark.asyncio
async def test_plan_issue_success(mock_settings, mock_chat_anthropic):
    state: GraphState = {
        "issue": {"title": "Test Issue", "body": "Description", "number": 1},
        "status": "new",
    }

    expected_plan = PlanModel(
        definition_of_done=["Done"],
        steps=["Step"],
        target_files=["file.py"],
        estimated_complexity="low",
    )

    # Mock the return value of ainvoke
    mock_chat_anthropic.ainvoke.return_value = expected_plan

    new_state = await plan_issue(state)

    assert new_state["status"] == "planned"
    assert new_state["plan"]["definition_of_done"] == ["Done"]

    mock_chat_anthropic.ainvoke.assert_called_once()


@pytest.mark.asyncio
async def test_plan_issue_error(mock_settings, mock_chat_anthropic):
    state: GraphState = {"issue": {}, "status": "new"}

    mock_chat_anthropic.ainvoke.side_effect = Exception("API Error")

    new_state = await plan_issue(state)

    assert new_state["status"] == "error"
    assert "API Error" in new_state["error"]
