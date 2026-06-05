from __future__ import annotations

import asyncio
import json
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from schema import parse_schema
from engine.executor import ExecutionError, ProgramExecutor


FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
PROGRAM_JSON_PATH = FIXTURES_DIR / "genesis_comprehensive_program.json"


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
    executor.dry_run = False
    return executor


def _patch_llm_to_preserve_input(original: dict) -> Mock:
    """Return a mock _call_llm that merges original trigger keys with a summary."""
    async def _mock_call_llm(cfg, api_key, provider, input_data, node_id, deduct_credits=False):
        return {
            "summary": "Genesis comprehensive test summary",
            **{k: v for k, v in original.items() if k not in ("text",)},
        }
    return Mock(side_effect=_mock_call_llm)


def _mock_http_response(status_code: int = 200, json_data: dict | None = None, text: str = "") -> Mock:
    """Build a mock httpx response."""
    response = Mock()
    response.status_code = status_code
    response.json.return_value = json_data if json_data is not None else {}
    response.text = text
    response.headers = {}
    response.request = Mock(url="https://httpbin.org/test")
    return response


class GenesisComprehensiveProgramTests(unittest.IsolatedAsyncioTestCase):
    """End-to-end tests for the Genesis-generated comprehensive program (from scratch)."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.raw_program = json.loads(PROGRAM_JSON_PATH.read_text(encoding="utf-8"))
        cls.program = parse_schema(cls.raw_program)

    async def test_program_schema_parses_validly(self) -> None:
        """The program JSON must parse into a valid ProgramSchema."""
        self.assertEqual(self.program.version, "1.0")
        self.assertEqual(self.program.program_id, "genesis-comprehensive-001")
        self.assertEqual(len(self.program.nodes), 21)
        self.assertEqual(len(self.program.edges), 18)

    async def test_all_node_types_present(self) -> None:
        """Verify the program contains all supported node types."""
        types = {n.type for n in self.program.nodes}
        self.assertEqual(types, {"trigger", "agent", "agent_task", "step", "connection", "note", "group"})

    async def test_all_edge_types_present(self) -> None:
        """Verify the program contains all supported edge types."""
        types = {e.type for e in self.program.edges}
        self.assertEqual(types, {"data_flow", "control_flow", "event_subscription"})

    async def test_high_branch_executes(self) -> None:
        """When value > 15, the high branch (format → parse → dedup → sort) runs."""
        executor = _make_executor(self.program)
        trigger_payload = {
            "value": 20,
            "text": "Hello world",
            "raw_json": '[{"id":1,"name":"Z"},{"id":2,"name":"A"},{"id":1,"name":"Z"}]',
            "items": [{"id": 1, "name": "Z"}, {"id": 2, "name": "A"}, {"id": 1, "name": "Z"}],
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

        self.assertIn("agent_summarize", result)
        self.assertIn("step_transform", result)
        self.assertIn("step_filter", result)
        self.assertIn("step_branch", result)
        self.assertIn("step_format", result)
        self.assertEqual(result["step_format"]["message"], "Hello, the result is 30")
        self.assertIn("step_parse", result)
        self.assertIn("step_dedup", result)
        self.assertIn("step_sort", result)
        # Medium and low branches should be skipped
        self.assertEqual(result.get("step_delay"), {"__skipped__": True})
        self.assertEqual(result.get("agent_task"), {"__skipped__": True})
        self.assertEqual(result.get("step_loop"), {"__skipped__": True})

    async def test_medium_branch_executes(self) -> None:
        """When 5 < value <= 15, the medium branch (delay → agent_task → HTTP chain) runs."""
        executor = _make_executor(self.program)
        trigger_payload = {
            "value": 10,
            "text": "Medium branch test",
            "raw_json": "[]",
            "items": [],
        }

        http_response = _mock_http_response(200, {"url": "https://httpbin.org/test"})
        llm_response = Mock()
        llm_response.is_success = True
        llm_response.json.return_value = {
            "choices": [{"message": {"content": "agent task summary"}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5},
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
             patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)), \
             patch("engine.executor._get_llm_client") as mock_llm_client, \
             patch("httpx.AsyncClient") as mock_http_client:

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)
            circuit = Mock()
            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_llm_circuit.return_value = circuit

            mock_llm_client.return_value.post = AsyncMock(return_value=llm_response)

            mock_client_instance = Mock()
            mock_client_instance.request = AsyncMock(return_value=http_response)
            mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client_instance.__aexit__ = AsyncMock(return_value=None)
            mock_http_client.return_value = mock_client_instance

            result = await executor.execute(trigger_payload)

        self.assertIn("step_delay", result)
        self.assertIn("agent_task", result)
        self.assertEqual(result["agent_task"]["summary"], "agent task summary")
        self.assertIn("conn_http_get", result)
        self.assertIn("conn_http_post", result)
        self.assertIn("conn_http_basic", result)
        self.assertIn("conn_http_api_key_header", result)
        self.assertIn("conn_http_api_key_query", result)
        # High and low branches should be skipped
        self.assertEqual(result.get("step_format"), {"__skipped__": True})
        self.assertEqual(result.get("step_loop"), {"__skipped__": True})

    async def test_low_branch_executes(self) -> None:
        """When value <= 5, the default/low branch (loop → oauth) runs."""
        executor = _make_executor(self.program)
        trigger_payload = {
            "value": 0,
            "text": "Low branch test",
            "raw_json": "[]",
            "items": [],
        }

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

        self.assertIn("step_loop", result)
        self.assertIn("__loop_items__", result["step_loop"])
        self.assertEqual(result["step_loop"]["__loop_items__"], [1, 2, 3])
        self.assertIn("conn_oauth_gmail", result)
        self.assertEqual(result["conn_oauth_gmail"]["count"], 3)
        self.assertIn("conn_oauth_slack", result)
        self.assertEqual(result["conn_oauth_slack"]["count"], 3)
        # High and medium branches should be skipped
        self.assertEqual(result.get("step_format"), {"__skipped__": True})
        self.assertEqual(result.get("step_delay"), {"__skipped__": True})

    async def test_filter_blocks_downstream_on_fail(self) -> None:
        """When filter condition fails, downstream nodes should be skipped."""
        executor = _make_executor(self.program)
        trigger_payload = {
            "value": -200,
            "text": "Filter block test",
            "raw_json": "[]",
            "items": [],
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

        self.assertIn("step_filter", result)
        self.assertTrue(result["step_filter"].get("__filtered_out__"))
        # Branch and all downstream should be skipped
        self.assertEqual(result.get("step_branch"), {"__skipped__": True})
        self.assertEqual(result.get("step_format"), {"__skipped__": True})
        self.assertEqual(result.get("step_delay"), {"__skipped__": True})
        self.assertEqual(result.get("step_loop"), {"__skipped__": True})

    async def test_loop_body_executes_for_each_item(self) -> None:
        """Loop node should execute downstream nodes per item with aggregated results."""
        executor = _make_executor(self.program)
        trigger_payload = {
            "value": 0,
            "text": "Loop test",
            "raw_json": "[]",
            "items": [],
        }

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

        self.assertIn("step_loop", result)
        self.assertIn("__loop_items__", result["step_loop"])
        self.assertEqual(result["step_loop"]["__loop_items__"], [1, 2, 3])
        self.assertIn("conn_oauth_gmail", result)
        self.assertEqual(result["conn_oauth_gmail"]["count"], 3)
        self.assertIn("conn_oauth_slack", result)
        self.assertEqual(result["conn_oauth_slack"]["count"], 3)

    async def test_note_and_group_nodes_non_executable(self) -> None:
        """Note and group nodes should be initialized but never executed as runtime work."""
        executor = _make_executor(self.program)
        trigger_payload = {
            "value": 20,
            "text": "test",
            "raw_json": "[]",
            "items": [],
        }

        with patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")), \
             patch("engine.executor.cleanup_stale_locks", new=AsyncMock()), \
             patch("engine.executor.update_node_execution", new=AsyncMock()), \
             patch("engine.executor.create_node_execution", new=AsyncMock()) as create_exec, \
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

        self.assertIn("note_1", result)
        self.assertIsNone(result["note_1"])
        self.assertIn("group_1", result)
        self.assertIsNone(result["group_1"])
        created_node_ids = {call.args[2] for call in create_exec.await_args_list}
        self.assertNotIn("note_1", created_node_ids)
        self.assertNotIn("group_1", created_node_ids)

    async def test_all_trigger_configs_in_program(self) -> None:
        """The fixture uses a manual trigger; schema parser must accept all trigger types."""
        trigger_node = next(n for n in self.program.nodes if n.type == "trigger")
        self.assertEqual(trigger_node.config.trigger_type, "manual")

    async def test_agent_task_node_executes(self) -> None:
        """Agent task node should execute and return a summary when on the medium branch."""
        executor = _make_executor(self.program)
        trigger_payload = {
            "value": 10,
            "text": "Agent task test",
            "raw_json": "[]",
            "items": [],
        }

        http_response = _mock_http_response(200, {"url": "https://httpbin.org/test"})
        llm_response = Mock()
        llm_response.is_success = True
        llm_response.json.return_value = {
            "choices": [{"message": {"content": "agent task summary"}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5},
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
             patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)), \
             patch("engine.executor._get_llm_client") as mock_llm_client, \
             patch("httpx.AsyncClient") as mock_http_client:

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)
            circuit = Mock()
            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_llm_circuit.return_value = circuit

            mock_llm_client.return_value.post = AsyncMock(return_value=llm_response)

            mock_client_instance = Mock()
            mock_client_instance.request = AsyncMock(return_value=http_response)
            mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client_instance.__aexit__ = AsyncMock(return_value=None)
            mock_http_client.return_value = mock_client_instance

            result = await executor.execute(trigger_payload)

        self.assertIn("agent_task", result)
        self.assertEqual(result["agent_task"]["summary"], "agent task summary")
        self.assertEqual(result["agent_task"]["dry_run"], False)
        self.assertIn("tool_calls", result["agent_task"])

    async def test_http_connections_resolve_and_return_status(self) -> None:
        """Every HTTP connection node in the medium branch should return a status_code."""
        executor = _make_executor(self.program)
        trigger_payload = {
            "value": 10,
            "text": "HTTP chain test",
            "raw_json": "[]",
            "items": [],
        }

        http_response = _mock_http_response(200, {"success": True})
        llm_response = Mock()
        llm_response.is_success = True
        llm_response.json.return_value = {
            "choices": [{"message": {"content": "agent task summary"}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5},
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
             patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)), \
             patch("engine.executor._get_llm_client") as mock_llm_client, \
             patch("httpx.AsyncClient") as mock_http_client:

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)
            circuit = Mock()
            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_llm_circuit.return_value = circuit

            mock_llm_client.return_value.post = AsyncMock(return_value=llm_response)

            mock_client_instance = Mock()
            mock_client_instance.request = AsyncMock(return_value=http_response)
            mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client_instance.__aexit__ = AsyncMock(return_value=None)
            mock_http_client.return_value = mock_client_instance

            result = await executor.execute(trigger_payload)

        for node_id in ["conn_http_get", "conn_http_post", "conn_http_basic", "conn_http_api_key_header", "conn_http_api_key_query"]:
            with self.subTest(node=node_id):
                self.assertIn(node_id, result)
                self.assertEqual(result[node_id]["status_code"], 200)

    async def test_oauth_connection_passes_through_without_operation(self) -> None:
        """OAuth connection without operation should pass connection_id through."""
        executor = _make_executor(self.program)
        trigger_payload = {
            "value": 0,
            "text": "OAuth pass-through test",
            "raw_json": "[]",
            "items": [],
        }

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
        # Each iteration should have connection_id
        iterations = result["conn_oauth_gmail"]["iterations"]
        self.assertTrue(all("connection_id" in it for it in iterations))

    async def test_dedup_and_sort_produce_correct_output(self) -> None:
        """The high branch should correctly deduplicate and sort the provided items."""
        executor = _make_executor(self.program)
        trigger_payload = {
            "value": 20,
            "text": "Dedup and sort test",
            "raw_json": '[{"id":1,"name":"Z"},{"id":2,"name":"A"},{"id":1,"name":"Z"}]',
            "items": [{"id": 1, "name": "Z"}, {"id": 2, "name": "A"}, {"id": 1, "name": "Z"}],
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

        self.assertIn("step_dedup", result)
        deduped_items = result["step_dedup"]["items"]
        self.assertEqual(len(deduped_items), 2)
        ids = [it["id"] for it in deduped_items]
        self.assertEqual(set(ids), {1, 2})

        self.assertIn("step_sort", result)
        sorted_items = result["step_sort"]["items"]
        names = [it["name"] for it in sorted_items]
        self.assertEqual(names, ["A", "Z"])


if __name__ == "__main__":
    unittest.main()
