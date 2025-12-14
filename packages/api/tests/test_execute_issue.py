
import os
import unittest
import tempfile
from unittest.mock import MagicMock, patch, AsyncMock
from multiplai.nodes.execute_issue import execute_issue

class TestExecuteIssue(unittest.IsolatedAsyncioTestCase):

    @patch("multiplai.nodes.execute_issue.ChatAnthropic")
    @patch("multiplai.nodes.execute_issue.get_settings")
    async def test_execute_issue_success(self, mock_get_settings, MockChatAnthropic):
        # Setup mocks
        mock_settings = MagicMock()
        mock_settings.anthropic_api_key = "test_key"
        mock_get_settings.return_value = mock_settings

        mock_llm = AsyncMock()
        mock_response = MagicMock()
        mock_response.content = "mocked diff"
        mock_llm.ainvoke.return_value = mock_response
        MockChatAnthropic.return_value = mock_llm

        # Create temporary file
        with tempfile.NamedTemporaryFile(mode="w", delete=False, encoding="utf-8") as tmp_file:
            tmp_file.write("original content")
            tmp_file_path = tmp_file.name

        state = {
            "plan": {"steps": ["change file"]},
            "target_files": [tmp_file_path]
        }

        try:
            new_state = await execute_issue(state)

            self.assertEqual(new_state["status"], "executed")
            self.assertEqual(new_state["diff"], "mocked diff")

            # Verify LLM interaction
            MockChatAnthropic.assert_called_with(api_key="test_key", model="claude-3-5-sonnet-20240620")
            mock_llm.ainvoke.assert_called_once()

        finally:
            os.remove(tmp_file_path)

    async def test_execute_issue_no_target_files(self):
        state = {
            "plan": {"steps": ["change file"]},
            "target_files": []
        }

        new_state = await execute_issue(state)

        self.assertEqual(new_state["status"], "error")
        self.assertIn("No target_files specified", new_state["error"])

    async def test_execute_issue_file_not_found(self):
        state = {
            "plan": {"steps": ["change file"]},
            "target_files": ["non_existent_file.txt"]
        }

        new_state = await execute_issue(state)

        self.assertEqual(new_state["status"], "error")
        self.assertIn("File not found", new_state["error"])

if __name__ == '__main__':
    unittest.main()
