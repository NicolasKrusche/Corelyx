"""Tests for agent guardrails: tool-call budget, audit records, usage tracking."""
from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, Mock

from engine.executor import (
    MAX_AGENT_TOOL_CALLS_PER_RUN,
    _agent_tool_invocation_record,
)
from tests.test_comprehensive_nodes_and_connections import _executor, _node, _program


def _agent_executor():
    node = _node("a1", "agent_task", {}, connection=None)
    return _executor(_program([node], []))


class ToolInvocationRecordTests(unittest.TestCase):
    def test_ok_record_is_minimal(self):
        rec = _agent_tool_invocation_record("corelyx.list_runs", {"ok": True, "result": {}})
        self.assertEqual(rec, {"tool": "corelyx.list_runs", "ok": True})

    def test_simulated_flag_recorded(self):
        rec = _agent_tool_invocation_record(
            "corelyx.call_connector", {"ok": True, "simulated": True, "result": {}}
        )
        self.assertTrue(rec["simulated"])

    def test_error_truncated_and_recorded(self):
        rec = _agent_tool_invocation_record(
            "corelyx.call_connector", {"ok": False, "error": "x" * 500}
        )
        self.assertFalse(rec["ok"])
        self.assertEqual(len(rec["error"]), 300)

    def test_no_args_are_ever_recorded(self):
        # Audit must never leak tool arguments (may contain credentials/PII).
        rec = _agent_tool_invocation_record(
            "corelyx.call_connector",
            {"ok": True, "result": {"sent": True}},
        )
        self.assertNotIn("args", rec)
        self.assertNotIn("params", rec)


class ToolCallBudgetTests(unittest.IsolatedAsyncioTestCase):
    async def test_budget_blocks_further_calls(self):
        ex = _agent_executor()
        ex._agent_tool_calls_made = MAX_AGENT_TOOL_CALLS_PER_RUN
        # Connector calls should never even be attempted once over budget.
        ex._execute_agent_connector_tool = AsyncMock()
        res = await ex._call_agent_tool(
            "corelyx.call_connector",
            {"connection": "slack:main", "operation": "send_message"},
            "a1",
            "write",
        )
        self.assertFalse(res["ok"])
        self.assertIn("budget", res["error"].lower())
        ex._execute_agent_connector_tool.assert_not_called()

    async def test_under_budget_increments_and_dispatches(self):
        ex = _agent_executor()
        ex._agent_tool_calls_made = 0
        ex._execute_agent_connector_tool = AsyncMock(return_value={"ok": True, "result": {}})
        res = await ex._call_agent_tool(
            "corelyx.call_connector",
            {"connection": "slack:main", "operation": "list_channels"},
            "a1",
            "read",
        )
        self.assertTrue(res["ok"])
        self.assertEqual(ex._agent_tool_calls_made, 1)
        ex._execute_agent_connector_tool.assert_awaited_once()


class AgentUsageTrackingTests(unittest.TestCase):
    def test_records_tokens_and_enforces_limits(self):
        ex = _agent_executor()
        ex._limiter = Mock()
        ex._limiter.check_llm_tokens = Mock()
        ex._limiter.check_cost = Mock()
        data = {"usage": {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150}}
        ex._record_agent_llm_usage("a1", "gpt-4o-mini", data)
        ex._limiter.check_llm_tokens.assert_called_once_with(150)
        ex._limiter.check_cost.assert_called_once()
        self.assertEqual(ex._node_telemetry["a1"]["total_tokens"], 150)

    def test_missing_usage_is_safe(self):
        ex = _agent_executor()
        ex._limiter = Mock()
        ex._limiter.check_llm_tokens = Mock()
        ex._limiter.check_cost = Mock()
        ex._record_agent_llm_usage("a1", "gpt-4o-mini", {})
        ex._limiter.check_llm_tokens.assert_called_once_with(0)
        self.assertEqual(ex._node_telemetry["a1"]["total_tokens"], 0)


if __name__ == "__main__":
    unittest.main()
