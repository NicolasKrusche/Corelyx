"""Unit tests for the Simulation Engine.

Tests the dry-run execution of workflows against mock connector responses.
Uses mock LLM + mock connector responses to verify the simulation pipeline
without hitting real APIs.
"""

from __future__ import annotations

import asyncio
import unittest
from dataclasses import fields
from datetime import datetime
from typing import Any
from unittest.mock import patch

from engine.simulation import (
    NodeSimulationState,
    SimulationEngine,
    SimulationResult,
    run_program_simulation,
)
from engine.safe_expressions import SafeExpressionError
from mocks.connector_mocks import get_mock_response, get_supported_operations
from schema import (
    AgentConfig,
    AgentTaskConfig,
    ConnectionConfig,
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


# ─── Helpers ─────────────────────────────────────────────────────────────────


def _make_retry() -> RetryConfig:
    return RetryConfig(
        max_attempts=1,
        backoff="none",
        backoff_base_seconds=1.0,
        fail_program_on_exhaust=False,
    )


def _make_trigger_node(node_id: str = "trigger_1", **extra: Any) -> SchemaNode:
    cfg = {"trigger_type": "manual", **extra}
    config = TriggerConfig(trigger_type=cfg.pop("trigger_type", "manual"), extra=cfg)
    return SchemaNode(
        id=node_id,
        type="trigger",
        label="Trigger",
        description="Test trigger",
        connection=None,
        config=config,
        position={"x": 0, "y": 0},
        status="active",
    )


def _make_connection_node(
    node_id: str,
    provider: str,
    operation: str,
    connector_type: str = "oauth",
    **extra: Any,
) -> SchemaNode:
    raw = {
        "connector_type": connector_type,
        "scope_access": "read",
        "scope_required": [],
        "operation": operation,
        "operation_params": extra,
        **extra,
    }
    config = OAuthConnectionConfig(
        connector_type="oauth",
        scope_access=raw.get("scope_access", "read"),
        scope_required=list(raw.get("scope_required", [])),
        operation=operation,
        operation_params=dict(raw.get("operation_params") or {}),
    )
    return SchemaNode(
        id=node_id,
        type="connection",
        label=f"{provider} {operation}",
        description="",
        connection=provider,
        config=config,
        position={"x": 100, "y": 0},
        status="active",
    )


def _make_http_node(node_id: str, method: str = "GET", url: str = "https://example.com") -> SchemaNode:
    config = HttpConnectionConfig(
        connector_type="http",
        method=method,
        url=url,
        auth_type="none",
        parse_response=True,
    )
    return SchemaNode(
        id=node_id,
        type="connection",
        label="HTTP Request",
        description="",
        connection="http",
        config=config,
        position={"x": 100, "y": 0},
        status="active",
    )


def _make_agent_node(node_id: str = "agent_1", **extra: Any) -> SchemaNode:
    raw = {"model": "gpt-4o-mini", **extra}
    config = AgentConfig(
        model=raw.get("model", "gpt-4o-mini"),
        api_key_ref="__USER_ASSIGNED__",
        system_prompt=raw.get("system_prompt", ""),
        input_schema=None,
        output_schema=None,
        requires_approval=False,
        approval_timeout_hours=24.0,
        scope_required=None,
        scope_access="read",
        retry=_make_retry(),
        tools=[],
    )
    return SchemaNode(
        id=node_id,
        type="agent",
        label="Agent",
        description="",
        connection=None,
        config=config,
        position={"x": 300, "y": 0},
        status="active",
    )


def _make_step_node(node_id: str = "step_1", logic_type: str = "transform", **extra: Any) -> SchemaNode:
    config = StepConfig(logic_type=logic_type, extra=extra)
    return SchemaNode(
        id=node_id,
        type="step",
        label=f"Step {logic_type}",
        description="",
        connection=None,
        config=config,
        position={"x": 200, "y": 0},
        status="active",
    )


def _make_edge(
    from_node: str,
    to: str,
    edge_id: str | None = None,
    data_mapping: dict | None = None,
    condition: str | None = None,
) -> SchemaEdge:
    return SchemaEdge(
        id=edge_id or f"edge_{from_node}_{to}",
        from_node=from_node,
        to=to,
        type="data_flow",
        data_mapping=data_mapping,
        condition=condition,
        label=None,
    )


def _make_schema(
    nodes: list[SchemaNode],
    edges: list[SchemaEdge],
    program_id: str = "test_program",
) -> ProgramSchema:
    return ProgramSchema(
        version="1.0",
        program_id=program_id,
        program_name="Test Program",
        nodes=nodes,
        edges=edges,
        execution_mode="autonomous",
    )


def _run(coro):
    """Run an async coroutine in a synchronous test."""
    return asyncio.get_event_loop().run_until_complete(coro)


# ─── Mock Connector Registry Tests ──────────────────────────────────────────


class MockConnectorRegistryTests(unittest.TestCase):
    """Tests for the Python mock connector response registry."""

    def test_get_mock_response_returns_dict(self) -> None:
        result = get_mock_response("gmail", "list_emails")
        self.assertIsInstance(result, dict)

    def test_gmail_list_emails(self) -> None:
        result = get_mock_response("gmail", "list_emails")
        self.assertIn("emails", result)
        self.assertIsInstance(result["emails"], list)
        self.assertGreater(len(result["emails"]), 0)
        self.assertIn("id", result["emails"][0])
        self.assertIn("subject", result["emails"][0])

    def test_gmail_send_email(self) -> None:
        result = get_mock_response("gmail", "send_email")
        self.assertIn("id", result)
        self.assertIn("labelIds", result)

    def test_slack_send_message(self) -> None:
        result = get_mock_response("slack", "send_message")
        self.assertIn("ts", result)
        self.assertIn("channel", result)
        self.assertIn("message", result)

    def test_slack_list_channels(self) -> None:
        result = get_mock_response("slack", "list_channels")
        self.assertIn("channels", result)
        self.assertIsInstance(result["channels"], list)
        self.assertGreater(len(result["channels"]), 0)

    def test_notion_query_database(self) -> None:
        result = get_mock_response("notion", "query_database")
        self.assertIn("results", result)
        self.assertIsInstance(result["results"], list)
        self.assertGreater(len(result["results"]), 0)

    def test_notion_create_database_entry(self) -> None:
        result = get_mock_response("notion", "create_database_entry")
        self.assertIn("id", result)
        self.assertIn("url", result)

    def test_github_create_issue(self) -> None:
        result = get_mock_response("github", "create_issue")
        self.assertIn("number", result)
        self.assertEqual(result["state"], "open")

    def test_github_list_prs(self) -> None:
        result = get_mock_response("github", "list_prs")
        self.assertIn("pull_requests", result)
        self.assertIsInstance(result["pull_requests"], list)

    def test_sheets_read_range(self) -> None:
        result = get_mock_response("sheets", "read_range")
        self.assertIn("values", result)
        self.assertIn("range", result)
        self.assertIsInstance(result["values"], list)

    def test_sheets_append_row(self) -> None:
        result = get_mock_response("sheets", "append_row")
        self.assertIn("updatedRange", result)
        self.assertIn("updatedRows", result)

    def test_http_generic_request(self) -> None:
        result = get_mock_response("http_generic", "request")
        self.assertIn("status_code", result)

    def test_postgresql_query(self) -> None:
        result = get_mock_response("postgresql", "query")
        self.assertIn("rows", result)
        self.assertIn("row_count", result)
        self.assertIn("columns", result)
        self.assertIsInstance(result["rows"], list)
        self.assertGreater(len(result["rows"]), 0)
        self.assertIn("id", result["rows"][0])

    def test_postgresql_execute(self) -> None:
        result = get_mock_response("postgresql", "execute")
        self.assertIn("rows_affected", result)

    def test_postgresql_list_tables(self) -> None:
        result = get_mock_response("postgresql", "list_tables")
        self.assertIn("tables", result)
        self.assertIsInstance(result["tables"], list)

    def test_redis_get(self) -> None:
        result = get_mock_response("redis", "get")
        self.assertIn("value", result)
        self.assertIn("exists", result)
        self.assertTrue(result["exists"])

    def test_redis_set(self) -> None:
        result = get_mock_response("redis", "set")
        self.assertIn("ok", result)
        self.assertTrue(result["ok"])

    def test_redis_incr(self) -> None:
        result = get_mock_response("redis", "incr")
        self.assertIn("value", result)
        self.assertIsInstance(result["value"], int)

    def test_default_response_for_unknown_provider(self) -> None:
        result = get_mock_response("nonexistent_provider", "do_thing")
        self.assertIn("status", result)

    def test_get_supported_operations(self) -> None:
        ops = get_supported_operations("gmail")
        self.assertIsInstance(ops, list)
        self.assertIn("list_emails", ops)
        self.assertIn("send_email", ops)

    def test_get_supported_operations_unknown(self) -> None:
        ops = get_supported_operations("nonexistent")
        self.assertEqual(ops, [])

    def test_all_expected_providers_have_mock_responses(self) -> None:
        providers = ["gmail", "slack", "notion", "github", "sheets", "http_generic", "postgresql", "redis"]
        for provider in providers:
            result = get_mock_response(provider, "list")
            self.assertIsInstance(result, dict, f"Provider {provider} should return a dict")


# ─── SimulationEngine: Node State ───────────────────────────────────────────


class NodeSimulationStateTests(unittest.TestCase):
    """Tests for NodeSimulationState dataclass."""

    def test_default_values(self) -> None:
        state = NodeSimulationState(node_id="n1")
        self.assertEqual(state.node_id, "n1")
        self.assertEqual(state.status, "pending")
        self.assertEqual(state.input_data, {})
        self.assertEqual(state.output_data, {})
        self.assertIsNone(state.error_message)
        self.assertIsNone(state.started_at)
        self.assertIsNone(state.completed_at)
        self.assertEqual(state.duration_ms, 0.0)
        self.assertEqual(state.estimated_cost_usd, 0.0)
        self.assertEqual(state.estimated_tokens, 0)
        self.assertTrue(state.is_mock)

    def test_fields_are_settable(self) -> None:
        state = NodeSimulationState(node_id="n1")
        state.status = "completed"
        state.output_data = {"key": "value"}
        state.estimated_tokens = 100
        self.assertEqual(state.status, "completed")
        self.assertEqual(state.output_data["key"], "value")
        self.assertEqual(state.estimated_tokens, 100)


# ─── SimulationEngine: Trigger Node ─────────────────────────────────────────


class SimulationTriggerNodeTests(unittest.TestCase):
    """Tests for trigger node simulation."""

    def test_no_trigger_node_fails(self) -> None:
        schema = _make_schema(
            nodes=[_make_connection_node("conn_1", "gmail", "list_emails")],
            edges=[],
        )
        result = _run(run_program_simulation(schema))
        self.assertEqual(result.status, "failed")
        self.assertIn("No trigger node found in schema", result.errors)
        self.assertEqual(len(result.nodes), 0)

    def test_trigger_node_executes(self) -> None:
        schema = _make_schema(nodes=[_make_trigger_node()], edges=[])
        result = _run(run_program_simulation(schema))
        self.assertEqual(result.status, "completed")
        self.assertIn("trigger_1", result.nodes)
        self.assertEqual(result.nodes["trigger_1"].status, "completed")
        self.assertTrue(result.nodes["trigger_1"].output_data.get("triggered"))
        self.assertTrue(result.nodes["trigger_1"].is_mock)

    def test_trigger_payload_passed_through(self) -> None:
        schema = _make_schema(nodes=[_make_trigger_node()], edges=[])
        payload = {"email": "test@example.com", "subject": "Hello"}
        result = _run(run_program_simulation(schema, trigger_payload=payload))
        self.assertEqual(result.nodes["trigger_1"].output_data["payload"], payload)

    def test_trigger_type_from_config(self) -> None:
        schema = _make_schema(
            nodes=[_make_trigger_node("t1", trigger_type="webhook")],
            edges=[],
        )
        result = _run(run_program_simulation(schema))
        self.assertEqual(result.nodes["t1"].output_data.get("trigger_type"), "webhook")

    def test_manual_trigger_default(self) -> None:
        schema = _make_schema(nodes=[_make_trigger_node()], edges=[])
        result = _run(run_program_simulation(schema))
        self.assertTrue(result.nodes["trigger_1"].output_data.get("triggered_manually"))


# ─── SimulationEngine: Connection Nodes ──────────────────────────────────────


class SimulationConnectionNodeTests(unittest.TestCase):
    """Tests for connection node simulation with mock data injection."""

    def test_gmail_list_emails_mock(self) -> None:
        schema = _make_schema(
            nodes=[_make_trigger_node(), _make_connection_node("gmail_1", "gmail", "list_emails")],
            edges=[_make_edge("trigger_1", "gmail_1")],
        )
        result = _run(run_program_simulation(schema))
        self.assertEqual(result.nodes["gmail_1"].status, "completed")
        self.assertIn("emails", result.nodes["gmail_1"].output_data)
        self.assertTrue(result.nodes["gmail_1"].output_data.get("is_mock"))
        emails = result.nodes["gmail_1"].output_data["emails"]
        self.assertGreater(len(emails), 0)
        self.assertIn("id", emails[0])
        self.assertIn("subject", emails[0])

    def test_slack_send_message_mock(self) -> None:
        schema = _make_schema(
            nodes=[_make_trigger_node(), _make_connection_node("slack_1", "slack", "send_message")],
            edges=[_make_edge("trigger_1", "slack_1")],
        )
        result = _run(run_program_simulation(schema))
        self.assertEqual(result.nodes["slack_1"].status, "completed")
        self.assertIn("ts", result.nodes["slack_1"].output_data)

    def test_github_create_issue_mock(self) -> None:
        schema = _make_schema(
            nodes=[_make_trigger_node(), _make_connection_node("gh_1", "github", "create_issue")],
            edges=[_make_edge("trigger_1", "gh_1")],
        )
        result = _run(run_program_simulation(schema))
        self.assertEqual(result.nodes["gh_1"].status, "completed")
        self.assertIn("number", result.nodes["gh_1"].output_data)
        self.assertEqual(result.nodes["gh_1"].output_data["state"], "open")

    def test_postgresql_query_mock(self) -> None:
        schema = _make_schema(
            nodes=[_make_trigger_node(), _make_connection_node("pg_1", "postgresql", "query")],
            edges=[_make_edge("trigger_1", "pg_1")],
        )
        result = _run(run_program_simulation(schema))
        self.assertEqual(result.nodes["pg_1"].status, "completed")
        rows = result.nodes["pg_1"].output_data["rows"]
        self.assertGreater(len(rows), 0)
        self.assertIn("id", rows[0])

    def test_redis_get_mock(self) -> None:
        schema = _make_schema(
            nodes=[_make_trigger_node(), _make_connection_node("r_1", "redis", "get")],
            edges=[_make_edge("trigger_1", "r_1")],
        )
        result = _run(run_program_simulation(schema))
        self.assertEqual(result.nodes["r_1"].status, "completed")
        self.assertIn("value", result.nodes["r_1"].output_data)
        self.assertTrue(result.nodes["r_1"].output_data.get("exists"))

    def test_notion_query_database_mock(self) -> None:
        schema = _make_schema(
            nodes=[_make_trigger_node(), _make_connection_node("n_1", "notion", "query_database")],
            edges=[_make_edge("trigger_1", "n_1")],
        )
        result = _run(run_program_simulation(schema))
        self.assertEqual(result.nodes["n_1"].status, "completed")
        self.assertIn("results", result.nodes["n_1"].output_data)

    def test_sheets_read_range_mock(self) -> None:
        schema = _make_schema(
            nodes=[_make_trigger_node(), _make_connection_node("s_1", "sheets", "read_range")],
            edges=[_make_edge("trigger_1", "s_1")],
        )
        result = _run(run_program_simulation(schema))
        self.assertEqual(result.nodes["s_1"].status, "completed")
        self.assertIn("values", result.nodes["s_1"].output_data)
        self.assertIn("range", result.nodes["s_1"].output_data)

    def test_http_generic_request_mock(self) -> None:
        schema = _make_schema(
            nodes=[_make_trigger_node(), _make_http_node("h_1")],
            edges=[_make_edge("trigger_1", "h_1")],
        )
        result = _run(run_program_simulation(schema))
        self.assertEqual(result.nodes["h_1"].status, "completed")
        self.assertIn("status_code", result.nodes["h_1"].output_data)
        self.assertIn("data", result.nodes["h_1"].output_data)

    def test_connection_node_zero_cost(self) -> None:
        schema = _make_schema(
            nodes=[_make_trigger_node(), _make_connection_node("gmail_1", "gmail", "list_emails")],
            edges=[_make_edge("trigger_1", "gmail_1")],
        )
        result = _run(run_program_simulation(schema))
        self.assertEqual(result.nodes["gmail_1"].estimated_cost_usd, 0.0)
        self.assertEqual(result.nodes["gmail_1"].estimated_tokens, 0)


# ─── SimulationEngine: Agent Nodes ──────────────────────────────────────────


class SimulationAgentNodeTests(unittest.TestCase):
    """Tests for agent node simulation."""

    def test_agent_node_executes(self) -> None:
        schema = _make_schema(
            nodes=[_make_trigger_node(), _make_agent_node("agent_1")],
            edges=[_make_edge("trigger_1", "agent_1")],
        )
        result = _run(run_program_simulation(schema))
        self.assertEqual(result.nodes["agent_1"].status, "completed")
        self.assertIn("MOCK AGENT", result.nodes["agent_1"].output_data.get("response", ""))
        self.assertEqual(result.nodes["agent_1"].output_data["model"], "gpt-4o-mini")
        self.assertGreater(result.nodes["agent_1"].estimated_tokens, 0)
        self.assertGreater(result.nodes["agent_1"].estimated_cost_usd, 0)

    def test_agent_node_model_from_config(self) -> None:
        schema = _make_schema(
            nodes=[_make_trigger_node(), _make_agent_node("agent_1", model="gpt-4o")],
            edges=[_make_edge("trigger_1", "agent_1")],
        )
        result = _run(run_program_simulation(schema))
        self.assertEqual(result.nodes["agent_1"].output_data["model"], "gpt-4o")

    def test_agent_task_node_type(self) -> None:
        # Agent task uses the same simulation path as agent
        agent_task_cfg = AgentTaskConfig(
            objective="Summarize the input",
            model="gpt-4o-mini",
            api_key_ref="__USER_ASSIGNED__",
            max_iterations=8,
            tools=[],
            scope_access="read",
            requires_approval=False,
            approval_timeout_hours=24.0,
            input_schema=None,
            output_schema=None,
            retry=_make_retry(),
        )
        node = SchemaNode(
            id="at_1",
            type="agent_task",
            label="Agent Task",
            description="",
            connection=None,
            config=agent_task_cfg,
            position={"x": 300, "y": 0},
            status="active",
        )
        schema = _make_schema(nodes=[_make_trigger_node(), node], edges=[_make_edge("trigger_1", "at_1")])
        result = _run(run_program_simulation(schema))
        self.assertEqual(result.nodes["at_1"].status, "completed")
        self.assertIn("response", result.nodes["at_1"].output_data)

    def test_agent_accumulates_tokens_and_cost(self) -> None:
        schema = _make_schema(
            nodes=[_make_trigger_node(), _make_agent_node("a1"), _make_agent_node("a2")],
            edges=[_make_edge("trigger_1", "a1"), _make_edge("a1", "a2")],
        )
        result = _run(run_program_simulation(schema))
        self.assertGreater(result.total_estimated_cost_usd, 0)
        self.assertGreater(result.total_estimated_tokens, 0)
        # Two agents at ~0.001 each
        self.assertGreaterEqual(result.total_estimated_cost_usd, 0.002)


# ─── SimulationEngine: Step Nodes ───────────────────────────────────────────


class SimulationStepNodeTests(unittest.TestCase):
    """Tests for step node simulation (transform, filter, branch, loop, delay)."""

    def test_transform_step(self) -> None:
        schema = _make_schema(
            nodes=[_make_trigger_node(), _make_step_node("s1", "transform")],
            edges=[_make_edge("trigger_1", "s1")],
        )
        result = _run(run_program_simulation(schema))
        self.assertEqual(result.nodes["s1"].status, "completed")
        self.assertIn("result", result.nodes["s1"].output_data)
        self.assertTrue(result.nodes["s1"].output_data.get("is_mock"))

    def test_filter_step(self) -> None:
        schema = _make_schema(
            nodes=[_make_trigger_node(), _make_step_node("s1", "filter")],
            edges=[_make_edge("trigger_1", "s1")],
        )
        result = _run(run_program_simulation(schema))
        self.assertTrue(result.nodes["s1"].output_data.get("passed"))
        self.assertIn("filtered_data", result.nodes["s1"].output_data)

    def test_branch_step(self) -> None:
        schema = _make_schema(
            nodes=[_make_trigger_node(), _make_step_node("s1", "branch")],
            edges=[_make_edge("trigger_1", "s1")],
        )
        result = _run(run_program_simulation(schema))
        self.assertEqual(result.nodes["s1"].output_data["branch"], "default")
        self.assertIn("data", result.nodes["s1"].output_data)

    def test_loop_step(self) -> None:
        schema = _make_schema(
            nodes=[_make_trigger_node(), _make_step_node("s1", "loop")],
            edges=[_make_edge("trigger_1", "s1")],
        )
        result = _run(run_program_simulation(schema))
        self.assertEqual(result.nodes["s1"].output_data["iterations"], 2)
        self.assertIn("item_var", result.nodes["s1"].output_data)

    def test_delay_step(self) -> None:
        schema = _make_schema(
            nodes=[_make_trigger_node(), _make_step_node("s1", "delay", seconds=5)],
            edges=[_make_edge("trigger_1", "s1")],
        )
        result = _run(run_program_simulation(schema))
        self.assertEqual(result.nodes["s1"].output_data["delayed_seconds"], 5)

    def test_format_step(self) -> None:
        schema = _make_schema(
            nodes=[_make_trigger_node(), _make_step_node("s1", "format")],
            edges=[_make_edge("trigger_1", "s1")],
        )
        result = _run(run_program_simulation(schema))
        self.assertIn("formatted_data", result.nodes["s1"].output_data)

    def test_parse_step(self) -> None:
        schema = _make_schema(
            nodes=[_make_trigger_node(), _make_step_node("s1", "parse")],
            edges=[_make_edge("trigger_1", "s1")],
        )
        result = _run(run_program_simulation(schema))
        self.assertIn("parsed_data", result.nodes["s1"].output_data)


# ─── SimulationEngine: Note and Group Nodes ──────────────────────────────────


class SimulationNoteAndGroupTests(unittest.TestCase):
    """Tests for note and group node simulation."""

    def test_note_node(self) -> None:
        config = {"content": "Important info"}
        node = SchemaNode(
            id="note_1",
            type="note",
            label="Note",
            description="",
            connection=None,
            config=config,
            position={"x": 400, "y": 0},
            status="active",
        )
        schema = _make_schema(
            nodes=[_make_trigger_node(), node],
            edges=[_make_edge("trigger_1", "note_1")],
        )
        result = _run(run_program_simulation(schema))
        self.assertEqual(result.nodes["note_1"].status, "completed")
        self.assertEqual(result.nodes["note_1"].output_data["note"], "Important info")

    def test_group_node(self) -> None:
        config = {"childIds": ["a", "b", "c"]}
        node = SchemaNode(
            id="grp_1",
            type="group",
            label="Group",
            description="",
            connection=None,
            config=config,
            position={"x": 500, "y": 0},
            status="active",
        )
        schema = _make_schema(
            nodes=[_make_trigger_node(), node],
            edges=[_make_edge("trigger_1", "grp_1")],
        )
        result = _run(run_program_simulation(schema))
        self.assertEqual(result.nodes["grp_1"].status, "completed")
        self.assertEqual(result.nodes["grp_1"].output_data["child_count"], 3)


# ─── SimulationEngine: Edge Traversal ────────────────────────────────────────


class SimulationEdgeTraversalTests(unittest.TestCase):
    """Tests for edge traversal and data mapping between nodes."""

    def test_linear_chain_executes_all_nodes(self) -> None:
        schema = _make_schema(
            nodes=[
                _make_trigger_node(),
                _make_connection_node("gmail_1", "gmail", "list_emails"),
                _make_connection_node("slack_1", "slack", "send_message"),
            ],
            edges=[
                _make_edge("trigger_1", "gmail_1"),
                _make_edge("gmail_1", "slack_1"),
            ],
        )
        result = _run(run_program_simulation(schema))
        self.assertEqual(len(result.nodes), 3)
        for state in result.nodes.values():
            self.assertEqual(state.status, "completed")

    def test_upstream_output_merged_into_downstream_input(self) -> None:
        schema = _make_schema(
            nodes=[
                _make_trigger_node(),
                _make_connection_node("gmail_1", "gmail", "list_emails"),
                _make_connection_node("slack_1", "slack", "send_message"),
            ],
            edges=[
                _make_edge("trigger_1", "gmail_1"),
                _make_edge("gmail_1", "slack_1"),  # no data_mapping
            ],
        )
        result = _run(run_program_simulation(schema))
        slack_input = result.nodes["slack_1"].input_data
        self.assertIn("emails", slack_input)
        self.assertIn("total_count", slack_input)

    def test_expression_data_mapping(self) -> None:
        schema = _make_schema(
            nodes=[
                _make_trigger_node(),
                _make_connection_node("gmail_1", "gmail", "list_emails"),
                _make_connection_node("slack_1", "slack", "send_message"),
            ],
            edges=[
                _make_edge("trigger_1", "gmail_1"),
                _make_edge(
                    "gmail_1",
                    "slack_1",
                    edge_id="e1",
                    data_mapping={"subject": "{{emails[0]['subject']}}"},
                ),
            ],
        )
        result = _run(run_program_simulation(schema))
        slack_input = result.nodes["slack_1"].input_data
        self.assertEqual(slack_input["subject"], "Project Kickoff - Q3 Planning")

    def test_diamond_graph_execution(self) -> None:
        """Test a diamond-shaped graph: trigger -> gmail + slack -> github."""
        schema = _make_schema(
            nodes=[
                _make_trigger_node(),
                _make_connection_node("gmail_1", "gmail", "list_emails"),
                _make_connection_node("slack_1", "slack", "send_message"),
                _make_connection_node("gh_1", "github", "create_issue"),
            ],
            edges=[
                _make_edge("trigger_1", "gmail_1"),
                _make_edge("trigger_1", "slack_1"),
                _make_edge("gmail_1", "gh_1"),
                _make_edge("slack_1", "gh_1"),
            ],
        )
        result = _run(run_program_simulation(schema))
        self.assertEqual(len(result.nodes), 4)
        for state in result.nodes.values():
            self.assertEqual(state.status, "completed")
        # github should have data from both gmail and slack
        gh_input = result.nodes["gh_1"].input_data
        self.assertIn("emails", gh_input)
        self.assertIn("ts", gh_input)


# ─── SimulationEngine: Cost and Token Tracking ──────────────────────────────


class SimulationCostTrackingTests(unittest.TestCase):
    """Tests for cost and token tracking across nodes."""

    def test_connection_nodes_zero_cost(self) -> None:
        schema = _make_schema(
            nodes=[_make_trigger_node(), _make_connection_node("gmail_1", "gmail", "list_emails")],
            edges=[_make_edge("trigger_1", "gmail_1")],
        )
        result = _run(run_program_simulation(schema))
        self.assertEqual(result.nodes["gmail_1"].estimated_cost_usd, 0.0)
        self.assertEqual(result.nodes["gmail_1"].estimated_tokens, 0)

    def test_agent_nodes_accumulate_cost(self) -> None:
        schema = _make_schema(
            nodes=[_make_trigger_node(), _make_agent_node("a1"), _make_agent_node("a2")],
            edges=[_make_edge("trigger_1", "a1"), _make_edge("a1", "a2")],
        )
        result = _run(run_program_simulation(schema))
        self.assertGreater(result.total_estimated_cost_usd, 0)
        self.assertGreater(result.total_estimated_tokens, 0)

    def test_total_cost_rounded(self) -> None:
        schema = _make_schema(
            nodes=[_make_trigger_node(), _make_agent_node("a1")],
            edges=[_make_edge("trigger_1", "a1")],
        )
        result = _run(run_program_simulation(schema))
        # Cost should be rounded to 6 decimal places
        cost_str = f"{result.total_estimated_cost_usd:.6f}"
        self.assertEqual(str(result.total_estimated_cost_usd), cost_str)


# ─── SimulationEngine: Result Structure ──────────────────────────────────────


class SimulationResultTests(unittest.TestCase):
    """Tests for the overall SimulationResult structure."""

    def test_result_has_required_fields(self) -> None:
        schema = _make_schema(nodes=[_make_trigger_node()], edges=[])
        result = _run(run_program_simulation(schema))
        self.assertIsNotNone(result.program_id)
        self.assertTrue(result.simulation_id.startswith("sim_"))
        self.assertIsNotNone(result.started_at)
        self.assertIsNotNone(result.completed_at)
        self.assertGreaterEqual(result.total_duration_ms, 0)
        self.assertIsInstance(result.nodes, dict)
        self.assertIsInstance(result.edges_traversed, list)
        self.assertIsInstance(result.errors, list)

    def test_completed_status_for_successful_run(self) -> None:
        schema = _make_schema(nodes=[_make_trigger_node()], edges=[])
        result = _run(run_program_simulation(schema))
        self.assertEqual(result.status, "completed")

    def test_nodes_marked_completed(self) -> None:
        schema = _make_schema(
            nodes=[
                _make_trigger_node(),
                _make_connection_node("gmail_1", "gmail", "list_emails"),
            ],
            edges=[_make_edge("trigger_1", "gmail_1")],
        )
        result = _run(run_program_simulation(schema))
        for state in result.nodes.values():
            self.assertEqual(state.status, "completed")
            self.assertIsNotNone(state.started_at)
            self.assertIsNotNone(state.completed_at)

    def test_trigger_node_only_no_edges(self) -> None:
        schema = _make_schema(nodes=[_make_trigger_node()], edges=[])
        result = _run(run_program_simulation(schema))
        self.assertEqual(len(result.nodes), 1)
        self.assertEqual(len(result.edges_traversed), 0)
        self.assertEqual(len(result.errors), 0)


# ─── SimulationEngine: Edge Cases ───────────────────────────────────────────


class SimulationEdgeCasesTests(unittest.TestCase):
    """Tests for edge cases and error handling."""

    def test_unknown_node_type(self) -> None:
        node = SchemaNode(
            id="unk_1",
            type="step",  # We'll monkey-patch the type
            label="Unknown",
            description="",
            connection=None,
            config=StepConfig(logic_type="transform"),
            position={"x": 0, "y": 0},
            status="active",
        )
        # We can't easily test truly unknown types since SchemaNode has a Literal type,
        # but we can test the fallback path by using a step with an unrecognized logic type
        node.config = StepConfig(logic_type="unknown_thing")
        schema = _make_schema(
            nodes=[_make_trigger_node(), node],
            edges=[_make_edge("trigger_1", "unk_1")],
        )
        result = _run(run_program_simulation(schema))
        self.assertEqual(result.nodes["unk_1"].status, "completed")
        # Unknown logic types should still return a result
        self.assertIn("result", result.nodes["unk_1"].output_data)

    def test_trigger_with_empty_payload(self) -> None:
        schema = _make_schema(nodes=[_make_trigger_node()], edges=[])
        result = _run(run_program_simulation(schema, trigger_payload={}))
        self.assertEqual(result.status, "completed")
        self.assertEqual(result.nodes["trigger_1"].output_data["payload"], {})

    def test_trigger_with_none_payload(self) -> None:
        schema = _make_schema(nodes=[_make_trigger_node()], edges=[])
        result = _run(run_program_simulation(schema, trigger_payload=None))
        self.assertEqual(result.status, "completed")

    def test_empty_program_just_trigger(self) -> None:
        schema = _make_schema(nodes=[_make_trigger_node()], edges=[])
        result = _run(run_program_simulation(schema))
        self.assertEqual(len(result.nodes), 1)
        self.assertEqual(len(result.edges_traversed), 0)
        self.assertEqual(len(result.errors), 0)

    def test_five_node_linear_chain(self) -> None:
        schema = _make_schema(
            nodes=[
                _make_trigger_node(),
                _make_connection_node("gmail_1", "gmail", "list_emails"),
                _make_connection_node("slack_1", "slack", "send_message"),
                _make_connection_node("n_1", "notion", "query_database"),
                _make_agent_node("agent_1"),
            ],
            edges=[
                _make_edge("trigger_1", "gmail_1"),
                _make_edge("gmail_1", "slack_1"),
                _make_edge("slack_1", "n_1"),
                _make_edge("n_1", "agent_1"),
            ],
        )
        result = _run(run_program_simulation(schema))
        self.assertEqual(len(result.nodes), 5)
        self.assertEqual(result.status, "completed")
        for state in result.nodes.values():
            self.assertEqual(state.status, "completed")


# ─── SimulationEngine: NodeSimulationState Details ──────────────────────────


class SimulationNodeStateDetailsTests(unittest.TestCase):
    """Detailed tests for individual node state properties."""

    def test_node_has_started_and_completed_timestamps(self) -> None:
        schema = _make_schema(
            nodes=[_make_trigger_node(), _make_connection_node("gmail_1", "gmail", "list_emails")],
            edges=[_make_edge("trigger_1", "gmail_1")],
        )
        result = _run(run_program_simulation(schema))
        state = result.nodes["gmail_1"]
        self.assertIsNotNone(state.started_at)
        self.assertIsNotNone(state.completed_at)
        # completed_at should be >= started_at
        started = datetime.fromisoformat(state.started_at)
        completed = datetime.fromisoformat(state.completed_at)
        self.assertGreaterEqual(completed, started)

    def test_node_duration_positive(self) -> None:
        schema = _make_schema(
            nodes=[_make_trigger_node(), _make_connection_node("gmail_1", "gmail", "list_emails")],
            edges=[_make_edge("trigger_1", "gmail_1")],
        )
        result = _run(run_program_simulation(schema))
        # Duration is mocked to 10.0ms
        self.assertGreater(result.nodes["gmail_1"].duration_ms, 0)

    def test_node_is_mock_flag(self) -> None:
        schema = _make_schema(
            nodes=[_make_trigger_node(), _make_agent_node("agent_1")],
            edges=[_make_edge("trigger_1", "agent_1")],
        )
        result = _run(run_program_simulation(schema))
        self.assertTrue(result.nodes["trigger_1"].is_mock)
        self.assertTrue(result.nodes["agent_1"].is_mock)


# ─── Integration: run_program_simulation convenience function ─────────────────


class RunProgramSimulationTests(unittest.TestCase):
    """Tests for the run_program_simulation convenience function."""

    def test_returns_simulation_result(self) -> None:
        schema = _make_schema(nodes=[_make_trigger_node()], edges=[])
        result = _run(run_program_simulation(schema))
        self.assertIsInstance(result, SimulationResult)

    def test_program_id_preserved(self) -> None:
        schema = _make_schema(
            nodes=[_make_trigger_node()],
            edges=[],
            program_id="my_custom_program",
        )
        result = _run(run_program_simulation(schema))
        self.assertEqual(result.program_id, "my_custom_program")

    def test_multiple_connectors_in_sequence(self) -> None:
        """Test a realistic workflow: trigger -> gmail -> slack -> github."""
        schema = _make_schema(
            nodes=[
                _make_trigger_node(),
                _make_connection_node("gmail_1", "gmail", "list_emails"),
                _make_connection_node("slack_1", "slack", "send_message"),
                _make_connection_node("gh_1", "github", "create_issue"),
            ],
            edges=[
                _make_edge("trigger_1", "gmail_1"),
                _make_edge("gmail_1", "slack_1"),
                _make_edge("slack_1", "gh_1"),
            ],
        )
        result = _run(run_program_simulation(schema))
        self.assertEqual(result.status, "completed")
        self.assertEqual(len(result.nodes), 4)
        # Each connector should have mock data
        self.assertIn("emails", result.nodes["gmail_1"].output_data)
        self.assertIn("ts", result.nodes["slack_1"].output_data)
        self.assertIn("number", result.nodes["gh_1"].output_data)


if __name__ == "__main__":
    unittest.main()
