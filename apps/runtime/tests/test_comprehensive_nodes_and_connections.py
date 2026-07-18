from __future__ import annotations

import unittest
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
    parse_schema,
)
from engine.executor import PLATFORM_DEFAULT_MODEL, ExecutionError, ProgramExecutor
from connectors import REGISTRY, get_connector
from connectors.base import IConnector, ConnectorError


def _retry() -> dict:
    return {
        "max_attempts": 1,
        "backoff": "none",
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
        program_id="prog-1",
        program_name="comprehensive-test",
        nodes=nodes,
        edges=edges,
        execution_mode="autonomous",
    )


def _mock_db() -> Mock:
    """Build a mock Supabase client that supports fluent table queries."""
    db = Mock()

    # Build a single fluent query-builder mock that returns itself for all
    # chain methods and returns data for execute() / single().execute().
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
    # Patch DB and other external dependencies
    executor = ProgramExecutor.__new__(ProgramExecutor)
    executor.schema = program
    executor.run_id = "run-1"
    executor.program_id = "prog-1"
    executor.user_id = "user-1"
    executor.execution_mode = "autonomous"
    executor.conflict_policy = "queue"
    executor.workspace_id = "ws-1"
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
    executor.dry_run = False
    return executor


# ─── Schema Parsing Tests ───────────────────────────────────────────────────


class SchemaParsingTests(unittest.TestCase):
    def test_parse_trigger_manual(self) -> None:
        raw = {
            "version": "1.0",
            "program_id": "p1",
            "program_name": "test",
            "execution_mode": "autonomous",
            "nodes": [
                {
                    "id": "t1",
                    "type": "trigger",
                    "label": "Trigger",
                    "description": "",
                    "position": {},
                    "status": "idle",
                    "connection": None,
                    "config": {"trigger_type": "manual"},
                }
            ],
            "edges": [],
        }
        prog = parse_schema(raw)
        self.assertEqual(prog.nodes[0].config.trigger_type, "manual")  # type: ignore[union-attr]

    def test_parse_trigger_cron(self) -> None:
        raw = {
            "version": "1.0",
            "program_id": "p1",
            "program_name": "test",
            "execution_mode": "autonomous",
            "nodes": [
                {
                    "id": "t1",
                    "type": "trigger",
                    "label": "Trigger",
                    "description": "",
                    "position": {},
                    "status": "idle",
                    "connection": None,
                    "config": {"trigger_type": "cron", "expression": "0 0 * * *", "timezone": "UTC"},
                }
            ],
            "edges": [],
        }
        prog = parse_schema(raw)
        self.assertEqual(prog.nodes[0].config.trigger_type, "cron")  # type: ignore[union-attr]

    def test_parse_trigger_event(self) -> None:
        raw = {
            "version": "1.0",
            "program_id": "p1",
            "program_name": "test",
            "execution_mode": "autonomous",
            "nodes": [
                {
                    "id": "t1",
                    "type": "trigger",
                    "label": "Trigger",
                    "description": "",
                    "position": {},
                    "status": "idle",
                    "connection": None,
                    "config": {"trigger_type": "event", "source": "gmail", "event": "new_email", "filter": {}},
                }
            ],
            "edges": [],
        }
        prog = parse_schema(raw)
        self.assertEqual(prog.nodes[0].config.trigger_type, "event")  # type: ignore[union-attr]

    def test_parse_trigger_webhook(self) -> None:
        raw = {
            "version": "1.0",
            "program_id": "p1",
            "program_name": "test",
            "execution_mode": "autonomous",
            "nodes": [
                {
                    "id": "t1",
                    "type": "trigger",
                    "label": "Trigger",
                    "description": "",
                    "position": {},
                    "status": "idle",
                    "connection": None,
                    "config": {"trigger_type": "webhook", "endpoint_id": "ep1", "method": "POST"},
                }
            ],
            "edges": [],
        }
        prog = parse_schema(raw)
        self.assertEqual(prog.nodes[0].config.trigger_type, "webhook")  # type: ignore[union-attr]

    def test_parse_trigger_program_output(self) -> None:
        raw = {
            "version": "1.0",
            "program_id": "p1",
            "program_name": "test",
            "execution_mode": "autonomous",
            "nodes": [
                {
                    "id": "t1",
                    "type": "trigger",
                    "label": "Trigger",
                    "description": "",
                    "position": {},
                    "status": "idle",
                    "connection": None,
                    "config": {"trigger_type": "program_output", "source_program_id": "p2", "on_status": ["success"]},
                }
            ],
            "edges": [],
        }
        prog = parse_schema(raw)
        self.assertEqual(prog.nodes[0].config.trigger_type, "program_output")  # type: ignore[union-attr]

    def test_parse_agent_node(self) -> None:
        raw = {
            "version": "1.0",
            "program_id": "p1",
            "program_name": "test",
            "execution_mode": "autonomous",
            "nodes": [
                {
                    "id": "a1",
                    "type": "agent",
                    "label": "Agent",
                    "description": "",
                    "position": {},
                    "status": "idle",
                    "connection": None,
                    "config": {
                        "model": "gpt-4",
                        "api_key_ref": "platform",
                        "system_prompt": "You are helpful",
                        "input_schema": None,
                        "output_schema": {"type": "object"},
                        "requires_approval": False,
                        "approval_timeout_hours": 1,
                        "scope_required": None,
                        "scope_access": "read",
                        "retry": _retry(),
                        "tools": [],
                    },
                }
            ],
            "edges": [],
        }
        prog = parse_schema(raw)
        cfg = prog.nodes[0].config
        self.assertIsInstance(cfg, AgentConfig)
        self.assertEqual(cfg.model, "gpt-4")  # type: ignore[union-attr]

    def test_parse_step_transform(self) -> None:
        raw = {
            "version": "1.0",
            "program_id": "p1",
            "program_name": "test",
            "execution_mode": "autonomous",
            "nodes": [
                {
                    "id": "s1",
                    "type": "step",
                    "label": "Step",
                    "description": "",
                    "position": {},
                    "status": "idle",
                    "connection": None,
                    "config": {"logic_type": "transform", "transformation": "input['value'] + 1"},
                }
            ],
            "edges": [],
        }
        prog = parse_schema(raw)
        cfg = prog.nodes[0].config
        self.assertIsInstance(cfg, StepConfig)
        self.assertEqual(cfg.logic_type, "transform")  # type: ignore[union-attr]

    def test_parse_step_filter(self) -> None:
        raw = {
            "version": "1.0",
            "program_id": "p1",
            "program_name": "test",
            "execution_mode": "autonomous",
            "nodes": [
                {
                    "id": "s1",
                    "type": "step",
                    "label": "Step",
                    "description": "",
                    "position": {},
                    "status": "idle",
                    "connection": None,
                    "config": {"logic_type": "filter", "condition": "value > 0"},
                }
            ],
            "edges": [],
        }
        prog = parse_schema(raw)
        cfg = prog.nodes[0].config
        self.assertIsInstance(cfg, StepConfig)
        self.assertEqual(cfg.logic_type, "filter")  # type: ignore[union-attr]

    def test_parse_step_branch(self) -> None:
        raw = {
            "version": "1.0",
            "program_id": "p1",
            "program_name": "test",
            "execution_mode": "autonomous",
            "nodes": [
                {
                    "id": "s1",
                    "type": "step",
                    "label": "Step",
                    "description": "",
                    "position": {},
                    "status": "idle",
                    "connection": None,
                    "config": {
                        "logic_type": "branch",
                        "conditions": [{"condition": "value > 0", "target_node_id": "n1"}],
                        "default_branch": "n2",
                    },
                }
            ],
            "edges": [],
        }
        prog = parse_schema(raw)
        cfg = prog.nodes[0].config
        self.assertIsInstance(cfg, StepConfig)
        self.assertEqual(cfg.logic_type, "branch")  # type: ignore[union-attr]

    def test_parse_step_delay(self) -> None:
        raw = {
            "version": "1.0",
            "program_id": "p1",
            "program_name": "test",
            "execution_mode": "autonomous",
            "nodes": [
                {
                    "id": "s1",
                    "type": "step",
                    "label": "Step",
                    "description": "",
                    "position": {},
                    "status": "idle",
                    "connection": None,
                    "config": {"logic_type": "delay", "seconds": 5},
                }
            ],
            "edges": [],
        }
        prog = parse_schema(raw)
        cfg = prog.nodes[0].config
        self.assertIsInstance(cfg, StepConfig)
        self.assertEqual(cfg.logic_type, "delay")  # type: ignore[union-attr]

    def test_parse_step_loop(self) -> None:
        raw = {
            "version": "1.0",
            "program_id": "p1",
            "program_name": "test",
            "execution_mode": "autonomous",
            "nodes": [
                {
                    "id": "s1",
                    "type": "step",
                    "label": "Step",
                    "description": "",
                    "position": {},
                    "status": "idle",
                    "connection": None,
                    "config": {"logic_type": "loop", "over": "items", "item_var": "item"},
                }
            ],
            "edges": [],
        }
        prog = parse_schema(raw)
        cfg = prog.nodes[0].config
        self.assertIsInstance(cfg, StepConfig)
        self.assertEqual(cfg.logic_type, "loop")  # type: ignore[union-attr]

    def test_parse_step_format(self) -> None:
        raw = {
            "version": "1.0",
            "program_id": "p1",
            "program_name": "test",
            "execution_mode": "autonomous",
            "nodes": [
                {
                    "id": "s1",
                    "type": "step",
                    "label": "Step",
                    "description": "",
                    "position": {},
                    "status": "idle",
                    "connection": None,
                    "config": {"logic_type": "format", "template": "Hello {name}", "output_key": "greeting"},
                }
            ],
            "edges": [],
        }
        prog = parse_schema(raw)
        cfg = prog.nodes[0].config
        self.assertIsInstance(cfg, StepConfig)
        self.assertEqual(cfg.logic_type, "format")  # type: ignore[union-attr]

    def test_parse_step_parse(self) -> None:
        raw = {
            "version": "1.0",
            "program_id": "p1",
            "program_name": "test",
            "execution_mode": "autonomous",
            "nodes": [
                {
                    "id": "s1",
                    "type": "step",
                    "label": "Step",
                    "description": "",
                    "position": {},
                    "status": "idle",
                    "connection": None,
                    "config": {"logic_type": "parse", "input_key": "raw", "format": "json"},
                }
            ],
            "edges": [],
        }
        prog = parse_schema(raw)
        cfg = prog.nodes[0].config
        self.assertIsInstance(cfg, StepConfig)
        self.assertEqual(cfg.logic_type, "parse")  # type: ignore[union-attr]

    def test_parse_step_deduplicate(self) -> None:
        raw = {
            "version": "1.0",
            "program_id": "p1",
            "program_name": "test",
            "execution_mode": "autonomous",
            "nodes": [
                {
                    "id": "s1",
                    "type": "step",
                    "label": "Step",
                    "description": "",
                    "position": {},
                    "status": "idle",
                    "connection": None,
                    "config": {"logic_type": "deduplicate", "key": "id"},
                }
            ],
            "edges": [],
        }
        prog = parse_schema(raw)
        cfg = prog.nodes[0].config
        self.assertIsInstance(cfg, StepConfig)
        self.assertEqual(cfg.logic_type, "deduplicate")  # type: ignore[union-attr]

    def test_parse_step_sort(self) -> None:
        raw = {
            "version": "1.0",
            "program_id": "p1",
            "program_name": "test",
            "execution_mode": "autonomous",
            "nodes": [
                {
                    "id": "s1",
                    "type": "step",
                    "label": "Step",
                    "description": "",
                    "position": {},
                    "status": "idle",
                    "connection": None,
                    "config": {"logic_type": "sort", "key": "name", "order": "asc"},
                }
            ],
            "edges": [],
        }
        prog = parse_schema(raw)
        cfg = prog.nodes[0].config
        self.assertIsInstance(cfg, StepConfig)
        self.assertEqual(cfg.logic_type, "sort")  # type: ignore[union-attr]

    def test_parse_connection_oauth(self) -> None:
        raw = {
            "version": "1.0",
            "program_id": "p1",
            "program_name": "test",
            "execution_mode": "autonomous",
            "nodes": [
                {
                    "id": "c1",
                    "type": "connection",
                    "label": "Conn",
                    "description": "",
                    "position": {},
                    "status": "idle",
                    "connection": "gmail:primary",
                    "config": {
                        "connector_type": "oauth",
                        "scope_access": "read",
                        "scope_required": ["https://www.googleapis.com/auth/gmail.readonly"],
                        "operation": "list_emails",
                        "operation_params": {"max_results": 10},
                    },
                }
            ],
            "edges": [],
        }
        prog = parse_schema(raw)
        cfg = prog.nodes[0].config
        self.assertIsInstance(cfg, OAuthConnectionConfig)
        self.assertEqual(cfg.operation, "list_emails")  # type: ignore[union-attr]

    def test_parse_connection_http(self) -> None:
        raw = {
            "version": "1.0",
            "program_id": "p1",
            "program_name": "test",
            "execution_mode": "autonomous",
            "nodes": [
                {
                    "id": "c1",
                    "type": "connection",
                    "label": "Conn",
                    "description": "",
                    "position": {},
                    "status": "idle",
                    "connection": None,
                    "config": {
                        "connector_type": "http",
                        "method": "POST",
                        "url": "https://api.example.com/v1/data",
                        "auth_type": "bearer",
                        "auth_value": "token123",
                        "query_params": [{"key": "page", "value": "1"}],
                        "headers": [{"key": "X-Custom", "value": "val"}],
                        "body": '{"key": "value"}',
                        "parse_response": True,
                        "timeout_seconds": 30,
                        "retry": _retry(),
                    },
                }
            ],
            "edges": [],
        }
        prog = parse_schema(raw)
        cfg = prog.nodes[0].config
        self.assertIsInstance(cfg, HttpConnectionConfig)
        self.assertEqual(cfg.method, "POST")  # type: ignore[union-attr]

    def test_parse_all_edge_types(self) -> None:
        for edge_type in ["data_flow", "control_flow", "event_subscription"]:
            raw = {
                "version": "1.0",
                "program_id": "p1",
                "program_name": "test",
                "execution_mode": "autonomous",
                "nodes": [],
                "edges": [
                    {
                        "id": "e1",
                        "from": "n1",
                        "to": "n2",
                        "type": edge_type,
                        "data_mapping": None,
                        "condition": None,
                        "label": None,
                    }
                ],
            }
            prog = parse_schema(raw)
            self.assertEqual(prog.edges[0].type, edge_type)


# ─── Step Logic Execution Tests ───────────────────────────────────────────────


class StepExecutionTests(unittest.IsolatedAsyncioTestCase):
    async def test_step_transform(self) -> None:
        node = _node("s1", "step", StepConfig(logic_type="transform", extra={"transformation": "input['value'] + 10"}))
        executor = _executor(_program([node], []))
        with patch("engine.executor.update_node_execution", new=AsyncMock()):
            result = await executor._execute_node(node, {"value": 5})
        self.assertEqual(result["result"], 15)

    async def test_step_filter_pass(self) -> None:
        node = _node("s1", "step", StepConfig(logic_type="filter", extra={"condition": "input['value'] > 0"}))
        executor = _executor(_program([node], []))
        with patch("engine.executor.update_node_execution", new=AsyncMock()):
            result = await executor._execute_node(node, {"value": 5})
        self.assertNotIn("__filtered_out__", result)

    async def test_step_filter_fail(self) -> None:
        node = _node("s1", "step", StepConfig(logic_type="filter", extra={"condition": "input['value'] > 0"}))
        executor = _executor(_program([node], []))
        with patch("engine.executor.update_node_execution", new=AsyncMock()):
            result = await executor._execute_node(node, {"value": -1})
        self.assertTrue(result.get("__filtered_out__"))

    async def test_step_branch(self) -> None:
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
        executor = _executor(_program([node], []))
        with patch("engine.executor.update_node_execution", new=AsyncMock()):
            result = await executor._execute_node(node, {"value": 5})
        self.assertEqual(result["__branch_target__"], "n_pos")

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
        executor = _executor(_program([node], []))
        with patch("engine.executor.update_node_execution", new=AsyncMock()):
            result = await executor._execute_node(node, {"value": -5})
        self.assertEqual(result["__branch_target__"], "n_neg")

    async def test_step_delay(self) -> None:
        node = _node("s1", "step", StepConfig(logic_type="delay", extra={"seconds": 0.01}))
        executor = _executor(_program([node], []))
        with patch("engine.executor.update_node_execution", new=AsyncMock()):
            result = await executor._execute_node(node, {"value": 1})
        self.assertEqual(result["value"], 1)

    async def test_step_loop(self) -> None:
        node = _node("s1", "step", StepConfig(logic_type="loop", extra={"over": "[1, 2, 3]", "item_var": "item"}))
        executor = _executor(_program([node], []))
        with patch("engine.executor.update_node_execution", new=AsyncMock()):
            result = await executor._execute_node(node, {})
        self.assertEqual(result["__loop_items__"], [1, 2, 3])
        self.assertEqual(result["item_var"], "item")

    async def test_step_format(self) -> None:
        node = _node(
            "s1", "step", StepConfig(logic_type="format", extra={"template": "Hello {name}", "output_key": "greeting"})
        )
        executor = _executor(_program([node], []))
        with patch("engine.executor.update_node_execution", new=AsyncMock()):
            result = await executor._execute_node(node, {"name": "World"})
        self.assertEqual(result["greeting"], "Hello World")

    async def test_step_parse_json(self) -> None:
        node = _node("s1", "step", StepConfig(logic_type="parse", extra={"input_key": "raw", "format": "json"}))
        executor = _executor(_program([node], []))
        with patch("engine.executor.update_node_execution", new=AsyncMock()):
            result = await executor._execute_node(node, {"raw": '{"a":1}'})
        self.assertEqual(result["parsed"], {"a": 1})

    async def test_step_parse_csv(self) -> None:
        node = _node("s1", "step", StepConfig(logic_type="parse", extra={"input_key": "raw", "format": "csv"}))
        executor = _executor(_program([node], []))
        with patch("engine.executor.update_node_execution", new=AsyncMock()):
            result = await executor._execute_node(node, {"raw": "name,age\nAlice,30\nBob,25"})
        self.assertEqual(len(result["parsed"]), 2)
        self.assertEqual(result["parsed"][0]["name"], "Alice")

    async def test_step_parse_lines(self) -> None:
        node = _node("s1", "step", StepConfig(logic_type="parse", extra={"input_key": "raw", "format": "lines"}))
        executor = _executor(_program([node], []))
        with patch("engine.executor.update_node_execution", new=AsyncMock()):
            result = await executor._execute_node(node, {"raw": "line1\n\nline2"})
        self.assertEqual(result["parsed"], ["line1", "line2"])

    async def test_step_deduplicate(self) -> None:
        node = _node("s1", "step", StepConfig(logic_type="deduplicate", extra={"key": "id"}))
        executor = _executor(_program([node], []))
        with patch("engine.executor.update_node_execution", new=AsyncMock()):
            result = await executor._execute_node(node, {"items": [{"id": 1}, {"id": 2}, {"id": 1}]})
        self.assertEqual(len(result["items"]), 2)

    async def test_step_sort_asc(self) -> None:
        node = _node("s1", "step", StepConfig(logic_type="sort", extra={"key": "name", "order": "asc"}))
        executor = _executor(_program([node], []))
        with patch("engine.executor.update_node_execution", new=AsyncMock()):
            result = await executor._execute_node(node, {"items": [{"name": "Z"}, {"name": "A"}, {"name": "M"}]})
        names = [item["name"] for item in result["items"]]
        self.assertEqual(names, ["A", "M", "Z"])

    async def test_step_sort_desc(self) -> None:
        node = _node("s1", "step", StepConfig(logic_type="sort", extra={"key": "name", "order": "desc"}))
        executor = _executor(_program([node], []))
        with patch("engine.executor.update_node_execution", new=AsyncMock()):
            result = await executor._execute_node(node, {"items": [{"name": "Z"}, {"name": "A"}, {"name": "M"}]})
        names = [item["name"] for item in result["items"]]
        self.assertEqual(names, ["Z", "M", "A"])


# ─── Connector Registry Tests ───────────────────────────────────────────────


class ConnectorRegistryTests(unittest.TestCase):
    def test_all_connectors_instantiate(self) -> None:
        for name, cls in sorted(REGISTRY.items()):
            with self.subTest(provider=name):
                inst = cls()
                self.assertIsInstance(inst, IConnector)
                self.assertTrue(inst.provider)
                self.assertIsInstance(inst.supported_operations, list)
                self.assertTrue(all(isinstance(op, str) for op in inst.supported_operations))
                self.assertEqual(len(inst.supported_operations), len(set(inst.supported_operations)))

    def test_get_connector_returns_instance(self) -> None:
        for name in sorted(REGISTRY.keys()):
            with self.subTest(provider=name):
                inst = get_connector(name)
                self.assertIsNotNone(inst)
                self.assertIsInstance(inst, IConnector)

    def test_no_duplicate_operations(self) -> None:
        for name, cls in sorted(REGISTRY.items()):
            with self.subTest(provider=name):
                inst = cls()
                ops = inst.supported_operations
                self.assertEqual(len(ops), len(set(ops)), f"Duplicate operations in {name}")

    def test_all_operations_are_strings(self) -> None:
        for name, cls in sorted(REGISTRY.items()):
            with self.subTest(provider=name):
                inst = cls()
                for op in inst.supported_operations:
                    self.assertIsInstance(op, str, f"Non-string operation in {name}: {op!r}")


# ─── Edge Type Routing Tests ──────────────────────────────────────────────────


class EdgeRoutingTests(unittest.IsolatedAsyncioTestCase):
    async def test_data_flow_edge(self) -> None:
        trigger = _node("t1", "trigger", TriggerConfig(trigger_type="manual"))
        step = _node("s1", "step", StepConfig(logic_type="transform", extra={"transformation": "input['value'] + 1"}))
        program = _program([trigger, step], [_edge("e1", "t1", "s1", "data_flow")])
        executor = _executor(program)
        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
        ):
            result = await executor.execute({"value": 10})
        self.assertEqual(result["s1"]["result"], 11)

    async def test_control_flow_edge(self) -> None:
        trigger = _node("t1", "trigger", TriggerConfig(trigger_type="manual"))
        step = _node("s1", "step", StepConfig(logic_type="transform", extra={"transformation": "input['value'] + 1"}))
        program = _program([trigger, step], [_edge("e1", "t1", "s1", "control_flow")])
        executor = _executor(program)
        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
        ):
            result = await executor.execute({"value": 10})
        self.assertEqual(result["s1"]["result"], 11)

    async def test_event_subscription_edge(self) -> None:
        trigger = _node("t1", "trigger", TriggerConfig(trigger_type="manual"))
        step = _node("s1", "step", StepConfig(logic_type="transform", extra={"transformation": "input['value'] + 1"}))
        program = _program([trigger, step], [_edge("e1", "t1", "s1", "event_subscription")])
        executor = _executor(program)
        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
        ):
            result = await executor.execute({"value": 10})
        self.assertEqual(result["s1"]["result"], 11)

    async def test_data_mapping_edge(self) -> None:
        trigger = _node("t1", "trigger", TriggerConfig(trigger_type="manual"))
        step = _node(
            "s1", "step", StepConfig(logic_type="transform", extra={"transformation": "input['mapped_value'] + 1"})
        )
        program = _program([trigger, step], [_edge("e1", "t1", "s1", "data_flow", {"value": "mapped_value"})])
        executor = _executor(program)
        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
        ):
            result = await executor.execute({"value": 10})
        self.assertEqual(result["s1"]["result"], 11)

    async def test_condition_edge(self) -> None:
        trigger = _node("t1", "trigger", TriggerConfig(trigger_type="manual"))
        step = _node("s1", "step", StepConfig(logic_type="transform", extra={"transformation": "input['value'] + 1"}))
        program = _program([trigger, step], [_edge("e1", "t1", "s1", "data_flow", condition="input['value'] > 5")])
        executor = _executor(program)
        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
        ):
            result = await executor.execute({"value": 10})
        self.assertEqual(result["s1"]["result"], 11)


# ─── Connection Execution Tests ─────────────────────────────────────────────


class ConnectionExecutionTests(unittest.IsolatedAsyncioTestCase):
    async def test_http_connection_with_all_auth_types(self) -> None:
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
                _executor(_program([node], []))
                # Just verify schema parsing and basic validation, don't actually call
                self.assertIsInstance(node.config, HttpConnectionConfig)
                self.assertEqual(node.config.auth_type, auth_type)  # type: ignore[union-attr]

    async def test_oauth_connection_without_operation_passes_through(self) -> None:
        node = _node(
            "o1",
            "connection",
            OAuthConnectionConfig(
                scope_access="read",
                scope_required=[],
            ),
            connection="gmail:primary",
        )
        executor = _executor(_program([node], []))
        executor._resolve_connection_id = Mock(return_value="conn-1")
        executor._provider_for_connection = Mock(return_value="gmail")
        executor._fetch_oauth_token = AsyncMock(return_value="token")
        executor._enforce_provider_policy = AsyncMock()

        with patch("engine.executor.update_node_execution", new=AsyncMock()):
            result = await executor._execute_node(node, {"value": 1})
        self.assertEqual(result["connection_id"], "conn-1")

    async def test_oauth_connection_with_operation(self) -> None:
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

    async def test_oauth_connection_connector_not_found(self) -> None:
        node = _node(
            "o1",
            "connection",
            OAuthConnectionConfig(
                scope_access="read",
                scope_required=[],
                operation="unknown_op",
            ),
            connection="gmail:primary",
        )
        executor = _executor(_program([node], []))
        executor._resolve_connection_id = Mock(return_value="conn-1")
        executor._provider_for_connection = Mock(return_value="gmail")
        executor._fetch_oauth_token = AsyncMock(return_value="token")
        executor._enforce_provider_policy = AsyncMock()

        with (
            patch("engine.executor.get_connector", return_value=None),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
        ):
            with self.assertRaises(ExecutionError) as ctx:
                await executor._execute_node(node, {})
            self.assertEqual(ctx.exception.code, "CONNECTOR_NOT_FOUND")

    async def test_oauth_connection_unresolved_param(self) -> None:
        node = _node(
            "o1",
            "connection",
            OAuthConnectionConfig(
                scope_access="read",
                scope_required=[],
                operation="list_emails",
                operation_params={"folder": "{{missing}}"},
            ),
            connection="gmail:primary",
        )
        executor = _executor(_program([node], []))
        executor._resolve_connection_id = Mock(return_value="conn-1")
        executor._provider_for_connection = Mock(return_value="gmail")
        executor._fetch_oauth_token = AsyncMock(return_value="token")
        executor._enforce_provider_policy = AsyncMock()

        connector = Mock()
        connector.execute = AsyncMock(return_value={})

        with (
            patch("engine.executor.get_connector", return_value=connector),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
        ):
            with self.assertRaises(ExecutionError) as ctx:
                await executor._execute_node(node, {})
            self.assertEqual(ctx.exception.code, "UNRESOLVED_OPERATION_PARAM")

    async def test_oauth_connection_token_expired_retry(self) -> None:
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


# ─── Full Integration-like Tests ────────────────────────────────────────────


class FullProgramTests(unittest.IsolatedAsyncioTestCase):
    async def test_program_with_all_step_types(self) -> None:
        """A single program that chains every step logic type together."""
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
        executor = _executor(program)

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
        ):
            # Start with value=10 so branch goes to format
            result = await executor.execute(
                {"value": 10, "raw_json": '[{"id":1,"name":"Z"},{"id":2,"name":"A"},{"id":1,"name":"Z"}]'}
            )

        self.assertIn("transform", result)
        self.assertIn("filter", result)
        self.assertIn("branch", result)
        self.assertIn("format", result)
        self.assertEqual(result["format"]["message"], "Result: 11")

    async def test_loop_body_execution(self) -> None:
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
        executor = _executor(program)

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
        ):
            result = await executor.execute({})

        self.assertEqual(result["transform"]["count"], 2)
        self.assertEqual(len(result["transform"]["iterations"]), 2)


# ─── Agent Node Tests ───────────────────────────────────────────────────────


class AgentNodeTests(unittest.IsolatedAsyncioTestCase):
    async def test_platform_agent_falls_back_after_openrouter_429(self) -> None:
        node = _node(
            "a1",
            "agent",
            AgentConfig(
                model="openai/gpt-4o-mini",
                api_key_ref="platform",
                system_prompt="Test",
                input_schema=None,
                output_schema=None,
                requires_approval=False,
                approval_timeout_hours=1,
                scope_required=None,
                scope_access="read",
                retry=RetryConfig(max_attempts=1, backoff="none", backoff_base_seconds=1, fail_program_on_exhaust=True),
                tools=[],
            ),
        )
        executor = _executor(_program([node], []))
        executor._fetch_api_key = AsyncMock(return_value=("key", "openrouter"))
        executor._enforce_provider_policy = AsyncMock()
        executor._check_platform_credits = AsyncMock()

        rate_limited = Mock(
            is_success=False,
            status_code=429,
            text='{"error":{"message":"Provider returned error","code":429}}',
        )
        succeeded = Mock(
            is_success=True,
            json=Mock(
                return_value={
                    "choices": [{"message": {"content": '{"answer": 42}'}}],
                    "usage": {"prompt_tokens": 10, "completion_tokens": 5},
                }
            ),
        )

        with (
            patch("engine.executor.update_node_execution", new=AsyncMock()) as update_mock,
            patch("engine.executor.get_llm_circuit") as mock_circuit,
            patch("engine.executor._get_llm_client") as mock_client,
            patch.object(executor, "_verify_agent_output", new=AsyncMock(return_value=[])),
        ):
            circuit = Mock()

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)

            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_circuit.return_value = circuit
            client = Mock()
            client.post = AsyncMock(side_effect=[rate_limited, succeeded])
            mock_client.return_value = client

            result = await executor._execute_node(node, {"question": "What is 6*7?"})

        self.assertEqual(result["answer"], 42)
        attempted_models = [call.kwargs["json"]["model"] for call in client.post.await_args_list]
        self.assertEqual(
            attempted_models,
            [
                "openai/gpt-4o-mini",
                "openai/gpt-oss-120b",
            ],
        )
        fallback_updates = [call.kwargs.get("error_message", "") for call in update_mock.await_args_list]
        self.assertTrue(any("trying fallback model openai/gpt-oss-120b" in msg for msg in fallback_updates))

    async def test_platform_agent_normalizes_retired_openrouter_model(self) -> None:
        node = _node(
            "a1",
            "agent",
            AgentConfig(
                model="openai/gpt-oss-120b:free",
                api_key_ref="platform",
                system_prompt="Test",
                input_schema=None,
                output_schema=None,
                requires_approval=False,
                approval_timeout_hours=1,
                scope_required=None,
                scope_access="read",
                retry=RetryConfig(max_attempts=1, backoff="none", backoff_base_seconds=1, fail_program_on_exhaust=True),
                tools=[],
            ),
        )
        executor = _executor(_program([node], []))
        executor._fetch_api_key = AsyncMock(return_value=("key", "openrouter"))
        executor._enforce_provider_policy = AsyncMock()
        executor._check_platform_credits = AsyncMock()

        succeeded = Mock(
            is_success=True,
            json=Mock(
                return_value={
                    "choices": [{"message": {"content": '{"answer": 42}'}}],
                    "usage": {"prompt_tokens": 10, "completion_tokens": 5},
                }
            ),
        )

        with (
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_circuit,
            patch("engine.executor._get_llm_client") as mock_client,
            patch.object(executor, "_verify_agent_output", new=AsyncMock(return_value=[])),
        ):
            circuit = Mock()

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)

            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_circuit.return_value = circuit
            client = Mock()
            client.post = AsyncMock(return_value=succeeded)
            mock_client.return_value = client

            result = await executor._execute_node(node, {"question": "What is 6*7?"})

        self.assertEqual(result["answer"], 42)
        self.assertEqual(client.post.await_args.kwargs["json"]["model"], PLATFORM_DEFAULT_MODEL)

    async def test_agent_node_requires_approval_in_supervised_mode(self) -> None:
        node = _node(
            "a1",
            "agent",
            AgentConfig(
                model="gpt-4",
                api_key_ref="platform",
                system_prompt="Test",
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
        executor.execution_mode = "supervised"
        executor._request_step_approval = AsyncMock(return_value=True)
        executor._fetch_api_key = AsyncMock(return_value=("key", "openai"))
        executor._enforce_provider_policy = AsyncMock()
        executor._check_platform_credits = AsyncMock()

        with (
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_circuit,
            patch("engine.executor._get_llm_client") as mock_client,
        ):
            circuit = Mock()

            async def _circuit_call2(fn, *args, **kwargs):
                return await fn(*args)

            circuit.call = AsyncMock(side_effect=_circuit_call2)
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

    async def test_agent_node_skipped_when_approval_denied(self) -> None:
        node = _node(
            "a1",
            "agent",
            AgentConfig(
                model="gpt-4",
                api_key_ref="platform",
                system_prompt="Test",
                input_schema=None,
                output_schema=None,
                requires_approval=True,
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
        executor._request_step_approval = AsyncMock(return_value=False)

        with patch("engine.executor.update_node_execution", new=AsyncMock()):
            result = await executor._execute_node(node, {})
        self.assertEqual(result, {})


if __name__ == "__main__":
    unittest.main()
