from __future__ import annotations


import json
import socket
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

from schema import parse_schema
from connectors.base import ConnectorError
from engine.executor import ExecutionError, ProgramExecutor


FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
PROGRAM_JSON_PATH = FIXTURES_DIR / "genesis_comprehensive_program.json"


def _mock_db() -> Mock:
    """Build a mock Supabase client that supports fluent table queries."""
    db = Mock()
    builder = Mock()
    for method in [
        "eq",
        "neq",
        "gt",
        "gte",
        "lt",
        "lte",
        "like",
        "ilike",
        "in_",
        "is_",
        "order",
        "limit",
        "range",
        "match",
        "select",
    ]:
        getattr(builder, method).return_value = builder
    builder.execute.return_value = Mock(data=[])
    builder.single.return_value = builder
    db.table = Mock(return_value=builder)
    db.channel = Mock(
        return_value=Mock(
            on_postgres_changes=Mock(return_value=Mock(subscribe=Mock(return_value=None))),
            unsubscribe=Mock(return_value=None),
        )
    )
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
    executor._agent_credentials = None
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


def _mock_llm_chat_response(content: str = "agent task summary") -> Mock:
    """Build a mock LLM chat.completions response."""
    response = Mock()
    response.is_success = True
    response.json.return_value = {
        "choices": [{"message": {"content": content}}],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5},
    }
    return response


class GenesisComprehensiveProgramTests(unittest.IsolatedAsyncioTestCase):
    """End-to-end tests for the Genesis-generated comprehensive program (from scratch)."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.raw_program = json.loads(PROGRAM_JSON_PATH.read_text(encoding="utf-8"))
        cls.program = parse_schema(cls.raw_program)

    def setUp(self) -> None:
        # The fixture program's HTTP nodes point at httpbin.org, and
        # _validate_http_url resolves the hostname to screen it against the
        # private ranges before any request is built. These tests already mock
        # httpx.AsyncClient, so no HTTP call was going out — but that lookup is a
        # live DNS query, so the tests only passed while DNS was reachable and
        # while httpbin.org kept resolving to a public address.
        #
        # Stub the resolver to a fixed public IP: the SSRF check still runs its
        # real logic, offline and deterministically.
        resolver = patch(
            "engine.executor.socket.getaddrinfo",
            return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))],
        )
        resolver.start()
        self.addCleanup(resolver.stop)

    # ── Schema Structure Tests ───────────────────────────────────────────────

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

    async def test_program_metadata_correct(self) -> None:
        """Metadata fields must match expected values."""
        meta = self.raw_program["metadata"]
        self.assertEqual(
            meta["description"],
            "Comprehensive test program created from scratch covering every node type, step logic, connection auth type, edge type, and visual node.",
        )
        self.assertEqual(self.raw_program["program_name"], "Genesis Comprehensive Node and Connection Test")
        self.assertEqual(self.raw_program["version"], "1.0")
        self.assertFalse(meta["is_active"])
        self.assertIn("genesis", meta["tags"])

    async def test_trigger_node_config(self) -> None:
        """Trigger node must be manual and active."""
        trigger = next(n for n in self.program.nodes if n.type == "trigger")
        self.assertEqual(trigger.config.trigger_type, "manual")
        trig_index = next(t for t in self.raw_program["triggers"] if t["node_id"] == trigger.id)
        self.assertTrue(trig_index["is_active"])

    async def test_agent_node_config(self) -> None:
        """Agent node must have correct config values."""
        agent = next(n for n in self.program.nodes if n.id == "agent_summarize")
        cfg = agent.config
        self.assertEqual(cfg.model, "gpt-4o-mini")
        self.assertEqual(cfg.api_key_ref, "platform")
        self.assertFalse(cfg.requires_approval)
        self.assertEqual(cfg.scope_access, "read")
        self.assertEqual(cfg.retry.max_attempts, 1)

    async def test_agent_task_node_config(self) -> None:
        """Agent task node must have correct config values."""
        task = next(n for n in self.program.nodes if n.id == "agent_task")
        cfg = task.config
        self.assertEqual(cfg.objective, "Summarize the provided data briefly.")
        self.assertEqual(cfg.max_iterations, 1)
        self.assertEqual(cfg.scope_access, "read")
        self.assertFalse(cfg.requires_approval)

    async def test_note_node_config(self) -> None:
        """Note node must have content and color."""
        note_raw = next(n for n in self.raw_program["nodes"] if n["id"] == "note_1")
        self.assertEqual(
            note_raw["config"]["content"],
            "This program tests every supported node type, edge type, HTTP auth method, and OAuth connection pattern.",
        )
        self.assertEqual(note_raw["config"]["color"], "yellow")

    async def test_group_node_config(self) -> None:
        """Group node must contain correct child IDs."""
        group_raw = next(n for n in self.raw_program["nodes"] if n["id"] == "group_1")
        child_ids = set(group_raw["config"]["childIds"])
        expected = {
            "conn_http_get",
            "conn_http_post",
            "conn_http_basic",
            "conn_http_api_key_header",
            "conn_http_api_key_query",
        }
        self.assertEqual(child_ids, expected)
        self.assertEqual(group_raw["config"]["color"], "blue")

    async def test_all_nodes_have_unique_ids(self) -> None:
        """No duplicate node IDs allowed."""
        ids = [n.id for n in self.program.nodes]
        self.assertEqual(len(ids), len(set(ids)))

    async def test_all_edges_reference_real_nodes(self) -> None:
        """Every edge from/to must reference an existing node."""
        node_ids = {n.id for n in self.program.nodes}
        for edge in self.program.edges:
            self.assertIn(edge.from_node, node_ids, f"Edge {edge.id} from {edge.from_node} missing")
            self.assertIn(edge.to, node_ids, f"Edge {edge.id} to {edge.to} missing")

    async def test_version_history_is_empty(self) -> None:
        """Fresh program has empty version history."""
        self.assertEqual(self.raw_program["version_history"], [])

    async def test_execution_mode_is_autonomous(self) -> None:
        """Program runs in autonomous mode."""
        self.assertEqual(self.program.execution_mode, "autonomous")

    # ── Branch Execution Tests ────────────────────────────────────────────────

    async def test_high_branch_executes(self) -> None:
        """When value > 15, the high branch (format → parse → dedup → sort) runs."""
        executor = _make_executor(self.program)
        trigger_payload = {
            "value": 20,
            "text": "Hello world",
            "raw_json": '[{"id":1,"name":"Z"},{"id":2,"name":"A"},{"id":1,"name":"Z"}]',
            "items": [{"id": 1, "name": "Z"}, {"id": 2, "name": "A"}, {"id": 1, "name": "Z"}],
        }

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)),
        ):

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
        self.assertEqual(result.get("step_delay"), {"__skipped__": True})
        self.assertEqual(result.get("agent_task"), {"__skipped__": True})
        self.assertEqual(result.get("step_loop"), {"__skipped__": True})

    async def test_medium_branch_executes(self) -> None:
        """When 5 < value <= 15, the medium branch (delay → agent_task → HTTP chain) runs."""
        executor = _make_executor(self.program)
        trigger_payload = {"value": 10, "text": "Medium branch test", "raw_json": "[]", "items": []}
        http_response = _mock_http_response(200, {"url": "https://httpbin.org/test"})
        llm_response = _mock_llm_chat_response("agent task summary")

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)),
            patch("engine.executor._get_llm_client") as mock_llm_client,
            patch("httpx.AsyncClient") as mock_http_client,
        ):

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
        self.assertEqual(result.get("step_format"), {"__skipped__": True})
        self.assertEqual(result.get("step_loop"), {"__skipped__": True})

    async def test_low_branch_executes(self) -> None:
        """When value <= 5, the default/low branch (loop → oauth) runs."""
        executor = _make_executor(self.program)
        trigger_payload = {"value": 0, "text": "Low branch test", "raw_json": "[]", "items": []}
        mock_connector = Mock()
        mock_connector.execute = AsyncMock(return_value={"ok": True})

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch.object(executor, "_provider_for_connection", Mock(return_value="gmail")),
            patch.object(executor, "_fetch_oauth_token", AsyncMock(return_value="fake-oauth-token")),
            patch("engine.executor.get_connector", return_value=mock_connector),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)),
        ):

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
        self.assertEqual(result.get("step_format"), {"__skipped__": True})
        self.assertEqual(result.get("step_delay"), {"__skipped__": True})

    async def test_filter_blocks_downstream_on_fail(self) -> None:
        """When filter condition fails, downstream nodes should be skipped."""
        executor = _make_executor(self.program)
        trigger_payload = {"value": -200, "text": "Filter block test", "raw_json": "[]", "items": []}

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)),
        ):

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)

            circuit = Mock()
            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_llm_circuit.return_value = circuit

            result = await executor.execute(trigger_payload)

        self.assertIn("step_filter", result)
        self.assertTrue(result["step_filter"].get("__filtered_out__"))
        self.assertEqual(result.get("step_branch"), {"__skipped__": True})
        self.assertEqual(result.get("step_format"), {"__skipped__": True})
        self.assertEqual(result.get("step_delay"), {"__skipped__": True})
        self.assertEqual(result.get("step_loop"), {"__skipped__": True})

    async def test_filter_exactly_at_boundary_passes(self) -> None:
        """Filter condition value > -100; value = -99 should pass."""
        executor = _make_executor(self.program)
        trigger_payload = {"value": -99, "text": "Boundary test", "raw_json": "[]", "items": []}
        mock_connector = Mock()
        mock_connector.execute = AsyncMock(return_value={"ok": True})

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch.object(executor, "_provider_for_connection", Mock(return_value="gmail")),
            patch.object(executor, "_fetch_oauth_token", AsyncMock(return_value="fake-oauth-token")),
            patch("engine.executor.get_connector", return_value=mock_connector),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)),
        ):

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)

            circuit = Mock()
            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_llm_circuit.return_value = circuit

            result = await executor.execute(trigger_payload)

        self.assertIn("step_filter", result)
        self.assertNotIn("__filtered_out__", result["step_filter"])
        self.assertIn("step_branch", result)
        self.assertIn("step_loop", result)

    async def test_branch_second_condition_matches(self) -> None:
        """Branch with value=8 should match second condition (>5) not first (>15)."""
        executor = _make_executor(self.program)
        trigger_payload = {"value": 8, "text": "Second condition", "raw_json": "[]", "items": []}
        http_response = _mock_http_response(200)
        llm_response = _mock_llm_chat_response()

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)),
            patch("engine.executor._get_llm_client") as mock_llm_client,
            patch("httpx.AsyncClient") as mock_http_client,
        ):

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
        self.assertEqual(result.get("step_format"), {"__skipped__": True})

    async def test_loop_body_executes_for_each_item(self) -> None:
        """Loop node should execute downstream nodes per item with aggregated results."""
        executor = _make_executor(self.program)
        trigger_payload = {"value": 0, "text": "Loop test", "raw_json": "[]", "items": []}
        mock_connector = Mock()
        mock_connector.execute = AsyncMock(return_value={"ok": True})

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch.object(executor, "_provider_for_connection", Mock(return_value="gmail")),
            patch.object(executor, "_fetch_oauth_token", AsyncMock(return_value="fake-oauth-token")),
            patch("engine.executor.get_connector", return_value=mock_connector),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)),
        ):

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)

            circuit = Mock()
            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_llm_circuit.return_value = circuit

            result = await executor.execute(trigger_payload)

        self.assertIn("step_loop", result)
        self.assertEqual(result["step_loop"]["__loop_items__"], [1, 2, 3])
        self.assertIn("conn_oauth_gmail", result)
        self.assertEqual(result["conn_oauth_gmail"]["count"], 3)
        self.assertIn("conn_oauth_slack", result)
        self.assertEqual(result["conn_oauth_slack"]["count"], 3)

    # ── Step Logic Tests ─────────────────────────────────────────────────────

    async def test_transform_computes_correctly(self) -> None:
        """Transform step adds 10 to the input value."""
        executor = _make_executor(self.program)
        trigger_payload = {"value": 5, "text": "transform", "raw_json": "[]", "items": []}
        mock_connector = Mock()
        mock_connector.execute = AsyncMock(return_value={"ok": True})

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch.object(executor, "_provider_for_connection", Mock(return_value="gmail")),
            patch.object(executor, "_fetch_oauth_token", AsyncMock(return_value="fake-oauth-token")),
            patch("engine.executor.get_connector", return_value=mock_connector),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)),
        ):

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)

            circuit = Mock()
            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_llm_circuit.return_value = circuit

            result = await executor.execute(trigger_payload)

        self.assertIn("step_transform", result)
        self.assertEqual(result["step_transform"]["result"], 15)

    async def test_format_step_output_key(self) -> None:
        """Format step should populate output_key."""
        executor = _make_executor(self.program)
        trigger_payload = {"value": 20, "text": "format", "raw_json": "[]", "items": []}

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)),
        ):

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)

            circuit = Mock()
            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_llm_circuit.return_value = circuit

            result = await executor.execute(trigger_payload)

        self.assertIn("step_format", result)
        self.assertIn("message", result["step_format"])
        self.assertIn("30", result["step_format"]["message"])

    async def test_parse_step_json(self) -> None:
        """Parse step should convert raw_json string to object."""
        executor = _make_executor(self.program)
        trigger_payload = {"value": 20, "text": "parse", "raw_json": '{"key":"val"}', "items": []}

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)),
        ):

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)

            circuit = Mock()
            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_llm_circuit.return_value = circuit

            result = await executor.execute(trigger_payload)

        self.assertIn("step_parse", result)
        self.assertEqual(result["step_parse"]["parsed"], {"key": "val"})

    async def test_dedup_step_removes_duplicates(self) -> None:
        """Deduplicate step should remove duplicate items by id."""
        executor = _make_executor(self.program)
        trigger_payload = {
            "value": 20,
            "text": "dedup",
            "raw_json": '[{"id":1,"name":"Z"},{"id":2,"name":"A"},{"id":1,"name":"Z"}]',
            "items": [{"id": 1, "name": "Z"}, {"id": 2, "name": "A"}, {"id": 1, "name": "Z"}],
        }

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)),
        ):

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)

            circuit = Mock()
            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_llm_circuit.return_value = circuit

            result = await executor.execute(trigger_payload)

        self.assertIn("step_dedup", result)
        ids = {it["id"] for it in result["step_dedup"]["items"]}
        self.assertEqual(ids, {1, 2})

    async def test_sort_step_orders_ascending(self) -> None:
        """Sort step should order items by name ascending."""
        executor = _make_executor(self.program)
        trigger_payload = {
            "value": 20,
            "text": "sort",
            "raw_json": '[{"id":1,"name":"Z"},{"id":2,"name":"A"},{"id":1,"name":"Z"}]',
            "items": [{"id": 1, "name": "Z"}, {"id": 2, "name": "A"}, {"id": 1, "name": "Z"}],
        }

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)),
        ):

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)

            circuit = Mock()
            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_llm_circuit.return_value = circuit

            result = await executor.execute(trigger_payload)

        self.assertIn("step_sort", result)
        names = [it["name"] for it in result["step_sort"]["items"]]
        self.assertEqual(names, ["A", "Z"])

    async def test_delay_step_preserves_input(self) -> None:
        """Delay step should pass input through unchanged."""
        executor = _make_executor(self.program)
        trigger_payload = {"value": 10, "text": "delay", "raw_json": "[]", "items": []}
        http_response = _mock_http_response(200)
        llm_response = _mock_llm_chat_response()

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)),
            patch("engine.executor._get_llm_client") as mock_llm_client,
            patch("httpx.AsyncClient") as mock_http_client,
        ):

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
        self.assertEqual(result["step_delay"]["value"], 10)

    # ── Connection Tests ────────────────────────────────────────────────────────

    async def test_http_get_returns_status_200(self) -> None:
        """HTTP GET connection should return 200."""
        executor = _make_executor(self.program)
        trigger_payload = {"value": 10, "text": "http", "raw_json": "[]", "items": []}
        http_response = _mock_http_response(200, {"args": {"test": "value"}})
        llm_response = _mock_llm_chat_response()

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)),
            patch("engine.executor._get_llm_client") as mock_llm_client,
            patch("httpx.AsyncClient") as mock_http_client,
        ):

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

        self.assertEqual(result["conn_http_get"]["status_code"], 200)

    async def test_http_post_bearer_auth(self) -> None:
        """HTTP POST with bearer token should succeed."""
        executor = _make_executor(self.program)
        trigger_payload = {"value": 10, "text": "bearer", "raw_json": "[]", "items": []}
        http_response = _mock_http_response(200, {"json": {"key": "value"}})
        llm_response = _mock_llm_chat_response()

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)),
            patch("engine.executor._get_llm_client") as mock_llm_client,
            patch("httpx.AsyncClient") as mock_http_client,
        ):

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

        self.assertEqual(result["conn_http_post"]["status_code"], 200)

    async def test_http_basic_auth(self) -> None:
        """HTTP PUT with basic auth should succeed."""
        executor = _make_executor(self.program)
        trigger_payload = {"value": 10, "text": "basic", "raw_json": "[]", "items": []}
        http_response = _mock_http_response(200)
        llm_response = _mock_llm_chat_response()

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)),
            patch("engine.executor._get_llm_client") as mock_llm_client,
            patch("httpx.AsyncClient") as mock_http_client,
        ):

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

        self.assertEqual(result["conn_http_basic"]["status_code"], 200)

    async def test_http_api_key_header(self) -> None:
        """HTTP PATCH with API key in header should succeed."""
        executor = _make_executor(self.program)
        trigger_payload = {"value": 10, "text": "api header", "raw_json": "[]", "items": []}
        http_response = _mock_http_response(200)
        llm_response = _mock_llm_chat_response()

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)),
            patch("engine.executor._get_llm_client") as mock_llm_client,
            patch("httpx.AsyncClient") as mock_http_client,
        ):

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

        self.assertEqual(result["conn_http_api_key_header"]["status_code"], 200)

    async def test_http_api_key_query(self) -> None:
        """HTTP DELETE with API key in query should succeed."""
        executor = _make_executor(self.program)
        trigger_payload = {"value": 10, "text": "api query", "raw_json": "[]", "items": []}
        http_response = _mock_http_response(200)
        llm_response = _mock_llm_chat_response()

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)),
            patch("engine.executor._get_llm_client") as mock_llm_client,
            patch("httpx.AsyncClient") as mock_http_client,
        ):

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

        self.assertEqual(result["conn_http_api_key_query"]["status_code"], 200)

    async def test_oauth_connection_passes_through(self) -> None:
        """OAuth connection without operation should pass connection_id through."""
        executor = _make_executor(self.program)
        trigger_payload = {"value": 0, "text": "OAuth pass-through test", "raw_json": "[]", "items": []}
        mock_connector = Mock()
        mock_connector.execute = AsyncMock(return_value={"ok": True})

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch.object(executor, "_provider_for_connection", Mock(return_value="gmail")),
            patch.object(executor, "_fetch_oauth_token", AsyncMock(return_value="fake-oauth-token")),
            patch("engine.executor.get_connector", return_value=mock_connector),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)),
        ):

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)

            circuit = Mock()
            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_llm_circuit.return_value = circuit

            result = await executor.execute(trigger_payload)

        self.assertIn("conn_oauth_gmail", result)
        self.assertEqual(result["conn_oauth_gmail"]["count"], 3)
        iterations = result["conn_oauth_gmail"]["iterations"]
        self.assertTrue(all("connection_id" in it for it in iterations))

    async def test_oauth_slack_operation_inside_loop(self) -> None:
        """OAuth slack operation should execute inside the loop body."""
        executor = _make_executor(self.program)
        trigger_payload = {"value": 0, "text": "slack loop", "raw_json": "[]", "items": []}
        mock_connector = Mock()
        mock_connector.execute = AsyncMock(return_value={"ts": "123", "channel": "#general"})

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch.object(executor, "_provider_for_connection", Mock(return_value="slack")),
            patch.object(executor, "_fetch_oauth_token", AsyncMock(return_value="fake-oauth-token")),
            patch("engine.executor.get_connector", return_value=mock_connector),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)),
        ):

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)

            circuit = Mock()
            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_llm_circuit.return_value = circuit

            result = await executor.execute(trigger_payload)

        self.assertIn("conn_oauth_slack", result)
        self.assertEqual(result["conn_oauth_slack"]["count"], 3)
        iterations = result["conn_oauth_slack"]["iterations"]
        self.assertTrue(all(it.get("ts") == "123" for it in iterations))

    # ── Agent and Agent Task Tests ──────────────────────────────────────────

    async def test_agent_node_executes_and_returns_summary(self) -> None:
        """Agent node should execute and return a summary."""
        executor = _make_executor(self.program)
        trigger_payload = {"value": 20, "text": "agent", "raw_json": "[]", "items": []}

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)),
        ):

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)

            circuit = Mock()
            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_llm_circuit.return_value = circuit

            result = await executor.execute(trigger_payload)

        self.assertIn("agent_summarize", result)
        self.assertEqual(result["agent_summarize"]["summary"], "Genesis comprehensive test summary")

    async def test_agent_task_node_executes(self) -> None:
        """Agent task node should execute and return a summary when on the medium branch."""
        executor = _make_executor(self.program)
        trigger_payload = {"value": 10, "text": "Agent task test", "raw_json": "[]", "items": []}
        http_response = _mock_http_response(200)
        llm_response = _mock_llm_chat_response("agent task summary")

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)),
            patch("engine.executor._get_llm_client") as mock_llm_client,
            patch("httpx.AsyncClient") as mock_http_client,
        ):

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

    # ── Visual Node Tests ─────────────────────────────────────────────────────

    async def test_note_and_group_nodes_non_executable(self) -> None:
        """Note and group nodes should be initialized but never executed as runtime work."""
        executor = _make_executor(self.program)
        trigger_payload = {"value": 20, "text": "test", "raw_json": "[]", "items": []}

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()) as create_exec,
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)),
        ):

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

    # ── Error Handling Tests ────────────────────────────────────────────────

    async def test_http_connection_failure_raises(self) -> None:
        """HTTP connection returning 4xx should raise ExecutionError."""
        executor = _make_executor(self.program)
        trigger_payload = {"value": 10, "text": "http fail", "raw_json": "[]", "items": []}
        http_response = _mock_http_response(404, text="Not Found")
        llm_response = _mock_llm_chat_response()

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)),
            patch("engine.executor._get_llm_client") as mock_llm_client,
            patch("httpx.AsyncClient") as mock_http_client,
        ):

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

            with self.assertRaises(ExecutionError) as ctx:
                await executor.execute(trigger_payload)
            self.assertEqual(ctx.exception.code, "HTTP_REQUEST_FAILED")

    async def test_oauth_connector_not_found_raises(self) -> None:
        """OAuth operation with missing connector should raise ExecutionError."""
        executor = _make_executor(self.program)
        trigger_payload = {"value": 0, "text": "missing connector", "raw_json": "[]", "items": []}

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch.object(executor, "_provider_for_connection", Mock(return_value="unknown")),
            patch.object(executor, "_fetch_oauth_token", AsyncMock(return_value="fake-oauth-token")),
            patch("engine.executor.get_connector", return_value=None),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)),
        ):

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)

            circuit = Mock()
            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_llm_circuit.return_value = circuit

            with self.assertRaises(ExecutionError) as ctx:
                await executor.execute(trigger_payload)
            self.assertEqual(ctx.exception.code, "CONNECTOR_NOT_FOUND")

    async def test_oauth_token_expired_retry(self) -> None:
        """OAuth connector raising TOKEN_EXPIRED should trigger token refresh and retry."""
        executor = _make_executor(self.program)
        trigger_payload = {"value": 0, "text": "token expired", "raw_json": "[]", "items": []}
        _call_count = 0

        async def _token_side_effect(*args, **kwargs):
            nonlocal _call_count
            _call_count += 1
            if _call_count == 1:
                raise ConnectorError("TOKEN_EXPIRED", "Token expired")
            return {"ok": True}

        mock_connector = Mock()
        mock_connector.execute = AsyncMock(side_effect=_token_side_effect)

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch.object(executor, "_provider_for_connection", Mock(return_value="slack")),
            patch.object(executor, "_fetch_oauth_token", AsyncMock(return_value="fake-oauth-token")),
            patch("engine.executor.get_connector", return_value=mock_connector),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)),
        ):

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)

            circuit = Mock()
            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_llm_circuit.return_value = circuit

            result = await executor.execute(trigger_payload)

        self.assertIn("conn_oauth_slack", result)

    # ── Telemetry Tests ───────────────────────────────────────────────────────

    async def test_telemetry_tracks_connector_calls(self) -> None:
        """Connector API calls should be recorded in telemetry."""
        executor = _make_executor(self.program)
        trigger_payload = {"value": 10, "text": "telemetry", "raw_json": "[]", "items": []}
        http_response = _mock_http_response(200)
        llm_response = _mock_llm_chat_response()

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)),
            patch("engine.executor._get_llm_client") as mock_llm_client,
            patch("httpx.AsyncClient") as mock_http_client,
        ):

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

            await executor.execute(trigger_payload)

        self.assertGreaterEqual(executor._run_telemetry["connector_api_calls"], 5)

    async def test_telemetry_tracks_llm_calls(self) -> None:
        """LLM calls should be recorded in telemetry via _call_llm."""
        executor = _make_executor(self.program)
        trigger_payload = {"value": 20, "text": "llm telemetry", "raw_json": "[]", "items": []}
        call_made = [False]

        async def _tracking_llm(cfg, api_key, provider, input_data, node_id, deduct_credits=False):
            call_made[0] = True
            executor._record_telemetry(node_id, model_call_count=1)
            return {"summary": "test"}

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", Mock(side_effect=_tracking_llm)),
        ):

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)

            circuit = Mock()
            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_llm_circuit.return_value = circuit

            await executor.execute(trigger_payload)

        self.assertTrue(call_made[0])
        self.assertGreaterEqual(executor._run_telemetry["model_call_count"], 1)

    # ── Integration Validation Tests ──────────────────────────────────────────

    async def test_dedup_and_sort_produce_correct_output(self) -> None:
        """The high branch should correctly deduplicate and sort the provided items."""
        executor = _make_executor(self.program)
        trigger_payload = {
            "value": 20,
            "text": "Dedup and sort test",
            "raw_json": '[{"id":1,"name":"Z"},{"id":2,"name":"A"},{"id":1,"name":"Z"}]',
            "items": [{"id": 1, "name": "Z"}, {"id": 2, "name": "A"}, {"id": 1, "name": "Z"}],
        }

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)),
        ):

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

    async def test_trigger_payload_carries_through_program(self) -> None:
        """Trigger payload values should be accessible in downstream nodes."""
        executor = _make_executor(self.program)
        trigger_payload = {"value": 20, "text": "carry through", "raw_json": "[]", "items": []}

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", _patch_llm_to_preserve_input(trigger_payload)),
        ):

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)

            circuit = Mock()
            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_llm_circuit.return_value = circuit

            result = await executor.execute(trigger_payload)

        self.assertIn("trigger_manual", result)
        self.assertEqual(result["trigger_manual"]["value"], 20)
        self.assertEqual(result["trigger_manual"]["text"], "carry through")

    async def test_program_has_no_orphan_nodes(self) -> None:
        """Every executable node must be reachable from the trigger."""
        trigger = next(n for n in self.program.nodes if n.type == "trigger")
        reachable = {trigger.id}
        frontier = [trigger.id]
        while frontier:
            nid = frontier.pop()
            for edge in self.program.edges:
                if edge.from_node == nid and edge.to not in reachable:
                    reachable.add(edge.to)
                    frontier.append(edge.to)
        executable = {n.id for n in self.program.nodes if n.type not in ("note", "group")}
        self.assertEqual(reachable, executable)

    async def test_raw_program_is_valid_json(self) -> None:
        """Fixture must be valid JSON and round-trip correctly."""
        text = PROGRAM_JSON_PATH.read_text(encoding="utf-8")
        parsed = json.loads(text)
        self.assertEqual(parsed["program_id"], "genesis-comprehensive-001")
        re_serialized = json.dumps(parsed)
        self.assertTrue(len(re_serialized) > 0)


if __name__ == "__main__":
    unittest.main()
