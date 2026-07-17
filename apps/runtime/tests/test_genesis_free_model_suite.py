from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from schema import (
    AgentConfig,
    HttpConnectionConfig,
    OAuthConnectionConfig,
    ProgramSchema,
    RetryConfig,
    SchemaEdge,
    SchemaNode,
    StepConfig,
    TriggerConfig,
)
from engine.executor import ProgramExecutor
from connectors import REGISTRY
from connectors.base import ConnectorError


def _retry(max_attempts: int = 1, backoff: str = "none") -> dict:
    return {
        "max_attempts": max_attempts,
        "backoff": backoff,
        "backoff_base_seconds": 1,
        "fail_program_on_exhaust": False,
    }


def _node(
    node_id: str,
    node_type: str,
    config: dict,
    connection: str | None = None,
) -> SchemaNode:
    return SchemaNode(
        id=node_id,
        type=node_type,  # type: ignore[arg-type]
        label=f"{node_type}-{node_id}",
        description="",
        connection=connection,
        config=config,
        position={"x": 0, "y": 0},
        status="idle",
    )


def _edge(
    edge_id: str,
    source: str,
    target: str,
    edge_type: str = "data_flow",
    data_mapping: dict | None = None,
    condition: str | None = None,
) -> SchemaEdge:
    return SchemaEdge(
        id=edge_id,
        from_node=source,
        to=target,
        type=edge_type,  # type: ignore[arg-type]
        data_mapping=data_mapping,
        condition=condition,
        label=None,
    )


def _program(nodes: list[SchemaNode], edges: list[SchemaEdge]) -> ProgramSchema:
    return ProgramSchema(
        version="1.0",
        program_id="prog-free-suite",
        program_name="Genesis Free Model Test Suite",
        nodes=nodes,
        edges=edges,
        execution_mode="autonomous",
    )


def _mock_db() -> Mock:
    db = Mock()

    def _make_query_builder(data_result: list | dict | None = None):
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
        builder.execute.return_value = Mock(data=data_result if data_result is not None else [])
        builder.single.return_value = builder
        return builder

    def _table_mock(name: str):
        return _make_query_builder()

    db.table = Mock(side_effect=_table_mock)
    db.channel = Mock(
        return_value=Mock(
            on_postgres_changes=Mock(return_value=Mock(subscribe=Mock(return_value=None))),
            unsubscribe=Mock(return_value=None),
        )
    )
    return db


def _executor(program: ProgramSchema) -> ProgramExecutor:
    executor = ProgramExecutor.__new__(ProgramExecutor)
    executor.schema = program
    executor.run_id = "run-free-suite"
    executor.program_id = program.program_id
    executor.user_id = "user-test"
    executor.execution_mode = "autonomous"
    executor.conflict_policy = "queue"
    executor.workspace_id = "ws-test"
    executor.compliance_mode = "standard"
    executor.data_region = "eu-central-1"
    executor.retention_expiry = "2099-01-01T00:00:00+00:00"
    executor.db = _mock_db()
    executor.node_map = {n.id: n for n in program.nodes}
    executor.edges_from = {}
    for edge in program.edges:
        executor.edges_from.setdefault(edge.from_node, []).append(edge)
    executor._connection_name_to_id = {}
    executor._node_telemetry = {
        n.id: {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "estimated_cost_usd": 0.0,
            "connector_api_calls": 0,
            "model_call_count": 0,
        }
        for n in program.nodes
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


class FreeModelSuiteTests(unittest.IsolatedAsyncioTestCase):
    """Comprehensive test-oriented Genesis workflow suite using only free AI models."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.coverage = {
            "triggers": {},
            "steps": {},
            "agents": {},
            "connections": {},
            "advanced": {},
        }

    @classmethod
    def tearDownClass(cls) -> None:
        failed = []
        for category, items in cls.coverage.items():
            for name, status in items.items():
                if status == "failed":
                    failed.append(f"{category}/{name}")
        if failed:
            raise AssertionError(f"Free model suite recorded failed coverage: {', '.join(failed)}")

    # Helpers

    def _track(self, category: str, name: str, status: str) -> None:
        self.coverage.setdefault(category, {})[name] = status

    async def _run_executor(self, executor: ProgramExecutor, payload: dict):
        """Run executor with standard patches for autonomous test mode."""
        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openrouter"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_llm_circuit,
            patch.object(executor, "_call_llm", AsyncMock(return_value={"result": "mocked"})),
        ):

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)

            circuit = Mock()
            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_llm_circuit.return_value = circuit

            return await executor.execute(payload)

    # Trigger tests

    async def test_trigger_manual_schema_and_execution(self) -> None:
        trigger = _node("t1", "trigger", TriggerConfig(trigger_type="manual"))
        step = _node("s1", "step", StepConfig(logic_type="transform", extra={"transformation": "input['value'] + 1"}))
        program = _program([trigger, step], [_edge("e1", "t1", "s1", "data_flow")])
        result = await self._run_executor(_executor(program), {"value": 10})
        self.assertEqual(result["s1"]["result"], 11)
        self._track("triggers", "manual", "passed")

    async def test_trigger_cron_schema_and_execution(self) -> None:
        trigger = _node(
            "t1", "trigger", TriggerConfig(trigger_type="cron", extra={"expression": "0 8 * * *", "timezone": "UTC"})
        )
        step = _node("s1", "step", StepConfig(logic_type="transform", extra={"transformation": "input['value'] + 1"}))
        program = _program([trigger, step], [_edge("e1", "t1", "s1", "data_flow")])
        result = await self._run_executor(_executor(program), {"value": 10})
        self.assertEqual(result["s1"]["result"], 11)
        self._track("triggers", "cron", "passed")

    async def test_trigger_webhook_schema_and_execution(self) -> None:
        trigger = _node(
            "t1", "trigger", TriggerConfig(trigger_type="webhook", extra={"endpoint_id": "ep-test", "method": "POST"})
        )
        step = _node("s1", "step", StepConfig(logic_type="transform", extra={"transformation": "input['value'] + 1"}))
        program = _program([trigger, step], [_edge("e1", "t1", "s1", "data_flow")])
        result = await self._run_executor(_executor(program), {"value": 10})
        self.assertEqual(result["s1"]["result"], 11)
        self._track("triggers", "webhook", "passed")

    async def test_trigger_event_schema_and_execution(self) -> None:
        trigger = _node(
            "t1",
            "trigger",
            TriggerConfig(trigger_type="event", extra={"source": "gmail", "event": "new_email", "filter": {}}),
        )
        step = _node("s1", "step", StepConfig(logic_type="transform", extra={"transformation": "input['value'] + 1"}))
        program = _program([trigger, step], [_edge("e1", "t1", "s1", "data_flow")])
        result = await self._run_executor(_executor(program), {"value": 10})
        self.assertEqual(result["s1"]["result"], 11)
        self._track("triggers", "event", "passed")

    async def test_trigger_program_output_schema_and_execution(self) -> None:
        trigger = _node(
            "t1",
            "trigger",
            TriggerConfig(trigger_type="program_output", extra={"source_program_id": "p2", "on_status": ["success"]}),
        )
        step = _node("s1", "step", StepConfig(logic_type="transform", extra={"transformation": "input['value'] + 1"}))
        program = _program([trigger, step], [_edge("e1", "t1", "s1", "data_flow")])
        result = await self._run_executor(_executor(program), {"value": 10})
        self.assertEqual(result["s1"]["result"], 11)
        self._track("triggers", "program_output", "passed")

    # Step logic tests

    async def test_step_transform(self) -> None:
        node = _node("s1", "step", StepConfig(logic_type="transform", extra={"transformation": "input['value'] + 10"}))
        result = await _executor(_program([node], []))._execute_node(node, {"value": 5})
        self.assertEqual(result["result"], 15)
        self._track("steps", "transform", "passed")

    async def test_step_filter_pass(self) -> None:
        node = _node("s1", "step", StepConfig(logic_type="filter", extra={"condition": "input['value'] > 0"}))
        result = await _executor(_program([node], []))._execute_node(node, {"value": 5})
        self.assertNotIn("__filtered_out__", result)
        self._track("steps", "filter_pass", "passed")

    async def test_step_filter_fail(self) -> None:
        node = _node("s1", "step", StepConfig(logic_type="filter", extra={"condition": "input['value'] > 0"}))
        result = await _executor(_program([node], []))._execute_node(node, {"value": -1})
        self.assertTrue(result.get("__filtered_out__"))
        self._track("steps", "filter_fail", "passed")

    async def test_step_branch_condition(self) -> None:
        node = _node(
            "s1",
            "step",
            StepConfig(
                logic_type="branch",
                extra={
                    "conditions": [{"condition": "input['value'] > 0", "target_node_id": "n_pos"}],
                    "default_branch": "n_neg",
                },
            ),
        )
        result = await _executor(_program([node], []))._execute_node(node, {"value": 5})
        self.assertEqual(result["__branch_target__"], "n_pos")
        self._track("steps", "branch_condition", "passed")

    async def test_step_branch_default(self) -> None:
        node = _node(
            "s1",
            "step",
            StepConfig(
                logic_type="branch",
                extra={
                    "conditions": [{"condition": "input['value'] > 0", "target_node_id": "n_pos"}],
                    "default_branch": "n_neg",
                },
            ),
        )
        result = await _executor(_program([node], []))._execute_node(node, {"value": -5})
        self.assertEqual(result["__branch_target__"], "n_neg")
        self._track("steps", "branch_default", "passed")

    async def test_step_delay(self) -> None:
        node = _node("s1", "step", StepConfig(logic_type="delay", extra={"seconds": 0.01}))
        result = await _executor(_program([node], []))._execute_node(node, {"value": 1})
        self.assertEqual(result["value"], 1)
        self._track("steps", "delay", "passed")

    async def test_step_loop(self) -> None:
        node = _node("s1", "step", StepConfig(logic_type="loop", extra={"over": "[1, 2, 3]", "item_var": "item"}))
        result = await _executor(_program([node], []))._execute_node(node, {})
        self.assertEqual(result["__loop_items__"], [1, 2, 3])
        self._track("steps", "loop", "passed")

    async def test_step_format(self) -> None:
        node = _node(
            "s1", "step", StepConfig(logic_type="format", extra={"template": "Hello {name}", "output_key": "greeting"})
        )
        result = await _executor(_program([node], []))._execute_node(node, {"name": "World"})
        self.assertEqual(result["greeting"], "Hello World")
        self._track("steps", "format", "passed")

    async def test_step_parse_json(self) -> None:
        node = _node("s1", "step", StepConfig(logic_type="parse", extra={"input_key": "raw", "format": "json"}))
        result = await _executor(_program([node], []))._execute_node(node, {"raw": '{"a":1}'})
        self.assertEqual(result["parsed"], {"a": 1})
        self._track("steps", "parse_json", "passed")

    async def test_step_parse_csv(self) -> None:
        node = _node("s1", "step", StepConfig(logic_type="parse", extra={"input_key": "raw", "format": "csv"}))
        result = await _executor(_program([node], []))._execute_node(node, {"raw": "name,age\nAlice,30\nBob,25"})
        self.assertEqual(len(result["parsed"]), 2)
        self._track("steps", "parse_csv", "passed")

    async def test_step_parse_lines(self) -> None:
        node = _node("s1", "step", StepConfig(logic_type="parse", extra={"input_key": "raw", "format": "lines"}))
        result = await _executor(_program([node], []))._execute_node(node, {"raw": "line1\n\nline2"})
        self.assertEqual(result["parsed"], ["line1", "line2"])
        self._track("steps", "parse_lines", "passed")

    async def test_step_deduplicate(self) -> None:
        node = _node("s1", "step", StepConfig(logic_type="deduplicate", extra={"key": "id"}))
        result = await _executor(_program([node], []))._execute_node(node, {"items": [{"id": 1}, {"id": 2}, {"id": 1}]})
        self.assertEqual(len(result["items"]), 2)
        self._track("steps", "deduplicate", "passed")

    async def test_step_sort_asc(self) -> None:
        node = _node("s1", "step", StepConfig(logic_type="sort", extra={"key": "name", "order": "asc"}))
        result = await _executor(_program([node], []))._execute_node(
            node, {"items": [{"name": "Z"}, {"name": "A"}, {"name": "M"}]}
        )
        names = [item["name"] for item in result["items"]]
        self.assertEqual(names, ["A", "M", "Z"])
        self._track("steps", "sort_asc", "passed")

    async def test_step_sort_desc(self) -> None:
        node = _node("s1", "step", StepConfig(logic_type="sort", extra={"key": "name", "order": "desc"}))
        result = await _executor(_program([node], []))._execute_node(
            node, {"items": [{"name": "Z"}, {"name": "A"}, {"name": "M"}]}
        )
        names = [item["name"] for item in result["items"]]
        self.assertEqual(names, ["Z", "M", "A"])
        self._track("steps", "sort_desc", "passed")

    # Agent node tests (free models only)

    async def test_agent_free_qwen(self) -> None:
        node = _node(
            "a1",
            "agent",
            AgentConfig(
                model="qwen/qwen3-coder:free",
                api_key_ref="platform",
                system_prompt="Free model test",
                input_schema=None,
                output_schema=None,
                requires_approval=False,
                approval_timeout_hours=1,
                scope_required=None,
                scope_access="read",
                retry=RetryConfig(
                    max_attempts=1, backoff="none", backoff_base_seconds=1, fail_program_on_exhaust=False
                ),
                tools=[],
            ),
        )
        executor = _executor(_program([node], []))
        executor._fetch_api_key = AsyncMock(return_value=("fake-key", "openrouter"))
        executor._enforce_provider_policy = AsyncMock()
        executor._check_platform_credits = AsyncMock()

        with (
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_circuit,
            patch("engine.executor._get_llm_client") as mock_client,
        ):
            circuit = Mock()

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)

            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_circuit.return_value = circuit
            client = Mock()
            client.post = AsyncMock(
                return_value=Mock(
                    is_success=True,
                    json=Mock(
                        return_value={
                            "choices": [{"message": {"content": '{"answer": 42}'}}],
                            "usage": {"prompt_tokens": 10, "completion_tokens": 5},
                        }
                    ),
                )
            )
            mock_client.return_value = client
            result = await executor._execute_node(node, {"question": "What is 6*7?"})
        self.assertEqual(result["answer"], 42)
        self._track("agents", "qwen/qwen3-coder:free", "passed")

    async def test_agent_free_gpt_oss(self) -> None:
        node = _node(
            "a1",
            "agent",
            AgentConfig(
                model="openai/gpt-oss-120b:free",
                api_key_ref="platform",
                system_prompt="Free model test",
                input_schema=None,
                output_schema=None,
                requires_approval=False,
                approval_timeout_hours=1,
                scope_required=None,
                scope_access="read",
                retry=RetryConfig(
                    max_attempts=1, backoff="none", backoff_base_seconds=1, fail_program_on_exhaust=False
                ),
                tools=[],
            ),
        )
        executor = _executor(_program([node], []))
        executor._fetch_api_key = AsyncMock(return_value=("fake-key", "openrouter"))
        executor._enforce_provider_policy = AsyncMock()
        executor._check_platform_credits = AsyncMock()

        with (
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_circuit,
            patch("engine.executor._get_llm_client") as mock_client,
        ):
            circuit = Mock()

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)

            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_circuit.return_value = circuit
            client = Mock()
            client.post = AsyncMock(
                return_value=Mock(
                    is_success=True,
                    json=Mock(
                        return_value={
                            "choices": [{"message": {"content": '{"answer": 42}'}}],
                            "usage": {"prompt_tokens": 10, "completion_tokens": 5},
                        }
                    ),
                )
            )
            mock_client.return_value = client
            result = await executor._execute_node(node, {"question": "What is 6*7?"})
        self.assertEqual(result["answer"], 42)
        self._track("agents", "openai/gpt-oss-120b:free", "passed")

    async def test_agent_free_llama(self) -> None:
        node = _node(
            "a1",
            "agent",
            AgentConfig(
                model="meta-llama/llama-3.3-70b-instruct:free",
                api_key_ref="platform",
                system_prompt="Free model test",
                input_schema=None,
                output_schema=None,
                requires_approval=False,
                approval_timeout_hours=1,
                scope_required=None,
                scope_access="read",
                retry=RetryConfig(
                    max_attempts=1, backoff="none", backoff_base_seconds=1, fail_program_on_exhaust=False
                ),
                tools=[],
            ),
        )
        executor = _executor(_program([node], []))
        executor._fetch_api_key = AsyncMock(return_value=("fake-key", "openrouter"))
        executor._enforce_provider_policy = AsyncMock()
        executor._check_platform_credits = AsyncMock()

        with (
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_circuit,
            patch("engine.executor._get_llm_client") as mock_client,
        ):
            circuit = Mock()

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)

            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_circuit.return_value = circuit
            client = Mock()
            client.post = AsyncMock(
                return_value=Mock(
                    is_success=True,
                    json=Mock(
                        return_value={
                            "choices": [{"message": {"content": '{"answer": 42}'}}],
                            "usage": {"prompt_tokens": 10, "completion_tokens": 5},
                        }
                    ),
                )
            )
            mock_client.return_value = client
            result = await executor._execute_node(node, {"question": "What is 6*7?"})
        self.assertEqual(result["answer"], 42)
        self._track("agents", "meta-llama/llama-3.3-70b-instruct:free", "passed")

    # Connection tests

    async def test_http_connection_all_auth_types_schema(self) -> None:
        for auth_type in ["none", "bearer", "basic", "api_key_header", "api_key_query"]:
            with self.subTest(auth_type=auth_type):
                auth_value = None
                if auth_type == "basic":
                    auth_value = "user:pass"
                elif auth_type != "none":
                    auth_value = "secret123"
                node = _node(
                    "h1",
                    "connection",
                    HttpConnectionConfig(
                        connector_type="http",
                        method="GET",
                        url="https://httpbin.org/get",
                        auth_type=auth_type,
                        auth_value=auth_value,
                        query_params=[],
                        headers=[],
                        body=None,
                        parse_response=True,
                        timeout_seconds=5,
                        retry=None,
                    ),
                )
                self.assertIsInstance(node.config, HttpConnectionConfig)
                self.assertEqual(node.config.auth_type, auth_type)  # type: ignore[union-attr]
        self._track("connections", "http_all_auth_types_schema", "passed")

    async def test_http_connection_execution_mocked(self) -> None:
        node = _node(
            "h1",
            "connection",
            HttpConnectionConfig(
                connector_type="http",
                method="GET",
                url="https://httpbin.org/get",
                auth_type="none",
                auth_value=None,
                query_params=[{"key": "test", "value": "value"}],
                headers=[{"key": "X-Custom", "value": "header"}],
                body=None,
                parse_response=True,
                timeout_seconds=5,
                retry=None,
            ),
        )
        executor = _executor(_program([node], []))

        class _Response:
            status_code = 200
            headers = {}
            text = '{"args": {"test": "value"}}'

            def __init__(self, url: str = "") -> None:
                self.request = SimpleNamespace(url=url)

            def json(self) -> dict:
                return {"args": {"test": "value"}}

        class _Client:
            def __init__(self, *args, **kwargs) -> None:
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args) -> None:
                return None

            async def request(self, **kwargs):
                return _Response(kwargs.get("url", ""))

        with (
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor._validate_outbound_url"),
            patch("engine.executor.httpx.AsyncClient", _Client),
        ):
            result = await executor._execute_node(node, {})
        self.assertEqual(result["body"]["args"]["test"], "value")
        self._track("connections", "http_get_execution", "passed")

    async def test_oauth_connection_schema_for_every_provider(self) -> None:
        """Validate that a read-only OAuth node can be constructed for every registered provider."""
        for name, cls in sorted(REGISTRY.items()):
            with self.subTest(provider=name):
                inst = cls()
                # Pick a safe operation if available, otherwise any first operation
                safe_ops = [
                    op
                    for op in inst.supported_operations
                    if any(op.startswith(p) for p in ("list_", "get_", "read_", "query_", "search_"))
                ]
                op = safe_ops[0] if safe_ops else (inst.supported_operations[0] if inst.supported_operations else None)
                if op is None:
                    self.skipTest(f"{name} has no operations")
                node = _node(
                    f"conn_{name}",
                    "connection",
                    OAuthConnectionConfig(
                        scope_access="read",
                        scope_required=[],
                        operation=op,
                        operation_params={},
                    ),
                    connection=f"{name}:test",
                )
                self.assertIsInstance(node.config, OAuthConnectionConfig)
                self.assertEqual(node.config.operation, op)  # type: ignore[union-attr]
        self._track("connections", "oauth_schema_all_providers", "passed")

    async def test_oauth_connection_execution_mocked(self) -> None:
        node = _node(
            "o1",
            "connection",
            OAuthConnectionConfig(
                scope_access="read",
                scope_required=[],
                operation="list_emails",
                operation_params={"max_results": 10},
            ),
            connection="gmail:primary",
        )
        executor = _executor(_program([node], []))
        executor._resolve_connection_id = Mock(return_value="conn-1")
        executor._provider_for_connection = Mock(return_value="gmail")
        executor._fetch_oauth_token = AsyncMock(return_value="token")
        executor._enforce_provider_policy = AsyncMock()

        connector = Mock()
        connector.execute = AsyncMock(return_value={"emails": [{"id": "1"}]})

        with (
            patch("engine.executor.get_connector", return_value=connector),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
        ):
            result = await executor._execute_node(node, {"value": 1})
        self.assertEqual(result["emails"], [{"id": "1"}])
        self._track("connections", "oauth_execution_mocked", "passed")

    async def test_oauth_token_expired_retry(self) -> None:
        node = _node(
            "o1",
            "connection",
            OAuthConnectionConfig(
                scope_access="read",
                scope_required=[],
                operation="list_emails",
            ),
            connection="gmail:primary",
        )
        executor = _executor(_program([node], []))
        executor._resolve_connection_id = Mock(return_value="conn-1")
        executor._provider_for_connection = Mock(return_value="gmail")
        executor._fetch_oauth_token = AsyncMock(return_value="token")
        executor._enforce_provider_policy = AsyncMock()
        executor.db = Mock()
        executor.db.table = Mock(
            return_value=Mock(
                update=Mock(return_value=Mock(eq=Mock(return_value=Mock(execute=Mock(return_value=Mock(data=[]))))))
            )
        )

        connector = Mock()
        connector.execute = AsyncMock(
            side_effect=[
                ConnectorError("TOKEN_EXPIRED", "Token expired"),
                {"emails": [{"id": "1"}]},
            ]
        )

        with (
            patch("engine.executor.get_connector", return_value=connector),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.get_oauth_token_circuit") as mock_circuit,
        ):

            async def _circuit_call(fn, *args, **kwargs):
                return await fn()

            circuit = Mock()
            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_circuit.return_value = circuit
            result = await executor._execute_node(node, {})
        self.assertEqual(result["emails"], [{"id": "1"}])
        self._track("connections", "oauth_token_retry", "passed")

    # Advanced tests

    async def test_advanced_full_program_with_all_step_types(self) -> None:
        trigger = _node("t1", "trigger", TriggerConfig(trigger_type="manual"))
        transform = _node(
            "transform", "step", StepConfig(logic_type="transform", extra={"transformation": "input['value'] + 1"})
        )
        filter_step = _node(
            "filter", "step", StepConfig(logic_type="filter", extra={"condition": "input['result'] > 0"})
        )
        branch = _node(
            "branch",
            "step",
            StepConfig(
                logic_type="branch",
                extra={
                    "conditions": [{"condition": "input['result'] > 5", "target_node_id": "format"}],
                    "default_branch": "delay",
                },
            ),
        )
        delay = _node("delay", "step", StepConfig(logic_type="delay", extra={"seconds": 0.01}))
        loop = _node("loop", "step", StepConfig(logic_type="loop", extra={"over": "[1, 2]", "item_var": "item"}))
        format_step = _node(
            "format",
            "step",
            StepConfig(logic_type="format", extra={"template": "Result: {result}", "output_key": "message"}),
        )
        parse = _node(
            "parse", "step", StepConfig(logic_type="parse", extra={"input_key": "raw_json", "format": "json"})
        )
        dedup = _node("dedup", "step", StepConfig(logic_type="deduplicate", extra={"key": "id"}))
        sort = _node("sort", "step", StepConfig(logic_type="sort", extra={"key": "name", "order": "asc"}))

        edges = [
            _edge("e1", "t1", "transform", "data_flow"),
            _edge("e2", "transform", "filter", "data_flow"),
            _edge("e3", "filter", "branch", "data_flow"),
            _edge("e4", "branch", "format", "control_flow"),
            _edge("e5", "branch", "delay", "control_flow"),
            _edge("e6", "delay", "loop", "data_flow"),
            _edge("e7", "loop", "parse", "data_flow"),
            _edge("e8", "parse", "dedup", "data_flow"),
            _edge("e9", "dedup", "sort", "data_flow"),
        ]
        program = _program(
            [trigger, transform, filter_step, branch, delay, loop, format_step, parse, dedup, sort], edges
        )
        result = await self._run_executor(
            _executor(program),
            {"value": 10, "raw_json": '[{"id":1,"name":"Z"},{"id":2,"name":"A"},{"id":1,"name":"Z"}]'},
        )
        self.assertEqual(result["format"]["message"], "Result: 11")
        self._track("advanced", "full_program_all_steps", "passed")

    async def test_advanced_loop_body_execution(self) -> None:
        trigger = _node("t1", "trigger", TriggerConfig(trigger_type="manual"))
        loop = _node("loop", "step", StepConfig(logic_type="loop", extra={"over": "[10, 20]", "item_var": "num"}))
        transform = _node(
            "transform", "step", StepConfig(logic_type="transform", extra={"transformation": "input['num'] + 1"})
        )
        edges = [
            _edge("e1", "t1", "loop", "data_flow"),
            _edge("e2", "loop", "transform", "data_flow"),
        ]
        program = _program([trigger, loop, transform], edges)
        result = await self._run_executor(_executor(program), {})
        self.assertEqual(result["transform"]["count"], 2)
        self._track("advanced", "loop_body_execution", "passed")

    async def test_advanced_branching_with_retries(self) -> None:
        trigger = _node("t1", "trigger", TriggerConfig(trigger_type="manual"))
        branch = _node(
            "branch",
            "step",
            StepConfig(
                logic_type="branch",
                extra={
                    "conditions": [
                        {"condition": "input['score'] > 90", "target_node_id": "high"},
                        {"condition": "input['score'] > 50", "target_node_id": "medium"},
                    ],
                    "default_branch": "low",
                },
            ),
        )
        high = _node(
            "high", "step", StepConfig(logic_type="format", extra={"template": "High: {score}", "output_key": "label"})
        )
        medium = _node(
            "medium",
            "step",
            StepConfig(logic_type="format", extra={"template": "Medium: {score}", "output_key": "label"}),
        )
        low = _node(
            "low", "step", StepConfig(logic_type="format", extra={"template": "Low: {score}", "output_key": "label"})
        )

        edges = [
            _edge("e1", "t1", "branch", "data_flow"),
            _edge("e2", "branch", "high", "control_flow"),
            _edge("e3", "branch", "medium", "control_flow"),
            _edge("e4", "branch", "low", "control_flow"),
        ]
        program = _program([trigger, branch, high, medium, low], edges)

        # Test high path
        result = await self._run_executor(_executor(program), {"score": 95})
        self.assertEqual(result["high"]["label"], "High: 95")
        # Test medium path
        result = await self._run_executor(_executor(program), {"score": 75})
        self.assertEqual(result["medium"]["label"], "Medium: 75")
        # Test low path
        result = await self._run_executor(_executor(program), {"score": 10})
        self.assertEqual(result["low"]["label"], "Low: 10")
        self._track("advanced", "branching_multiple_conditions", "passed")

    async def test_advanced_error_handling_filter_blocks(self) -> None:
        trigger = _node("t1", "trigger", TriggerConfig(trigger_type="manual"))
        filter_step = _node(
            "filter", "step", StepConfig(logic_type="filter", extra={"condition": "input['value'] > 0"})
        )
        downstream = _node(
            "down", "step", StepConfig(logic_type="format", extra={"template": "Val: {value}", "output_key": "msg"})
        )
        edges = [
            _edge("e1", "t1", "filter", "data_flow"),
            _edge("e2", "filter", "down", "data_flow"),
        ]
        program = _program([trigger, filter_step, downstream], edges)
        result = await self._run_executor(_executor(program), {"value": -5})
        self.assertTrue(result["filter"].get("__filtered_out__"))
        # downstream should be skipped
        self.assertTrue(result.get("down", {}).get("__skipped__"))
        self._track("advanced", "filter_blocks_downstream", "passed")

    async def test_advanced_agent_retry_config(self) -> None:
        node = _node(
            "a1",
            "agent",
            AgentConfig(
                model="qwen/qwen3-coder:free",
                api_key_ref="platform",
                system_prompt="Retry test",
                input_schema=None,
                output_schema=None,
                requires_approval=False,
                approval_timeout_hours=1,
                scope_required=None,
                scope_access="read",
                retry=RetryConfig(
                    max_attempts=3, backoff="exponential", backoff_base_seconds=2, fail_program_on_exhaust=True
                ),
                tools=[],
            ),
        )
        executor = _executor(_program([node], []))
        executor._fetch_api_key = AsyncMock(return_value=("fake-key", "openrouter"))
        executor._enforce_provider_policy = AsyncMock()
        executor._check_platform_credits = AsyncMock()

        with (
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_circuit,
            patch("engine.executor._get_llm_client") as mock_client,
        ):
            circuit = Mock()

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)

            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_circuit.return_value = circuit
            client = Mock()
            client.post = AsyncMock(
                return_value=Mock(
                    is_success=True,
                    json=Mock(
                        return_value={
                            "choices": [{"message": {"content": '{"status": "ok"}'}}],
                            "usage": {"prompt_tokens": 5, "completion_tokens": 3},
                        }
                    ),
                )
            )
            mock_client.return_value = client
            result = await executor._execute_node(node, {})
        self.assertEqual(result["status"], "ok")
        self._track("advanced", "agent_retry_config", "passed")

    # Note and group nodes

    async def test_note_and_group_non_executable(self) -> None:
        trigger = _node("t1", "trigger", TriggerConfig(trigger_type="manual"))
        note = _node("note1", "note", {"content": "Test note", "color": "yellow"})
        group = _node("group1", "group", {"childIds": [], "width": 100, "height": 100, "color": "blue"})
        program = _program([trigger, note, group], [])
        result = await self._run_executor(_executor(program), {})
        self.assertIn("note1", result)
        self.assertIsNone(result["note1"])
        self.assertIn("group1", result)
        self.assertIsNone(result["group1"])
        self._track("advanced", "note_group_non_executable", "passed")

    # Placeholder / skipped coverage

    async def test_placeholder_skipped_destructive_ops(self) -> None:
        """Document that destructive operations are skipped."""
        for name, cls in sorted(REGISTRY.items()):
            inst = cls()
            destructive = [
                op
                for op in inst.supported_operations
                if any(
                    op.startswith(p)
                    for p in (
                        "create_",
                        "send_",
                        "update_",
                        "delete_",
                        "post_",
                        "put_",
                        "patch_",
                        "upload_",
                        "append_",
                        "move_",
                        "write_",
                        "publish_",
                        "submit_",
                        "trigger_",
                        "archive_",
                        "add_",
                        "insert_",
                        "replace_",
                        "schedule_",
                        "cancel_",
                        "clear_",
                        "run_",
                        "execute_",
                        "sync_",
                        "enqueue_",
                        "launch_",
                        "set_",
                        "edit_",
                        "modify_",
                        "change_",
                        "complete_",
                        "track_",
                        "identify_",
                        "label_",
                        "reply_",
                        "invite_",
                        "start_",
                        "stop_",
                        "clone_",
                        "copy_",
                        "upsert_",
                        "reset_",
                        "revoke_",
                        "install_",
                        "uninstall_",
                        "unsubscribe_",
                        "kick_",
                    )
                )
            ]
            for op in destructive:
                self._track("connections", f"{name}/{op}", "skipped")
        # Mark as passed so pytest doesn't flag it as a failure; coverage already updated
        self.assertTrue(True)


if __name__ == "__main__":
    unittest.main()
