"""Tests for the corelyx.ask_user agent tool (pause/resume for human input)."""

from __future__ import annotations
import sys as _sys
import types as _types
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
    _sys.modules["connectors"] = _conn
    _sys.modules["connectors.base"] = _base


import unittest
from unittest.mock import AsyncMock, Mock, patch

from engine.executor import ExecutionError
from tests.test_comprehensive_nodes_and_connections import _executor, _node, _program


def _ask_executor(node_exec_data=None):
    """Executor wired with a db whose node_executions lookup returns one row."""
    node = _node("a1", "agent_task", {}, connection=None)
    ex = _executor(_program([node], []))

    builder = Mock()
    for m in ["select", "eq", "order", "limit"]:
        getattr(builder, m).return_value = builder
    builder.execute.return_value = Mock(data=node_exec_data if node_exec_data is not None else [{"id": "ne-1"}])
    ex.db = Mock()
    ex.db.table = Mock(return_value=builder)
    return ex


class AskUserValidationTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_question(self):
        ex = _ask_executor()
        res = await ex._execute_agent_ask_user({}, "a1")
        self.assertFalse(res["ok"])
        self.assertIn("question", res["error"])

    async def test_blank_question(self):
        ex = _ask_executor()
        res = await ex._execute_agent_ask_user({"question": "   "}, "a1")
        self.assertFalse(res["ok"])

    async def test_no_node_execution_row(self):
        ex = _ask_executor(node_exec_data=[])
        res = await ex._execute_agent_ask_user({"question": "Proceed?"}, "a1")
        self.assertFalse(res["ok"])
        self.assertIn("node execution", res["error"].lower())


class AskUserFlowTests(unittest.IsolatedAsyncioTestCase):
    async def test_answered_returns_answer(self):
        ex = _ask_executor()
        ex._wait_for_agent_answer = AsyncMock(return_value="Yes, contact A only")
        with patch("engine.executor.create_approval", new=AsyncMock(return_value={"id": "apr-1"})):
            res = await ex._execute_agent_ask_user({"question": "Who to contact?"}, "a1")
        self.assertTrue(res["ok"])
        self.assertTrue(res["result"]["answered"])
        self.assertEqual(res["result"]["answer"], "Yes, contact A only")

    async def test_declined_is_graceful(self):
        ex = _ask_executor()
        ex._wait_for_agent_answer = AsyncMock(return_value=None)
        with patch("engine.executor.create_approval", new=AsyncMock(return_value={"id": "apr-1"})):
            res = await ex._execute_agent_ask_user({"question": "Proceed?"}, "a1")
        self.assertTrue(res["ok"])
        self.assertFalse(res["result"]["answered"])

    async def test_timeout_returns_error_not_raise(self):
        ex = _ask_executor()
        ex._wait_for_agent_answer = AsyncMock(side_effect=ExecutionError("AGENT_QUESTION_TIMEOUT", "timed out"))
        with patch("engine.executor.create_approval", new=AsyncMock(return_value={"id": "apr-1"})):
            res = await ex._execute_agent_ask_user({"question": "Proceed?"}, "a1")
        self.assertFalse(res["ok"])
        self.assertIn("timed out", res["error"])

    async def test_create_approval_failure_is_handled(self):
        ex = _ask_executor()
        with patch("engine.executor.create_approval", new=AsyncMock(side_effect=Exception("db down"))):
            res = await ex._execute_agent_ask_user({"question": "Proceed?"}, "a1")
        self.assertFalse(res["ok"])
        self.assertIn("deliver", res["error"].lower())

    async def test_counts_against_tool_budget(self):
        # Routed through _call_agent_tool, ask_user consumes the per-run budget.
        ex = _ask_executor()
        ex._execute_agent_ask_user = AsyncMock(return_value={"ok": True, "result": {"answered": True, "answer": "x"}})
        await ex._call_agent_tool("corelyx.ask_user", {"question": "Q"}, "a1", "read")
        self.assertEqual(ex._agent_tool_calls_made, 1)
        ex._execute_agent_ask_user.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
