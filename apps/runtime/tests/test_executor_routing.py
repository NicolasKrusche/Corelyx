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
from unittest.mock import AsyncMock, patch

from engine.executor import ProgramExecutor
from schema import SchemaEdge


def _edge(edge_id: str, source: str, target: str) -> SchemaEdge:
    return SchemaEdge(
        id=edge_id,
        from_node=source,
        to=target,
        type="data_flow",
        data_mapping=None,
        condition=None,
        label=None,
    )


def _executor(edges: list[SchemaEdge]) -> ProgramExecutor:
    executor = ProgramExecutor.__new__(ProgramExecutor)
    executor.edges_from = {}
    for edge in edges:
        executor.edges_from.setdefault(edge.from_node, []).append(edge)
    executor.db = object()
    executor.run_id = "run-1"
    executor.data_region = "eu-central-1"
    executor.retention_expiry = "2099-01-01T00:00:00+00:00"
    return executor


class ExecutorRoutingTests(unittest.IsolatedAsyncioTestCase):
    async def test_non_selected_branch_keeps_shared_downstream_nodes_available(self) -> None:
        executor = _executor(
            [
                _edge("e1", "branch", "default"),
                _edge("e2", "branch", "invoice"),
                _edge("e3", "default", "join"),
                _edge("e4", "invoice", "invoice-step"),
                _edge("e5", "invoice-step", "join"),
            ]
        )
        selected_reachable = executor._reachable_nodes_from(["invoice"])

        with patch("engine.executor.update_node_execution", new=AsyncMock()):
            skipped = await executor._skip_nodes_from(
                ["default"],
                excluded=selected_reachable,
            )

        self.assertEqual(skipped, {"default"})

    async def test_failed_node_skips_all_of_its_dependent_nodes(self) -> None:
        executor = _executor(
            [
                _edge("e1", "failed", "child"),
                _edge("e2", "child", "grandchild"),
            ]
        )

        with patch("engine.executor.update_node_execution", new=AsyncMock()) as update:
            skipped = await executor._skip_descendants_from("failed")

        self.assertEqual(skipped, {"child", "grandchild"})
        self.assertEqual(update.await_count, 2)


if __name__ == "__main__":
    unittest.main()
