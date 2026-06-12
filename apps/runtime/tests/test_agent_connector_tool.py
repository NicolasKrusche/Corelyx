"""Tests for the runtime-native corelyx.call_connector agent tool."""
from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, Mock, patch

from engine.executor import _connector_op_is_write
from tests.test_comprehensive_nodes_and_connections import _executor, _node, _program
from schema import OAuthConnectionConfig


def _agent_executor():
    """A bare executor wired for connector-tool tests."""
    node = _node("a1", "agent_task", {}, connection=None)
    executor = _executor(_program([node], []))
    executor._resolve_connection_id = Mock(return_value="conn-1")
    executor._provider_for_connection = Mock(return_value="slack")
    executor._fetch_oauth_token = AsyncMock(return_value="token")
    executor._enforce_provider_policy = AsyncMock()
    return executor


class ConnectorOpClassifierTests(unittest.TestCase):
    def test_read_prefixes_are_reads(self):
        for op in ["get_thread", "list_channels", "search_messages", "fetch_user",
                   "find_contact", "query_events", "retrieve_file", "check_status"]:
            self.assertFalse(_connector_op_is_write(op), op)

    def test_other_ops_are_writes(self):
        for op in ["send_message", "create_note", "update_deal", "delete_record", "post_status"]:
            self.assertTrue(_connector_op_is_write(op), op)

    def test_unknown_op_is_treated_as_write(self):
        self.assertTrue(_connector_op_is_write("frobnicate"))

    def test_empty_is_write(self):
        self.assertTrue(_connector_op_is_write(""))


class ConnectorToolValidationTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_connection(self):
        ex = _agent_executor()
        res = await ex._execute_agent_connector_tool({"operation": "send_message"}, "a1", "write")
        self.assertFalse(res["ok"])
        self.assertIn("connection", res["error"])

    async def test_missing_operation(self):
        ex = _agent_executor()
        res = await ex._execute_agent_connector_tool({"connection": "slack:main"}, "a1", "write")
        self.assertFalse(res["ok"])
        self.assertIn("operation", res["error"])

    async def test_params_must_be_object(self):
        ex = _agent_executor()
        res = await ex._execute_agent_connector_tool(
            {"connection": "slack:main", "operation": "send_message", "params": "nope"}, "a1", "write"
        )
        self.assertFalse(res["ok"])
        self.assertIn("params", res["error"])

    async def test_unresolved_template_params_are_refused(self):
        # The model sometimes copies workflow template syntax into a tool call;
        # the literal {{...}} must never reach a connector URL.
        ex = _agent_executor()
        res = await ex._execute_agent_connector_tool(
            {
                "connection": "gmail:primary",
                "operation": "delete_email",
                "params": {"message_id": "{{loop_id.email.id}}"},
            },
            "a1",
            "write",
        )
        self.assertFalse(res["ok"])
        self.assertIn("template", res["error"].lower())
        self.assertIn("{{loop_id.email.id}}", res["error"])

    async def test_nested_template_params_are_refused(self):
        ex = _agent_executor()
        res = await ex._execute_agent_connector_tool(
            {
                "connection": "slack:main",
                "operation": "send_message",
                "params": {"blocks": [{"text": "id={{n2.email.id}}"}]},
            },
            "a1",
            "write",
        )
        self.assertFalse(res["ok"])
        self.assertIn("template", res["error"].lower())


class ConnectorToolScopeTests(unittest.IsolatedAsyncioTestCase):
    async def test_read_scope_blocks_write_op(self):
        ex = _agent_executor()
        res = await ex._execute_agent_connector_tool(
            {"connection": "slack:main", "operation": "send_message"}, "a1", "read"
        )
        self.assertFalse(res["ok"])
        self.assertIn("read-only", res["error"])

    async def test_read_scope_allows_read_op(self):
        ex = _agent_executor()
        connector = Mock()
        connector.supported_operations = ["list_channels"]
        connector.execute = AsyncMock(return_value={"channels": []})
        with patch("engine.executor.get_connector", return_value=connector):
            res = await ex._execute_agent_connector_tool(
                {"connection": "slack:main", "operation": "list_channels"}, "a1", "read"
            )
        self.assertTrue(res["ok"])
        self.assertEqual(res["result"], {"channels": []})


class ConnectorToolDryRunTests(unittest.IsolatedAsyncioTestCase):
    async def test_dry_run_simulates_write(self):
        ex = _agent_executor()
        ex.dry_run = True
        connector = Mock()
        connector.supported_operations = ["send_message"]
        connector.execute = AsyncMock()
        with patch("engine.executor.get_connector", return_value=connector):
            res = await ex._execute_agent_connector_tool(
                {"connection": "slack:main", "operation": "send_message", "params": {"text": "hi"}},
                "a1", "write",
            )
        self.assertTrue(res["ok"])
        self.assertTrue(res["simulated"])
        connector.execute.assert_not_called()
        self.assertEqual(res["result"]["would_execute"]["operation"], "send_message")

    async def test_dry_run_still_runs_reads(self):
        ex = _agent_executor()
        ex.dry_run = True
        connector = Mock()
        connector.supported_operations = ["list_channels"]
        connector.execute = AsyncMock(return_value={"channels": ["x"]})
        with patch("engine.executor.get_connector", return_value=connector):
            res = await ex._execute_agent_connector_tool(
                {"connection": "slack:main", "operation": "list_channels"}, "a1", "read"
            )
        self.assertTrue(res["ok"])
        self.assertNotIn("simulated", res)
        connector.execute.assert_awaited_once()


class ConnectorToolExecutionTests(unittest.IsolatedAsyncioTestCase):
    async def test_unsupported_operation(self):
        ex = _agent_executor()
        connector = Mock()
        connector.supported_operations = ["send_message"]
        with patch("engine.executor.get_connector", return_value=connector):
            res = await ex._execute_agent_connector_tool(
                {"connection": "slack:main", "operation": "teleport"}, "a1", "write"
            )
        self.assertFalse(res["ok"])
        self.assertIn("not supported", res["error"])

    async def test_no_connector_for_provider(self):
        ex = _agent_executor()
        with patch("engine.executor.get_connector", return_value=None):
            res = await ex._execute_agent_connector_tool(
                {"connection": "slack:main", "operation": "send_message"}, "a1", "write"
            )
        self.assertFalse(res["ok"])
        self.assertIn("No native connector", res["error"])

    async def test_successful_write(self):
        ex = _agent_executor()
        connector = Mock()
        connector.supported_operations = ["send_message"]
        connector.execute = AsyncMock(return_value={"ts": "123"})
        with patch("engine.executor.get_connector", return_value=connector):
            res = await ex._execute_agent_connector_tool(
                {"connection": "slack:main", "operation": "send_message", "params": {"text": "hi"}},
                "a1", "read_write",
            )
        self.assertTrue(res["ok"])
        self.assertEqual(res["result"], {"ts": "123"})
        connector.execute.assert_awaited_once_with("send_message", {"text": "hi"}, "token")

    async def test_connector_error_surfaced(self):
        from connectors.base import ConnectorError
        ex = _agent_executor()
        connector = Mock()
        connector.supported_operations = ["send_message"]
        connector.execute = AsyncMock(side_effect=ConnectorError("RATE_LIMITED", "slow down"))
        with patch("engine.executor.get_connector", return_value=connector):
            res = await ex._execute_agent_connector_tool(
                {"connection": "slack:main", "operation": "send_message"}, "a1", "write"
            )
        self.assertFalse(res["ok"])
        self.assertIn("RATE_LIMITED", res["error"])


if __name__ == "__main__":
    unittest.main()
