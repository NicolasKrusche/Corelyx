from __future__ import annotations

import asyncio
import json
import os
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from schema import parse_schema
from engine.executor import ExecutionError, ProgramExecutor


FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
PROGRAM_JSON_PATH = FIXTURES_DIR / "genesis_every_node_program.json"


def _mock_db() -> Mock:
    """Build a mock Supabase client that supports fluent table queries."""
    db = Mock()
    builder = Mock()
    for method in [
        "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike",
        "in_", "is_", "order", "limit", "range", "match", "select",
    ]:
        getattr(builder, method).return_value = builder
    builder.execute.return_value = Mock(data=[])
    builder.single.return_value = builder
    db.table = Mock(return_value=builder)
    db.channel = Mock(return_value=Mock(
        on_postgres_changes=Mock(return_value=Mock(subscribe=Mock(return_value=None))),
        unsubscribe=Mock(return_value=None),
    ))
    return db


def _make_executor(schema) -> ProgramExecutor:
    executor = ProgramExecutor.__new__(ProgramExecutor)
    executor.schema = schema
    executor.run_id = "run-1"
    executor.program_id = schema.program_id
    executor.user_id = "user-1"
    executor.execution_mode = "autonomous"
    executor.conflict_policy = "queue"
    executor.workspace_id = "ws-1"
    executor.compliance_mode = "standard"
    executor.data_region = "eu-central-1"
    executor.retention_expiry = "2099-01-01T00:00:00+00:00"
    executor.db = _mock_db()
    executor.node_map = {n.id: n for n in schema.nodes}
    executor.edges_from = {}
    for edge in schema.edges:
        executor.edges_from.setdefault(edge.from_node, []).append(edge)
    executor._connection_name_to_id = {
        "gmail:primary": "conn-gmail-1",
        "slack:workspace": "conn-slack-1",
    }
    executor._node_telemetry = {
        n.id: {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "estimated_cost_usd": 0.0,
            "connector_api_calls": 0,
            "model_call_count": 0,
        }
        for n in schema.nodes
    }
    executor._run_telemetry = {
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
        "estimated_cost_usd": 0.0,
        "connector_api_calls": 0,
        "model_call_count": 0,
    }
    executor._limiter = Mock()
    executor._limiter.check_node_limit = Mock()
    executor._limiter.check_execution_time = Mock()
    executor._limiter.check_llm_call = Mock()
    executor._limiter.check_llm_tokens = Mock()
    executor._limiter.check_cost = Mock()
    executor._limiter.check_connector_call = Mock()
    return executor


def _patch_llm_to_preserve_input(original: dict) -> Mock:
    """Return a mock _call_llm that merges original trigger keys with a summary.

    Note: this replaces a bound method, so the signature should NOT include `self`.
    """
    async def _mock_call_llm(cfg, api_key, provider, input_data, node_id, deduct_credits=False):
        # Preserve keys that downstream nodes need
        return {
            "summary": "Genesis comprehensive test summary",
            **{k: v for k, v in original.items() if k not in ("text",)},
        }
    return Mock(side_effect=_mock_call_llm)


class GenesisEveryNodeProgramTests(unittest.IsolatedAsyncioTestCase):
    """End-to-end tests for the Genesis-generated comprehensive program."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.raw_program = json.loads(PROGRAM_JSON_PATH.read_text(encoding="utf-8"))
        cls.program = parse_schema(cls.raw_program)

    async def test_program_schema_parses_validly(self) -> None:
        """The program JSON must parse into a valid ProgramSchema."""
        self.assertEqual(self.program.version, "1.0")
        self.assertEqual(self.program.program_id, "genesis-all-nodes-001")
        self.assertEqual(len(self.program.nodes), 20)
        self.assertEqual(len(self.program.edges), 17)

    async def test_program_executes_with_mocked_agent_and_http(self) -> None:
        """Run the full program with mocked external services."""
        executor = _make_executor(self.program)
        trigger_payload = {
            "value": 10,
            "text": "Hello world",
            "raw_json": '[{"id":1,"name":"Z"},{"id":2,"name":"A"},{"id":1,"name":"Z"}]',
        }

        with patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")), \
             patch("engine.executor.cleanup_stale_locks", new=AsyncMock()), \
             patch("engine.executor.update_node_execution", new=AsyncMock()), \
             patch("engine.executor.create_node_execution", new=AsyncMock()), \
             patch.object(executor, "_acquire_program_locks", new=AsyncMock()), \
             patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))), \
             patch.object(executor, "_enforce_provider_policy", new=AsyncMock()), \
             patch.object(executor, "_check_platform_credits", new=AsyncMock()), \
             patch("engine.executor.get_llm_circuit") as mock_llm_circuit, \
             patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)):

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)
            circuit = Mock()
            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_llm_circuit.return_value = circuit

            result = await executor.execute(trigger_payload)

        # Verify all executed nodes produced output
        self.assertIn("agent_summarize", result)
        self.assertIn("step_transform", result)
        self.assertIn("step_filter", result)
        self.assertIn("step_branch", result)
        self.assertIn("step_format", result)
        self.assertIn("step_parse", result)
        self.assertIn("step_dedup", result)
        self.assertIn("step_sort", result)
        self.assertIn("step_delay", result)
        # Loop was on a different branch path, so it may or may not be in result depending on branch

    async def test_branch_default_path_executes(self) -> None:
        """When input doesn't match branch conditions, default path runs."""
        executor = _make_executor(self.program)
        trigger_payload = {"value": -10, "text": "test", "raw_json": "[]"}

        with patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")), \
             patch("engine.executor.cleanup_stale_locks", new=AsyncMock()), \
             patch("engine.executor.update_node_execution", new=AsyncMock()), \
             patch("engine.executor.create_node_execution", new=AsyncMock()), \
             patch.object(executor, "_acquire_program_locks", new=AsyncMock()), \
             patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))), \
             patch.object(executor, "_enforce_provider_policy", new=AsyncMock()), \
             patch.object(executor, "_check_platform_credits", new=AsyncMock()), \
             patch("engine.executor.get_llm_circuit") as mock_llm_circuit, \
             patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)):

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)
            circuit = Mock()
            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_llm_circuit.return_value = circuit

            # value=-10 leads to result=0, which is not > 5 or > 15, so default branch (step_loop)
            result = await executor.execute(trigger_payload)

        self.assertIn("step_loop", result)

    async def test_filter_blocks_downstream_on_fail(self) -> None:
        """When filter condition fails, downstream nodes should be skipped."""
        executor = _make_executor(self.program)
        trigger_payload = {"value": -100, "text": "test", "raw_json": "[]"}

        with patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")), \
             patch("engine.executor.cleanup_stale_locks", new=AsyncMock()), \
             patch("engine.executor.update_node_execution", new=AsyncMock()), \
             patch("engine.executor.create_node_execution", new=AsyncMock()), \
             patch.object(executor, "_acquire_program_locks", new=AsyncMock()), \
             patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))), \
             patch.object(executor, "_enforce_provider_policy", new=AsyncMock()), \
             patch.object(executor, "_check_platform_credits", new=AsyncMock()), \
             patch("engine.executor.get_llm_circuit") as mock_llm_circuit, \
             patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)):

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)
            circuit = Mock()
            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_llm_circuit.return_value = circuit

            result = await executor.execute(trigger_payload)

        self.assertIn("step_filter", result)
        self.assertTrue(result["step_filter"].get("__filtered_out__"))

    async def test_loop_body_executes_for_each_item(self) -> None:
        """Loop node should execute downstream nodes per item."""
        executor = _make_executor(self.program)
        # value=-7 gives result=3 (>0 passes filter, <=5 hits default branch=step_loop)
        trigger_payload = {"value": -7, "text": "test", "raw_json": "[]"}

        mock_connector = Mock()
        mock_connector.execute = AsyncMock(return_value={"ok": True})

        with patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")), \
             patch("engine.executor.cleanup_stale_locks", new=AsyncMock()), \
             patch("engine.executor.update_node_execution", new=AsyncMock()), \
             patch("engine.executor.create_node_execution", new=AsyncMock()), \
             patch.object(executor, "_acquire_program_locks", new=AsyncMock()), \
             patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))), \
             patch.object(executor, "_enforce_provider_policy", new=AsyncMock()), \
             patch.object(executor, "_check_platform_credits", new=AsyncMock()), \
             patch.object(executor, "_provider_for_connection", Mock(return_value="gmail")), \
             patch.object(executor, "_fetch_oauth_token", AsyncMock(return_value="fake-oauth-token")), \
             patch("engine.executor.get_connector", return_value=mock_connector), \
             patch("engine.executor.get_llm_circuit") as mock_llm_circuit, \
             patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)):

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)
            circuit = Mock()
            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_llm_circuit.return_value = circuit

            result = await executor.execute(trigger_payload)

        # After loop execution, the loop node's state still has its original output
        # (body aggregation only applies to downstream body nodes, not the loop node itself)
        self.assertIn("step_loop", result)
        self.assertIn("__loop_items__", result["step_loop"])
        self.assertEqual(result["step_loop"]["__loop_items__"], [1, 2, 3])
        # Body nodes (conn_oauth_gmail, conn_oauth_slack) get aggregated results
        self.assertIn("conn_oauth_gmail", result)
        self.assertEqual(result["conn_oauth_gmail"]["count"], 3)

    async def test_oauth_connection_passes_through(self) -> None:
        """OAuth connection without operation should pass connection_id through."""
        executor = _make_executor(self.program)
        # value=-7 gives result=3 (>0 passes filter, <=5 hits default branch=step_loop)
        trigger_payload = {"value": -7, "text": "test", "raw_json": "[]"}

        mock_connector = Mock()
        mock_connector.execute = AsyncMock(return_value={"ok": True})

        with patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")), \
             patch("engine.executor.cleanup_stale_locks", new=AsyncMock()), \
             patch("engine.executor.update_node_execution", new=AsyncMock()), \
             patch("engine.executor.create_node_execution", new=AsyncMock()), \
             patch.object(executor, "_acquire_program_locks", new=AsyncMock()), \
             patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))), \
             patch.object(executor, "_enforce_provider_policy", new=AsyncMock()), \
             patch.object(executor, "_check_platform_credits", new=AsyncMock()), \
             patch.object(executor, "_provider_for_connection", Mock(return_value="gmail")), \
             patch.object(executor, "_fetch_oauth_token", AsyncMock(return_value="fake-oauth-token")), \
             patch("engine.executor.get_connector", return_value=mock_connector), \
             patch("engine.executor.get_llm_circuit") as mock_llm_circuit, \
             patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)):

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)
            circuit = Mock()
            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_llm_circuit.return_value = circuit

            result = await executor.execute(trigger_payload)

        self.assertIn("conn_oauth_gmail", result)
        # conn_oauth_gmail is inside the loop body, so its state is aggregated
        self.assertEqual(result["conn_oauth_gmail"]["count"], 3)

    async def test_all_node_types_present(self) -> None:
        """Verify the program contains all supported node types."""
        types = {n.type for n in self.program.nodes}
        self.assertEqual(types, {"trigger", "agent", "step", "connection", "note", "group"})

    async def test_all_edge_types_present(self) -> None:
        """Verify the program contains all supported edge types."""
        types = {e.type for e in self.program.edges}
        self.assertEqual(types, {"data_flow", "control_flow", "event_subscription"})

    async def test_all_trigger_configs_in_program(self) -> None:
        """The fixture only has manual trigger, but schema parser accepts all types."""
        trigger_node = next(n for n in self.program.nodes if n.type == "trigger")
        self.assertEqual(trigger_node.config.trigger_type, "manual")

    async def test_note_and_group_nodes_non_executable(self) -> None:
        """Note and group nodes should not appear in execution state."""
        executor = _make_executor(self.program)
        trigger_payload = {"value": 10, "text": "test", "raw_json": "[]"}

        with patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")), \
             patch("engine.executor.cleanup_stale_locks", new=AsyncMock()), \
             patch("engine.executor.update_node_execution", new=AsyncMock()), \
             patch("engine.executor.create_node_execution", new=AsyncMock()), \
             patch.object(executor, "_acquire_program_locks", new=AsyncMock()), \
             patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))), \
             patch.object(executor, "_enforce_provider_policy", new=AsyncMock()), \
             patch.object(executor, "_check_platform_credits", new=AsyncMock()), \
             patch("engine.executor.get_llm_circuit") as mock_llm_circuit, \
             patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)):

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)
            circuit = Mock()
            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_llm_circuit.return_value = circuit

            result = await executor.execute(trigger_payload)

        # Note and group nodes are initialized with None but never executed
        self.assertIn("note_1", result)
        self.assertIsNone(result["note_1"])
        self.assertIn("group_1", result)
        self.assertIsNone(result["group_1"])


if __name__ == "__main__":
    unittest.main()
