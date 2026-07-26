"""Tests for agent guardrails: tool-call budget, audit records, usage tracking."""

from __future__ import annotations
import sys as _sys
import types as _types
from pathlib import Path as _Path
from unittest.mock import MagicMock as _MagicMock

for _m in list(_sys.modules):
    if _m.startswith("connectors.") or _m == "engine.executor":
        del _sys.modules[_m]

if "connectors" not in _sys.modules or not getattr(_sys.modules.get("connectors"), "_is_stub", False):
    _base = _types.ModuleType("connectors.base")
    class _CE(Exception):
        def __init__(self, code="", message=""):
            super().__init__(message)
            self.code = code
            self.message = message
    _base.ConnectorError = _CE
    _base.IConnector = type("IConnector", (), {})
    _conn = _types.ModuleType("connectors")
    _conn._is_stub = True
    _conn.get_connector = _MagicMock(return_value=None)
    _conn.REGISTRY = {}
    _conn.IConnector = _base.IConnector
    _conn.ConnectorError = _CE
    # Keep the stub importable as a *package* so `import connectors.<mod>`
    # still resolves to the real module on disk. Without __path__ the stub
    # is a plain module, and because these stubs are installed at import
    # time and never torn down, the first agent test collected poisoned
    # sys.modules for every later test in the session.
    _conn.__path__ = [str(_Path(__file__).resolve().parent.parent / "connectors")]
    _sys.modules["connectors"] = _conn
    _sys.modules["connectors.base"] = _base


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
        rec = _agent_tool_invocation_record("corelyx.call_connector", {"ok": True, "simulated": True, "result": {}})
        self.assertTrue(rec["simulated"])

    def test_error_truncated_and_recorded(self):
        rec = _agent_tool_invocation_record("corelyx.call_connector", {"ok": False, "error": "x" * 500})
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


class EnsureAgentReportTests(unittest.IsolatedAsyncioTestCase):
    async def test_skips_when_report_already_delivered(self):
        ex = _agent_executor()
        node = ex.node_map["a1"]
        ex._call_agent_tool = AsyncMock()
        invocations = [{"tool": "corelyx.report_to_user", "ok": True}]
        out = await ex._ensure_agent_report(node, Mock(scope_access="read"), "done", invocations)
        self.assertEqual(out, invocations)
        ex._call_agent_tool.assert_not_called()

    async def test_synthesizes_report_when_model_skipped_it(self):
        ex = _agent_executor()
        node = ex.node_map["a1"]
        ex._call_agent_tool = AsyncMock(return_value={"ok": True, "result": {"delivered": True}})
        out = await ex._ensure_agent_report(node, Mock(scope_access="read"), "Email drafted and sent.", [])
        ex._call_agent_tool.assert_awaited_once()
        call = ex._call_agent_tool.await_args
        self.assertEqual(call.args[0], "corelyx.report_to_user")
        self.assertEqual(call.args[1]["body"], "Email drafted and sent.")
        self.assertTrue(call.args[1]["data"]["auto_generated"])
        self.assertTrue(call.kwargs["bypass_budget"])
        self.assertEqual(out[-1], {"tool": "corelyx.report_to_user", "ok": True})

    async def test_failed_report_call_does_not_count_as_delivered(self):
        ex = _agent_executor()
        node = ex.node_map["a1"]
        ex._call_agent_tool = AsyncMock(return_value={"ok": True, "result": {}})
        invocations = [{"tool": "corelyx.report_to_user", "ok": False, "error": "boom"}]
        out = await ex._ensure_agent_report(node, Mock(scope_access="read"), "summary", invocations)
        ex._call_agent_tool.assert_awaited_once()
        self.assertEqual(len(out), 2)

    async def test_bypass_budget_allows_report_when_budget_exhausted(self):
        ex = _agent_executor()
        ex._agent_tool_calls_made = MAX_AGENT_TOOL_CALLS_PER_RUN
        # The budget guard must not short-circuit a bypassed call; it should
        # proceed to dispatch (here: fail at the network layer instead).
        ex._nextjs_endpoint_candidates = Mock(return_value=[])
        res = await ex._call_agent_tool("corelyx.report_to_user", {"body": "x"}, "a1", "read", bypass_budget=True)
        self.assertNotIn("budget", str(res.get("error", "")).lower())


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
