"""Advanced executor tests closing coverage gaps in engine/executor.py."""

from __future__ import annotations


import asyncio
import hashlib
import json
import os
import unittest
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, Mock, patch


from schema import (
    AgentConfig,
    AgentTaskConfig,
    OAuthConnectionConfig,
    ProgramSchema,
    RetryConfig,
    SchemaNode,
    parse_schema,
)
from engine.executor import (
    NODE_ERROR_KEY,
    CancellationError,
    ConflictError,
    ExecutionError,
    ProgramExecutor,
    _estimate_cost_usd,
    _extract_reported_cost_usd,
    _extract_usage_tokens,
    _get_llm_client,
    _is_openrouter_call,
    _pricing_for_model,
    _recover_event_operation_params,
    _resolve_expression_raw,
    _resolve_nested,
    _resolve_path,
    _should_request_json_object,
    _supports_openai_json_mode,
    _validate_outbound_url,
    close_llm_client,
)

os.environ.setdefault("SUPABASE_URL", "http://localhost")
os.environ.setdefault("SUPABASE_KEY", "test-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
os.environ.setdefault("INTERNAL_SERVICE_AUTH_SECRET", "test-internal-secret")


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


def _simple_schema(nodes: list[dict], edges: list[dict] | None = None) -> ProgramSchema:
    return parse_schema(
        {
            "version": "1.0",
            "program_id": "test",
            "program_name": "Test",
            "execution_mode": "autonomous",
            "nodes": nodes,
            "edges": edges or [],
            "triggers": [],
            "version_history": [],
            "metadata": {},
        }
    )


def _make_executor(schema: ProgramSchema, **kwargs: Any) -> ProgramExecutor:
    executor = ProgramExecutor.__new__(ProgramExecutor)
    executor.schema = schema
    executor.run_id = kwargs.get("run_id", "run-1")
    executor.program_id = schema.program_id
    executor.user_id = kwargs.get("user_id", "user-1")
    executor.execution_mode = kwargs.get("execution_mode", "autonomous")
    executor.conflict_policy = kwargs.get("conflict_policy", "queue")
    executor.workspace_id = kwargs.get("workspace_id", "ws-1")
    executor.compliance_mode = kwargs.get("compliance_mode", "standard")
    executor.data_region = kwargs.get("data_region", "eu-central-1")
    executor.retention_expiry = "2099-01-01T00:00:00+00:00"
    executor.db = _mock_db()
    executor.node_map = {n.id: n for n in schema.nodes}
    executor.edges_from = {}
    for edge in schema.edges:
        executor.edges_from.setdefault(edge.from_node, []).append(edge)
    executor._connection_name_to_id = dict(kwargs.get("connection_name_to_id", {}))
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
    executor.dry_run = bool(kwargs.get("dry_run", False))
    return executor


# ─────────────────────────────────────────────────────────────
# 1. Helper functions
# ─────────────────────────────────────────────────────────────


class TestHelperExtractUsageTokens(unittest.TestCase):
    def test_completion_tokens_zero_with_total_greater_than_prompt(self) -> None:
        """completion_tokens=0 with total_tokens>prompt_tokens (lines 172-173)."""
        self.assertEqual(
            _extract_usage_tokens({"usage": {"prompt_tokens": 10, "completion_tokens": 0, "total_tokens": 15}}),
            (10, 5, 15),
        )


class TestHelperExtractReportedCostUsd(unittest.TestCase):
    def test_cost_keys(self) -> None:
        for key in ("cost", "total_cost", "estimated_cost", "estimated_cost_usd"):
            with self.subTest(key=key):
                self.assertEqual(
                    _extract_reported_cost_usd({"usage": {key: 0.123}}),
                    0.123,
                )

    def test_none_when_missing(self) -> None:
        self.assertIsNone(_extract_reported_cost_usd({"usage": {}}))


class TestHelperPricingForModel(unittest.TestCase):
    def test_empty_needle(self) -> None:
        self.assertIsNone(_pricing_for_model(""))

    def test_no_match(self) -> None:
        self.assertIsNone(_pricing_for_model("nonexistent-model-xyz"))

    def test_longest_match(self) -> None:
        """Prefer longest match so gpt-4.1-mini resolves before gpt-4.1."""
        pricing = _pricing_for_model("gpt-4.1-mini-2025")
        self.assertIsNotNone(pricing)
        self.assertEqual(pricing, (0.40, 1.60))

    def test_free_variant_never_priced(self) -> None:
        """':free' OpenRouter variants cost nothing — the substring match must
        not bill them at the paid model's rate."""
        self.assertIsNone(_pricing_for_model("qwen/qwen3-coder:free"))
        self.assertIsNone(_pricing_for_model("meta-llama/llama-3.3-70b-instruct:free"))

    def test_openrouter_paid_models_priced(self) -> None:
        self.assertEqual(_pricing_for_model("deepseek/deepseek-chat"), (0.27, 1.10))
        self.assertEqual(_pricing_for_model("qwen/qwen3-coder"), (0.20, 0.80))


class TestHelperEstimateCostUsd(unittest.TestCase):
    def test_pricing_none_returns_zero(self) -> None:
        self.assertEqual(_estimate_cost_usd("unknown-model", 100, 50), 0.0)

    def test_free_model_costs_zero(self) -> None:
        self.assertEqual(_estimate_cost_usd("openai/gpt-oss-120b:free", 1_000_000, 500_000), 0.0)


class TestHelperIsOpenrouterCall(unittest.TestCase):
    def test_provider_match(self) -> None:
        self.assertTrue(_is_openrouter_call("openrouter", "https://proxy.internal/v1"))

    def test_base_url_match(self) -> None:
        self.assertTrue(_is_openrouter_call("openai", "https://openrouter.ai/api/v1"))

    def test_no_match(self) -> None:
        self.assertFalse(_is_openrouter_call("openai", "https://api.openai.com/v1"))


class TestLogLlmUsage(unittest.TestCase):
    """_log_llm_usage feeds the admin cost/finance pages; it must degrade
    gracefully when the billing migration (or the whole table) is missing."""

    def _executor(self) -> ProgramExecutor:
        executor = ProgramExecutor.__new__(ProgramExecutor)
        executor.user_id = "user-1"
        executor.workspace_id = "ws-1"
        executor.run_id = "run-1"
        # __new__ skips __init__, so every attribute the method under test
        # touches has to be set here. _log_llm_usage stashes each call on the
        # node's telemetry (executor.py:1399) so it reaches
        # node_executions.token_usage; __init__ seeds this per schema node.
        executor._node_telemetry = {}
        return executor

    def _insert_db(self, execute_effects: list[Any]) -> tuple[Mock, Mock]:
        db = Mock()
        builder = Mock()
        db.table.return_value = builder
        builder.insert.return_value = builder
        builder.execute.side_effect = execute_effects
        return db, builder

    def test_enriched_row_written(self) -> None:
        executor = self._executor()
        db, builder = self._insert_db([Mock(data=[{}])])
        executor.db = db
        executor._log_llm_usage(
            "n1",
            "openai/gpt-4o",
            prompt_tokens=100,
            completion_tokens=50,
            total_tokens=150,
            estimated_cost_usd=0.00123,
            billed_credits=13,
            billing="platform",
            source="workflow",
        )
        db.table.assert_called_once_with("llm_usage_logs")
        row = builder.insert.call_args[0][0]
        self.assertEqual(row["user_id"], "user-1")
        self.assertEqual(row["run_id"], "run-1")
        self.assertEqual(row["model"], "openai/gpt-4o")
        self.assertEqual(row["total_tokens"], 150)
        self.assertEqual(row["estimated_cost_usd"], 0.00123)
        self.assertEqual(row["billed_credits"], 13)
        self.assertEqual(row["billing"], "platform")
        self.assertEqual(row["source"], "workflow")
        self.assertEqual(row["node_id"], "n1")

    def test_missing_billing_columns_falls_back_to_base_row(self) -> None:
        executor = self._executor()
        db, builder = self._insert_db(
            [
                Exception("Could not find the 'billed_credits' column of 'llm_usage_logs' in the schema cache"),
                Mock(data=[{}]),
            ]
        )
        executor.db = db
        executor._log_llm_usage("n1", "m", total_tokens=5, estimated_cost_usd=0.1)
        base_row = builder.insert.call_args_list[1][0][0]
        self.assertNotIn("billing", base_row)
        self.assertNotIn("billed_credits", base_row)
        self.assertNotIn("source", base_row)
        self.assertNotIn("node_id", base_row)
        self.assertEqual(base_row["estimated_cost_usd"], 0.1)
        self.assertFalse(getattr(executor, "_llm_usage_logging_disabled", False))

    def test_missing_table_disables_logging_for_run(self) -> None:
        executor = self._executor()
        db, builder = self._insert_db(
            [Exception("Could not find the table 'public.llm_usage_logs' in the schema cache")]
        )
        executor.db = db
        executor._log_llm_usage("n1", "m", total_tokens=5)
        self.assertTrue(executor._llm_usage_logging_disabled)
        executor._log_llm_usage("n1", "m", total_tokens=5)
        self.assertEqual(builder.insert.call_count, 1)

    def test_no_user_id_skips_logging(self) -> None:
        executor = self._executor()
        executor.user_id = ""
        db, builder = self._insert_db([Mock(data=[{}])])
        executor.db = db
        executor._log_llm_usage("n1", "m", total_tokens=5)
        builder.insert.assert_not_called()


class TestHelperResolvePath(unittest.TestCase):
    def test_array_index_syntax(self) -> None:
        data = {"emails": [{"id": "a"}, {"id": "b"}]}
        self.assertEqual(_resolve_path("emails[0].id", data), "a")
        self.assertEqual(_resolve_path("emails[1].id", data), "b")

    def test_out_of_bounds_index(self) -> None:
        data = {"emails": [{"id": "a"}]}
        self.assertIsNone(_resolve_path("emails[5].id", data))


class TestHelperRecoverEventOperationParams(unittest.TestCase):
    def test_nested_payload_webhook_payload_recovery(self) -> None:
        params = {"email": None, "subject": ""}
        inputs = {
            "event": {
                "payload": {
                    "email": "a@b.com",
                    "subjects": ["hello"],
                },
                "webhook_payload": {
                    "subject": "world",
                },
            }
        }
        recovered = _recover_event_operation_params(params, inputs)
        self.assertEqual(recovered["email"], "a@b.com")
        self.assertEqual(recovered["subject"], "hello")

    def test_nested_list_recovery(self) -> None:
        params = {"id": None}
        inputs = {
            "wrapper": {
                "event": "yes",
                "payload": [
                    {"id": "123"},
                ],
            }
        }
        recovered = _recover_event_operation_params(params, inputs)
        self.assertEqual(recovered["id"], "123")


class TestHelperResolveExpressionRaw(unittest.TestCase):
    def test_pure_expression(self) -> None:
        self.assertEqual(_resolve_expression_raw("{{x}}", {"x": 42}), 42)
        self.assertIsNone(_resolve_expression_raw("{{missing}}", {}))

    def test_mixed_string(self) -> None:
        self.assertEqual(_resolve_expression_raw("id={{x}}", {"x": 42}), "id=42")


class TestHelperResolveNested(unittest.TestCase):
    def test_dict_list_recursion(self) -> None:
        value = {"items": ["{{a}}", {"b": "{{c}}"}]}
        self.assertEqual(
            _resolve_nested(value, {"a": 1, "c": 2}),
            {"items": ["1", {"b": "2"}]},
        )


class TestHelperPayloadHash(unittest.TestCase):
    def test_hash(self) -> None:
        data = {"a": 1}
        expected = hashlib.sha256(
            json.dumps(data, sort_keys=True, default=str, separators=(",", ":")).encode()
        ).hexdigest()
        self.assertEqual(ProgramExecutor._payload_hash(data), expected)


class TestHelperApprovalDataSummary(unittest.TestCase):
    def test_summary(self) -> None:
        self.assertIn("3 top-level field(s)", ProgramExecutor._approval_data_summary({"a": 1, "b": 2, "c": 3}))

    def test_empty(self) -> None:
        self.assertIn("none", ProgramExecutor._approval_data_summary({}))


class TestHelperApprovalRiskFlags(unittest.TestCase):
    def test_flags(self) -> None:
        agent_node = SchemaNode(
            id="a",
            type="agent",
            label="",
            description="",
            connection=None,
            config=AgentConfig(
                model="gpt-4o",
                api_key_ref="platform",
                system_prompt="",
                input_schema=None,
                output_schema=None,
                requires_approval=False,
                approval_timeout_hours=24.0,
                scope_required=None,
                scope_access="read",
                retry=RetryConfig(1, "none", 0.0, False),
                tools=[],
            ),
            position={},
            status="idle",
        )
        conn_node = SchemaNode(
            id="c",
            type="connection",
            label="",
            description="",
            connection=None,
            config=OAuthConnectionConfig(scope_access="read", scope_required=[]),
            position={},
            status="idle",
        )
        self.assertEqual(ProgramExecutor._approval_risk_flags(agent_node), ["ai_model_call"])
        self.assertEqual(ProgramExecutor._approval_risk_flags(conn_node), ["external_system_write"])


class TestHelperValidateOutboundUrl(unittest.TestCase):
    def test_bad_scheme(self) -> None:
        with self.assertRaises(ExecutionError) as ctx:
            _validate_outbound_url("ftp://example.com")
        self.assertEqual(ctx.exception.code, "HTTP_FORBIDDEN_URL")

    def test_missing_hostname(self) -> None:
        with self.assertRaises(ExecutionError) as ctx:
            _validate_outbound_url("http://")
        self.assertEqual(ctx.exception.code, "HTTP_FORBIDDEN_URL")

    def test_literal_ip_private(self) -> None:
        with self.assertRaises(ExecutionError) as ctx:
            _validate_outbound_url("http://10.0.0.1")
        self.assertEqual(ctx.exception.code, "HTTP_FORBIDDEN_URL")

    def test_resolve_failure(self) -> None:
        import socket as _socket

        with patch("engine.executor.socket.getaddrinfo", side_effect=_socket.gaierror("fail")):
            with self.assertRaises(ExecutionError) as ctx:
                _validate_outbound_url("http://unresolvable-host-12345.local")
            self.assertEqual(ctx.exception.code, "HTTP_FORBIDDEN_URL")

    def test_resolved_ip_private(self) -> None:
        with patch("engine.executor.socket.getaddrinfo", return_value=[(2, 1, 6, "", ("127.0.0.1", 80))]):
            with self.assertRaises(ExecutionError) as ctx:
                _validate_outbound_url("http://localhost.example.com")
            self.assertEqual(ctx.exception.code, "HTTP_FORBIDDEN_URL")


class TestHelperValidateHttpUrl(unittest.TestCase):
    def test_blocked_networks(self) -> None:
        with self.assertRaises(ExecutionError) as ctx:
            ProgramExecutor._validate_http_url("http://192.168.1.1")
        self.assertEqual(ctx.exception.code, "HTTP_CONFIG_INVALID")


class TestHelperGetLlmClient(unittest.TestCase):
    def test_singleton_and_close(self) -> None:
        async def exercise() -> None:
            client = _get_llm_client()
            self.assertIs(_get_llm_client(), client)
            await close_llm_client()
            self.assertTrue(client.is_closed)
            await close_llm_client()

        asyncio.run(exercise())


class TestHelperSupportsOpenaiJsonMode(unittest.TestCase):
    def test_supports(self) -> None:
        self.assertTrue(_supports_openai_json_mode("openai", "https://api.openai.com/v1", None))
        self.assertFalse(_supports_openai_json_mode("openai", "https://api.openai.com/v1", "http://litellm"))
        self.assertFalse(_supports_openai_json_mode("anthropic", "https://api.openai.com/v1", None))


class TestHelperShouldRequestJsonObject(unittest.TestCase):
    def test_output_schema(self) -> None:
        cfg = AgentConfig(
            model="gpt-4o",
            api_key_ref="platform",
            system_prompt="",
            input_schema=None,
            output_schema={"type": "object"},
            requires_approval=False,
            approval_timeout_hours=24.0,
            scope_required=None,
            scope_access="read",
            retry=RetryConfig(1, "none", 0.0, False),
            tools=[],
        )
        self.assertTrue(_should_request_json_object(cfg))

    def test_json_in_prompt(self) -> None:
        cfg = AgentConfig(
            model="gpt-4o",
            api_key_ref="platform",
            system_prompt="Return JSON",
            input_schema=None,
            output_schema=None,
            requires_approval=False,
            approval_timeout_hours=24.0,
            scope_required=None,
            scope_access="read",
            retry=RetryConfig(1, "none", 0.0, False),
            tools=[],
        )
        self.assertTrue(_should_request_json_object(cfg))

    def test_false(self) -> None:
        cfg = AgentConfig(
            model="gpt-4o",
            api_key_ref="platform",
            system_prompt="Hello",
            input_schema=None,
            output_schema=None,
            requires_approval=False,
            approval_timeout_hours=24.0,
            scope_required=None,
            scope_access="read",
            retry=RetryConfig(1, "none", 0.0, False),
            tools=[],
        )
        self.assertFalse(_should_request_json_object(cfg))


# ─────────────────────────────────────────────────────────────
# 2. ProgramExecutor initialization edge cases
# ─────────────────────────────────────────────────────────────


class TestProgramExecutorInit(unittest.TestCase):
    def test_invalid_compliance_mode_fallback(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = ProgramExecutor(schema, "r1", "p1", "u1", compliance_mode="invalid")
        self.assertEqual(executor.compliance_mode, "standard")

    def test_invalid_execution_log_retention_days_fallback(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = ProgramExecutor(schema, "r1", "p1", "u1", execution_log_retention_days="bad")
        # Should be ~90 days from now; just verify it's in the future
        self.assertTrue(executor.retention_expiry.startswith("20"))

    def test_per_run_dry_run_via_trigger_payload(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = ProgramExecutor(schema, "r1", "p1", "u1")
        self.assertFalse(executor.dry_run)
        # The execute method flips dry_run when __dry_run__ is present
        # We test that directly in the cancellation section.


# ─────────────────────────────────────────────────────────────
# 3. Manual / Supervised mode
# ─────────────────────────────────────────────────────────────


class TestManualSupervisedMode(unittest.IsolatedAsyncioTestCase):
    async def test_manual_skips_non_trigger_nodes(self) -> None:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {
                    "id": "a",
                    "type": "agent",
                    "config": {
                        "model": "gpt-4o",
                        "api_key_ref": "platform",
                        "system_prompt": "",
                        "requires_approval": False,
                        "scope_access": "read",
                        "retry": {
                            "max_attempts": 1,
                            "backoff": "none",
                            "backoff_base_seconds": 0,
                            "fail_program_on_exhaust": False,
                        },
                    },
                },
            ],
            [{"id": "e1", "from": "t", "to": "a", "type": "data_flow"}],
        )
        executor = _make_executor(schema, execution_mode="manual")
        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_request_step_approval", new=AsyncMock(return_value=False)),
        ):
            result = await executor.execute({})
        self.assertEqual(result["a"], {})

    async def test_supervised_on_agent_nodes(self) -> None:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {
                    "id": "a",
                    "type": "agent",
                    "config": {
                        "model": "gpt-4o",
                        "api_key_ref": "platform",
                        "system_prompt": "",
                        "requires_approval": False,
                        "scope_access": "read",
                        "retry": {
                            "max_attempts": 1,
                            "backoff": "none",
                            "backoff_base_seconds": 0,
                            "fail_program_on_exhaust": False,
                        },
                    },
                },
            ],
            [{"id": "e1", "from": "t", "to": "a", "type": "data_flow"}],
        )
        executor = _make_executor(schema, execution_mode="supervised")
        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_request_step_approval", new=AsyncMock(return_value=True)),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_circuit,
            patch.object(executor, "_call_llm", new=AsyncMock(return_value={"summary": "ok"})),
        ):

            async def _circuit_call(fn, *args, **kwargs):
                return await fn(*args)

            circuit = Mock()
            circuit.call = AsyncMock(side_effect=_circuit_call)
            mock_circuit.return_value = circuit
            result = await executor.execute({})
        self.assertEqual(result["a"], {"summary": "ok"})

    async def test_approval_rejection_returns_empty(self) -> None:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {
                    "id": "a",
                    "type": "agent",
                    "config": {
                        "model": "gpt-4o",
                        "api_key_ref": "platform",
                        "system_prompt": "",
                        "requires_approval": False,
                        "scope_access": "read",
                        "retry": {
                            "max_attempts": 1,
                            "backoff": "none",
                            "backoff_base_seconds": 0,
                            "fail_program_on_exhaust": False,
                        },
                    },
                },
            ],
            [{"id": "e1", "from": "t", "to": "a", "type": "data_flow"}],
        )
        executor = _make_executor(schema, execution_mode="supervised")
        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(executor, "_request_step_approval", new=AsyncMock(return_value=False)),
        ):
            result = await executor.execute({})
        self.assertEqual(result["a"], {})

    async def test_request_step_approval_and_wait_approved(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        executor.db.table("node_executions").select().eq().order().limit().execute.return_value = Mock(
            data=[{"id": "ne-1"}]
        )
        with (
            patch("engine.executor.create_approval", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
        ):
            with patch.object(executor, "_wait_for_approval_decision", new=AsyncMock(return_value=True)):
                approved = await executor._request_step_approval(executor.node_map["t"], {}, "test reason")
        self.assertTrue(approved)

    async def test_request_step_approval_and_wait_rejected(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        executor.db.table("node_executions").select().eq().order().limit().execute.return_value = Mock(
            data=[{"id": "ne-1"}]
        )
        with (
            patch("engine.executor.create_approval", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
        ):
            with patch.object(executor, "_wait_for_approval_decision", new=AsyncMock(return_value=False)):
                approved = await executor._request_step_approval(executor.node_map["t"], {}, "test reason")
        self.assertFalse(approved)

    async def test_wait_for_approval_timeout(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        # Simulate DB returning empty rows so the loop times out quickly
        executor.db.table("approvals").select().eq().limit().execute.return_value = Mock(data=[])
        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.touch_run_watcher_heartbeat", new=AsyncMock()),
        ):
            with self.assertRaises(ExecutionError) as ctx:
                await executor._wait_for_approval_decision("ne-1", timeout_seconds=0.1)
        self.assertEqual(ctx.exception.code, "APPROVAL_TIMEOUT")

    async def test_wait_for_approval_decision_pauses_and_resumes_limiter(self) -> None:
        """The run's active-execution clock must be paused for the whole wait
        and resumed once it resolves -- this is what lets main.py's watchdog
        avoid killing a legitimately long approval wait (see main.py's
        _run_with_active_timeout / RunLimiter.pause)."""
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        executor.db.table("approvals").select().eq().limit().execute.return_value = Mock(
            data=[{"status": "approved"}]
        )
        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.touch_run_watcher_heartbeat", new=AsyncMock()) as mock_heartbeat,
        ):
            result = await executor._wait_for_approval_decision("ne-1", timeout_seconds=5)
        self.assertTrue(result)
        executor._limiter.pause.assert_called_once()
        executor._limiter.resume.assert_called_once()
        mock_heartbeat.assert_awaited()

    def _table_dispatch_db(self, responses: dict[str, Any]) -> Mock:
        """A DB mock that returns a distinct fluent builder per table name,
        unlike _mock_db()'s single shared builder -- needed here because the
        idempotency check reads from both node_executions and approvals in
        the same call and each must see its own canned response."""
        builders: dict[str, Mock] = {}
        for table_name, execute_return in responses.items():
            builder = Mock()
            for method in ["eq", "order", "limit", "select", "single", "in_"]:
                getattr(builder, method).return_value = builder
            builder.execute.return_value = execute_return
            builders[table_name] = builder
        db = Mock()
        db.table = Mock(side_effect=lambda name: builders[name])
        return db

    async def test_request_step_approval_reuses_decided_approval(self) -> None:
        """Re-dispatch after a runtime restart lands back on an approval-gate
        node whose approval was already decided while orphaned. Must return
        the existing decision immediately, not ask again."""
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        executor.db = self._table_dispatch_db(
            {
                "node_executions": Mock(data=[{"id": "ne-1"}]),
                "approvals": Mock(data=[{"id": "a-1", "status": "approved", "context": {}, "created_at": None}]),
            }
        )
        with (
            patch("engine.executor.create_approval", new=AsyncMock()) as mock_create,
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch.object(executor, "_wait_for_approval_decision", new=AsyncMock()) as mock_wait,
        ):
            approved = await executor._request_step_approval(executor.node_map["t"], {}, "test reason")
        self.assertTrue(approved)
        mock_create.assert_not_awaited()
        mock_wait.assert_not_awaited()

    async def test_request_step_approval_resumes_pending_approval(self) -> None:
        """A still-pending approval from before a restart is resumed on the
        same row, not duplicated."""
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        executor.db = self._table_dispatch_db(
            {
                "node_executions": Mock(data=[{"id": "ne-1"}]),
                "approvals": Mock(
                    data=[{"id": "a-1", "status": "pending", "context": {"timeout_hours": 24}, "created_at": None}]
                ),
            }
        )
        with (
            patch("engine.executor.create_approval", new=AsyncMock()) as mock_create,
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch.object(executor, "_wait_for_approval_decision", new=AsyncMock(return_value=True)) as mock_wait,
        ):
            approved = await executor._request_step_approval(executor.node_map["t"], {}, "test reason")
        self.assertTrue(approved)
        mock_create.assert_not_awaited()
        mock_wait.assert_awaited_once()
        self.assertEqual(mock_wait.call_args.args[0], "ne-1")

    async def test_wait_for_agent_answer_pauses_and_resumes_limiter(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        executor.db.table("approvals").select().eq().limit().execute.return_value = Mock(
            data=[{"status": "approved", "decision_note": "go ahead"}]
        )
        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.touch_run_watcher_heartbeat", new=AsyncMock()) as mock_heartbeat,
        ):
            answer = await executor._wait_for_agent_answer("approval-1", timeout_seconds=5)
        self.assertEqual(answer, "go ahead")
        executor._limiter.pause.assert_called_once()
        executor._limiter.resume.assert_called_once()
        mock_heartbeat.assert_awaited()

    async def test_wait_for_file_operation_pauses_and_resumes_limiter(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        executor.db.table("file_operations").select().eq().limit().execute.return_value = Mock(
            data=[{"status": "done", "result": {"ok": True}, "error": None}]
        )
        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.touch_run_watcher_heartbeat", new=AsyncMock()) as mock_heartbeat,
        ):
            outcome = await executor._wait_for_file_operation("op-1", timeout_seconds=5, node_id="n1")
        self.assertEqual(outcome["status"], "done")
        executor._limiter.pause.assert_called_once()
        executor._limiter.resume.assert_called_once()
        mock_heartbeat.assert_awaited()


# ─────────────────────────────────────────────────────────────
# 4. Cancellation
# ─────────────────────────────────────────────────────────────


class TestCancellation(unittest.IsolatedAsyncioTestCase):
    async def test_cancelled_during_execution(self) -> None:
        # Two chained steps so the run makes two loop iterations: the first
        # (s1) sees "running" and executes, then the cancellation is detected at
        # the top of the second iteration before s2 runs.
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {"id": "s1", "type": "step", "config": {"logic_type": "delay", "extra": {"seconds": 0}}},
                {"id": "s2", "type": "step", "config": {"logic_type": "delay", "extra": {"seconds": 0}}},
            ],
            [
                {"id": "e1", "from": "t", "to": "s1", "type": "data_flow"},
                {"id": "e2", "from": "s1", "to": "s2", "type": "data_flow"},
            ],
        )
        executor = _make_executor(schema)
        with (
            patch("engine.executor.get_run_status", new=AsyncMock(side_effect=["running", "cancelled"])),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
        ):
            with self.assertRaises(CancellationError):
                await executor.execute({})

    async def test_cancelled_during_lock_queue_wait(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema, conflict_policy="queue")
        with (
            patch("engine.executor.get_existing_lock", new=AsyncMock(return_value={"locked_by_run_id": "other-run"})),
            patch("engine.executor.get_run_status", new=AsyncMock(side_effect=["running", "cancelled"])),
        ):
            with self.assertRaises(CancellationError):
                await executor._acquire_one_lock("connection", "conn-1")


# ─────────────────────────────────────────────────────────────
# 5. Conflict / Lock paths
# ─────────────────────────────────────────────────────────────


class TestConflictLockPaths(unittest.IsolatedAsyncioTestCase):
    async def test_conflict_policy_skip(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema, conflict_policy="skip")
        with patch("engine.executor.get_existing_lock", new=AsyncMock(return_value={"locked_by_run_id": "other"})):
            with self.assertRaises(ExecutionError) as ctx:
                await executor._acquire_one_lock("connection", "conn-1")
        self.assertEqual(ctx.exception.code, "CONFLICT_SKIP")

    async def test_conflict_policy_fail(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema, conflict_policy="fail")
        with patch("engine.executor.get_existing_lock", new=AsyncMock(return_value={"locked_by_run_id": "other"})):
            with self.assertRaises(ConflictError):
                await executor._acquire_one_lock("connection", "conn-1")

    async def test_conflict_policy_queue_lock_timeout(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema, conflict_policy="queue")
        with (
            patch("engine.executor.get_existing_lock", new=AsyncMock(return_value={"locked_by_run_id": "other"})),
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("asyncio.sleep", new=AsyncMock()),
        ):
            with self.assertRaises(ExecutionError) as ctx:
                await executor._acquire_one_lock("connection", "conn-1")
        self.assertEqual(ctx.exception.code, "LOCK_TIMEOUT")

    async def test_acquire_one_lock_race_condition_fallback(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema, conflict_policy="queue")
        with (
            patch("engine.executor.get_existing_lock", new=AsyncMock(return_value=None)),
            patch("engine.executor.acquire_resource_lock", new=AsyncMock(return_value=False)),
        ):
            # Should not raise for queue policy when race condition happens
            await executor._acquire_one_lock("connection", "conn-1")

    async def test_acquire_one_lock_race_fail(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema, conflict_policy="fail")
        with (
            patch("engine.executor.get_existing_lock", new=AsyncMock(return_value=None)),
            patch("engine.executor.acquire_resource_lock", new=AsyncMock(return_value=False)),
        ):
            with self.assertRaises(ConflictError):
                await executor._acquire_one_lock("connection", "conn-1")


# ─────────────────────────────────────────────────────────────
# 6. Branch / Filter / Loop edge cases
# ─────────────────────────────────────────────────────────────


class TestBranchFilterLoopEdgeCases(unittest.IsolatedAsyncioTestCase):
    async def test_branch_target_invalid(self) -> None:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {
                    "id": "b",
                    "type": "step",
                    "config": {
                        "logic_type": "branch",
                        "extra": {
                            "conditions": [{"condition": "True", "target_node_id": "nonexistent"}],
                            "default_branch": "",
                        },
                    },
                },
            ],
            [{"id": "e1", "from": "t", "to": "b", "type": "data_flow"}],
        )
        executor = _make_executor(schema)
        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
        ):
            with self.assertRaises(ExecutionError) as ctx:
                await executor.execute({"value": 1})
        self.assertEqual(ctx.exception.code, "BRANCH_TARGET_INVALID")

    async def test_loop_limit_exceeded(self) -> None:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {
                    "id": "l",
                    "type": "step",
                    "config": {"logic_type": "loop", "over": "input.items", "item_var": "item"},
                },
                {"id": "s", "type": "step", "config": {"logic_type": "transform", "transformation": "input.item"}},
            ],
            [
                {"id": "e1", "from": "t", "to": "l", "type": "data_flow"},
                {"id": "e2", "from": "l", "to": "s", "type": "data_flow"},
            ],
        )
        executor = _make_executor(schema)
        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
        ):
            with self.assertRaises(ExecutionError) as ctx:
                await executor.execute({"items": list(range(101))})
        self.assertEqual(ctx.exception.code, "LOOP_LIMIT_EXCEEDED")

    async def test_filter_short_circuit_skipping_descendants(self) -> None:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {"id": "f", "type": "step", "config": {"logic_type": "filter", "condition": "False"}},
                {"id": "s", "type": "step", "config": {"logic_type": "transform", "transformation": "1"}},
            ],
            [
                {"id": "e1", "from": "t", "to": "f", "type": "data_flow"},
                {"id": "e2", "from": "f", "to": "s", "type": "data_flow"},
            ],
        )
        executor = _make_executor(schema)
        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
        ):
            result = await executor.execute({})
        self.assertTrue(result["f"].get("__filtered_out__"))
        self.assertEqual(result["s"], {"__skipped__": True})

    async def test_loop_body_with_branch_and_filter(self) -> None:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {
                    "id": "l",
                    "type": "step",
                    "config": {"logic_type": "loop", "extra": {"over": "items", "item_var": "item"}},
                },
                {
                    "id": "b",
                    "type": "step",
                    "config": {
                        "logic_type": "branch",
                        "extra": {
                            "conditions": [{"condition": "item > 1", "target_node_id": "f"}],
                            "default_branch": "f",
                        },
                    },
                },
                {"id": "f", "type": "step", "config": {"logic_type": "filter", "extra": {"condition": "item > 0"}}},
                {"id": "s", "type": "step", "config": {"logic_type": "transform", "extra": {"transformation": "item"}}},
            ],
            [
                {"id": "e1", "from": "t", "to": "l", "type": "data_flow"},
                {"id": "e2", "from": "l", "to": "b", "type": "data_flow"},
                {"id": "e3", "from": "b", "to": "f", "type": "data_flow"},
                {"id": "e4", "from": "f", "to": "s", "type": "data_flow"},
            ],
        )
        executor = _make_executor(schema)
        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
        ):
            result = await executor.execute({"items": [1, 2]})
        self.assertIn("iterations", result["s"])


# ─────────────────────────────────────────────────────────────
# 7. Agent execution paths
# ─────────────────────────────────────────────────────────────


class TestAgentExecutionPaths(unittest.IsolatedAsyncioTestCase):
    async def test_execute_agent_circuit_open(self) -> None:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {
                    "id": "a",
                    "type": "agent",
                    "config": {
                        "model": "gpt-4o",
                        "api_key_ref": "platform",
                        "system_prompt": "",
                        "requires_approval": False,
                        "scope_access": "read",
                        "retry": {
                            "max_attempts": 1,
                            "backoff": "none",
                            "backoff_base_seconds": 0,
                            "fail_program_on_exhaust": False,
                        },
                    },
                },
            ],
            [{"id": "e1", "from": "t", "to": "a", "type": "data_flow"}],
        )
        executor = _make_executor(schema)
        from engine.circuit_breaker import CircuitOpenError

        with (
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit") as mock_circuit,
        ):
            mock_circuit.return_value.call = AsyncMock(side_effect=CircuitOpenError("open"))
            with self.assertRaises(ExecutionError) as ctx:
                await executor._execute_agent(executor.node_map["a"], {})
        self.assertEqual(ctx.exception.code, "LLM_CIRCUIT_OPEN")

    async def test_execute_agent_task_anthropic_path(self) -> None:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {
                    "id": "at",
                    "type": "agent_task",
                    "config": {
                        "objective": "test",
                        "model": "claude-3-haiku",
                        "api_key_ref": "my-key",
                        "max_iterations": 1,
                        "requires_approval": False,
                        "scope_access": "read",
                        "retry": {
                            "max_attempts": 1,
                            "backoff": "none",
                            "backoff_base_seconds": 0,
                            "fail_program_on_exhaust": False,
                        },
                    },
                },
            ],
            [{"id": "e1", "from": "t", "to": "at", "type": "data_flow"}],
        )
        executor = _make_executor(schema)
        llm_response = Mock()
        llm_response.is_success = True
        llm_response.json.return_value = {
            "content": [{"type": "text", "text": "done"}],
            "usage": {"input_tokens": 5, "output_tokens": 3},
        }
        with (
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "anthropic"))),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch("engine.executor._get_llm_client") as mock_client,
            patch("engine.executor.update_node_execution", new=AsyncMock()),
        ):
            mock_client.return_value.post = AsyncMock(return_value=llm_response)
            result = await executor._execute_agent_task(executor.node_map["at"], {})
        self.assertEqual(result["summary"], "done")

    def _agent_task_schema(self):
        return _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {
                    "id": "at",
                    "type": "agent_task",
                    "config": {
                        "objective": "test",
                        "model": "gpt-4o",
                        "api_key_ref": "k1",
                        "max_iterations": 2,
                        "requires_approval": False,
                        "scope_access": "write",
                        "retry": {
                            "max_attempts": 1,
                            "backoff": "none",
                            "backoff_base_seconds": 0,
                            "fail_program_on_exhaust": False,
                        },
                    },
                },
            ],
            [{"id": "e1", "from": "t", "to": "at", "type": "data_flow"}],
        )

    async def test_agent_task_does_not_fall_through_after_a_tool_ran(self) -> None:
        # R9: once a tool call executed under a credential, a mid-loop key error
        # must FAIL the node, not restart the loop on the next key (which would
        # re-execute completed writes, e.g. re-send an email).
        executor = _make_executor(self._agent_task_schema())
        executor._agent_credentials = [{"ref": "k1", "model": "gpt-4o"}, {"ref": "k2", "model": "gpt-4o"}]
        executor._agent_tool_calls_made = 0

        async def fake_loop(*_a, **_k):
            executor._agent_tool_calls_made += 1  # a tool executed under this key
            raise ExecutionError("AGENT_TASK_LLM_ERROR", "OpenRouter: Insufficient credits", "at")

        loop_mock = AsyncMock(side_effect=fake_loop)
        with (
            patch.object(executor, "_enforce_agent_model_access", Mock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_agent_loop_openai", loop_mock),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
        ):
            with self.assertRaises(ExecutionError):
                await executor._execute_agent_task(executor.node_map["at"], {})
        self.assertEqual(loop_mock.await_count, 1)  # did NOT fall through to k2

    async def test_agent_task_falls_through_when_no_tool_ran(self) -> None:
        # R9: a key error BEFORE any tool executed is safe to retry on the next
        # credential candidate.
        executor = _make_executor(self._agent_task_schema())
        executor._agent_credentials = [{"ref": "k1", "model": "gpt-4o"}, {"ref": "k2", "model": "gpt-4o"}]
        executor._agent_tool_calls_made = 0
        calls = {"n": 0}

        async def fake_loop(*_a, **_k):
            calls["n"] += 1
            if calls["n"] == 1:
                # No tool executed under k1 (counter unchanged) — just a bad key.
                raise ExecutionError("AGENT_TASK_LLM_ERROR", "insufficient credits", "at")
            return ("done", [])

        loop_mock = AsyncMock(side_effect=fake_loop)
        with (
            patch.object(executor, "_enforce_agent_model_access", Mock()),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("key", "openai"))),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch.object(executor, "_agent_loop_openai", loop_mock),
            patch.object(executor, "_ensure_agent_report", AsyncMock(side_effect=lambda _n, _c, _s, inv: inv)),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
        ):
            result = await executor._execute_agent_task(executor.node_map["at"], {})
        self.assertEqual(result["summary"], "done")
        self.assertEqual(loop_mock.await_count, 2)  # fell through to k2

    async def test_agent_loop_openai_with_tool_calls(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        cfg = AgentTaskConfig(
            objective="test",
            model="gpt-4o",
            api_key_ref="platform",
            max_iterations=3,
            requires_approval=False,
            scope_access="read",
            retry=RetryConfig(1, "none", 0.0, False),
            input_schema=None,
            output_schema=None,
            approval_timeout_hours=24.0,
            tools=["tool_1"],
        )

        resp1 = Mock()
        resp1.is_success = True
        resp1.json.return_value = {
            "choices": [
                {
                    "message": {
                        "content": "",
                        "tool_calls": [{"id": "c1", "function": {"name": "tool_1", "arguments": "{}"}}],
                    }
                }
            ],
            "usage": {"prompt_tokens": 5, "completion_tokens": 5},
        }
        resp2 = Mock()
        resp2.is_success = True
        resp2.json.return_value = {
            "choices": [{"message": {"content": "final"}}],
            "usage": {"prompt_tokens": 5, "completion_tokens": 5},
        }

        with (
            patch("engine.executor._get_llm_client") as mock_client,
            patch.object(executor, "_call_agent_tool", new=AsyncMock(return_value={"ok": True})),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
        ):
            mock_client.return_value.post = AsyncMock(side_effect=[resp1, resp2])
            summary, invocations = await executor._agent_loop_openai(
                cfg, "key", "openai", "node-1", "sys", "input", ["tool_1"], 3, cfg.model
            )
        self.assertEqual(summary, "final")
        self.assertEqual(len(invocations), 1)

    async def test_agent_loop_anthropic_with_tool_use(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        cfg = AgentTaskConfig(
            objective="test",
            model="claude-3-haiku",
            api_key_ref="platform",
            max_iterations=3,
            requires_approval=False,
            scope_access="read",
            retry=RetryConfig(1, "none", 0.0, False),
            input_schema=None,
            output_schema=None,
            approval_timeout_hours=24.0,
            tools=["tool_1"],
        )

        resp1 = Mock()
        resp1.is_success = True
        resp1.json.return_value = {
            "content": [
                {"type": "text", "text": "thinking"},
                {"type": "tool_use", "id": "u1", "name": "tool_1", "input": {"x": 1}},
            ],
            "usage": {"input_tokens": 5, "output_tokens": 5},
        }
        resp2 = Mock()
        resp2.is_success = True
        resp2.json.return_value = {
            "content": [{"type": "text", "text": "final"}],
            "usage": {"input_tokens": 5, "output_tokens": 5},
        }

        with (
            patch("engine.executor._get_llm_client") as mock_client,
            patch.object(executor, "_call_agent_tool", new=AsyncMock(return_value={"ok": True})),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
        ):
            mock_client.return_value.post = AsyncMock(side_effect=[resp1, resp2])
            summary, invocations = await executor._agent_loop_anthropic(
                cfg, "key", "node-1", "sys", "input", ["tool_1"], 3, cfg.model
            )
        self.assertEqual(summary, "final")
        self.assertEqual(len(invocations), 1)

    async def test_call_agent_tool_endpoint_errors(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)

        # 404
        resp404 = Mock()
        resp404.is_success = False
        resp404.status_code = 404
        resp404.json = Mock(side_effect=Exception("no json"))
        resp404.text = "not found"

        # 500
        resp500 = Mock()
        resp500.is_success = False
        resp500.status_code = 500
        resp500.json = Mock(side_effect=Exception("no json"))
        resp500.text = "err"

        # unreachable (exception)
        with (
            patch("engine.executor._get_llm_client") as mock_client,
            patch.object(
                executor,
                "_nextjs_endpoint_candidates",
                return_value=["http://a/api/internal/agent-tools", "http://b/api/internal/agent-tools"],
            ),
        ):
            mock_client.return_value.post = AsyncMock(side_effect=[resp404, resp500, Exception("unreachable")])
            result = await executor._call_agent_tool("t1", {})
        self.assertFalse(result["ok"])
        self.assertIn("error", result)

    async def test_agent_task_dry_run_mode(self) -> None:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {
                    "id": "at",
                    "type": "agent_task",
                    "config": {
                        "objective": "test",
                        "model": "gpt-4o",
                        "api_key_ref": "platform",
                        "max_iterations": 1,
                        "requires_approval": False,
                        "scope_access": "read",
                        "retry": {
                            "max_attempts": 1,
                            "backoff": "none",
                            "backoff_base_seconds": 0,
                            "fail_program_on_exhaust": False,
                        },
                    },
                },
            ],
            [{"id": "e1", "from": "t", "to": "at", "type": "data_flow"}],
        )
        executor = _make_executor(schema, dry_run=True)
        llm_response = Mock()
        llm_response.is_success = True
        llm_response.json.return_value = {
            "choices": [{"message": {"content": "done"}}],
            "usage": {"prompt_tokens": 5, "completion_tokens": 3},
        }
        with (
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("fake-key", "openai"))),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch("engine.executor._get_llm_client") as mock_client,
            patch("engine.executor.update_node_execution", new=AsyncMock()),
        ):
            mock_client.return_value.post = AsyncMock(return_value=llm_response)
            result = await executor._execute_agent_task(executor.node_map["at"], {})
        self.assertTrue(result.get("dry_run"))

    async def test_call_llm_missing_api_key(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        cfg = AgentConfig(
            model="gpt-4o",
            api_key_ref="platform",
            system_prompt="",
            input_schema=None,
            output_schema=None,
            requires_approval=False,
            approval_timeout_hours=24.0,
            scope_required=None,
            scope_access="read",
            retry=RetryConfig(1, "none", 0.0, False),
            tools=[],
        )
        with self.assertRaises(ExecutionError) as ctx:
            await executor._call_llm(cfg, "", "openai", {}, "n1")
        self.assertEqual(ctx.exception.code, "API_KEY_MISSING")

    async def test_call_llm_anthropic_native_path(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        cfg = AgentConfig(
            model="claude-3-haiku",
            api_key_ref="platform",
            system_prompt="hi",
            input_schema=None,
            output_schema=None,
            requires_approval=False,
            approval_timeout_hours=24.0,
            scope_required=None,
            scope_access="read",
            retry=RetryConfig(1, "none", 0.0, False),
            tools=[],
        )
        resp = Mock()
        resp.is_success = True
        resp.json.return_value = {
            "content": [{"type": "text", "text": "hello"}],
            "usage": {"input_tokens": 5, "output_tokens": 3},
        }
        with (
            patch("engine.executor._get_llm_client") as mock_client,
            patch("engine.executor.update_node_execution", new=AsyncMock()),
        ):
            mock_client.return_value.post = AsyncMock(return_value=resp)
            result = await executor._call_llm(cfg, "key", "anthropic", {}, "n1")
        self.assertEqual(result["text"], "hello")

    async def test_call_llm_should_request_json_object_and_supports(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        cfg = AgentConfig(
            model="gpt-4o",
            api_key_ref="platform",
            system_prompt="Return JSON",
            input_schema=None,
            output_schema=None,
            requires_approval=False,
            approval_timeout_hours=24.0,
            scope_required=None,
            scope_access="read",
            retry=RetryConfig(1, "none", 0.0, False),
            tools=[],
        )
        resp = Mock()
        resp.is_success = True
        resp.json.return_value = {
            "choices": [{"message": {"content": '{"ok": true}'}}],
            "usage": {"prompt_tokens": 5, "completion_tokens": 3},
        }
        with (
            patch("engine.executor._get_llm_client") as mock_client,
            patch("engine.executor.update_node_execution", new=AsyncMock()),
        ):
            mock_client.return_value.post = AsyncMock(return_value=resp)
            result = await executor._call_llm(cfg, "key", "openai", {}, "n1")
        self.assertEqual(result, {"ok": True})

    async def test_call_llm_reported_cost_from_usage(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        cfg = AgentConfig(
            model="gpt-4o",
            api_key_ref="platform",
            system_prompt="",
            input_schema=None,
            output_schema=None,
            requires_approval=False,
            approval_timeout_hours=24.0,
            scope_required=None,
            scope_access="read",
            retry=RetryConfig(1, "none", 0.0, False),
            tools=[],
        )
        resp = Mock()
        resp.is_success = True
        resp.json.return_value = {
            "choices": [{"message": {"content": "hi"}}],
            "usage": {"prompt_tokens": 5, "completion_tokens": 3, "total_cost": 0.0123},
        }
        with (
            patch("engine.executor._get_llm_client") as mock_client,
            patch("engine.executor.update_node_execution", new=AsyncMock()),
        ):
            mock_client.return_value.post = AsyncMock(return_value=resp)
            result = await executor._call_llm(cfg, "key", "openai", {}, "n1")
        self.assertEqual(result["text"], "hi")
        # telemetry should have recorded reported cost
        self.assertAlmostEqual(executor._node_telemetry["n1"]["estimated_cost_usd"], 0.0123, places=4)

    def test_agent_task_base_url_paths(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        cfg = AgentTaskConfig(
            objective="test",
            model="gpt-4o",
            api_key_ref="platform",
            max_iterations=1,
            requires_approval=False,
            scope_access="read",
            retry=RetryConfig(1, "none", 0.0, False),
            input_schema=None,
            output_schema=None,
            approval_timeout_hours=24.0,
            tools=[],
        )
        # litellm_url
        with patch.dict(os.environ, {"LITELLM_URL": "http://litellm"}, clear=False):
            self.assertEqual(executor._agent_task_base_url(cfg, "openai"), "http://litellm")
        # openrouter + PLATFORM_LLM_BASE_URL
        with patch.dict(os.environ, {"PLATFORM_LLM_BASE_URL": "http://platform"}, clear=False):
            self.assertEqual(executor._agent_task_base_url(cfg, "openrouter"), "http://platform")
        # groq
        self.assertEqual(executor._agent_task_base_url(cfg, "groq"), "https://api.groq.com/openai/v1")
        # google
        self.assertEqual(
            executor._agent_task_base_url(cfg, "google"), "https://generativelanguage.googleapis.com/v1beta/openai"
        )
        # model with "/"
        cfg2 = AgentTaskConfig(
            objective="test",
            model="provider/model",
            api_key_ref="platform",
            max_iterations=1,
            requires_approval=False,
            scope_access="read",
            retry=RetryConfig(1, "none", 0.0, False),
            input_schema=None,
            output_schema=None,
            approval_timeout_hours=24.0,
            tools=[],
        )
        self.assertEqual(executor._agent_task_base_url(cfg2.model, "unknown"), "https://openrouter.ai/api/v1")


# ─────────────────────────────────────────────────────────────
# 8. Connection execution paths
# ─────────────────────────────────────────────────────────────


class TestConnectionExecutionPaths(unittest.IsolatedAsyncioTestCase):
    async def test_oauth_without_operation_returns_connection_id(self) -> None:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {
                    "id": "c",
                    "type": "connection",
                    "config": {"connector_type": "oauth", "scope_access": "read", "scope_required": []},
                    "connection": "gmail:primary",
                },
            ],
            [{"id": "e1", "from": "t", "to": "c", "type": "data_flow"}],
        )
        executor = _make_executor(schema, connection_name_to_id={"gmail:primary": "conn-1"})
        with (
            patch.object(executor, "_provider_for_connection", Mock(return_value="gmail")),
            patch.object(executor, "_fetch_oauth_token", AsyncMock(return_value="token")),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
        ):
            result = await executor._execute_connection(executor.node_map["c"], {})
        self.assertEqual(result["connection_id"], "conn-1")

    async def test_oauth_circuit_open(self) -> None:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {
                    "id": "c",
                    "type": "connection",
                    "config": {
                        "connector_type": "oauth",
                        "scope_access": "read",
                        "scope_required": [],
                        "operation": "send",
                    },
                    "connection": "gmail:primary",
                },
            ],
            [{"id": "e1", "from": "t", "to": "c", "type": "data_flow"}],
        )
        executor = _make_executor(schema, connection_name_to_id={"gmail:primary": "conn-1"})
        from engine.circuit_breaker import CircuitOpenError

        with (
            patch.object(executor, "_provider_for_connection", Mock(return_value="gmail")),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch("engine.executor.get_oauth_token_circuit") as mock_circuit,
        ):
            mock_circuit.return_value.call = AsyncMock(side_effect=CircuitOpenError("open"))
            with self.assertRaises(ExecutionError) as ctx:
                await executor._execute_connection(executor.node_map["c"], {})
        self.assertEqual(ctx.exception.code, "OAUTH_CIRCUIT_OPEN")

    async def test_http_connection_oauth_handoff(self) -> None:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {
                    "id": "c",
                    "type": "connection",
                    "config": {
                        "connector_type": "http",
                        "method": "GET",
                        "url": "https://api.notion.com/v1/users",
                        "auth_type": "bearer",
                        "auth_value": "__OAUTH_CONNECTION__",
                    },
                    "connection": "notion",
                },
            ],
            [{"id": "e1", "from": "t", "to": "c", "type": "data_flow"}],
        )
        executor = _make_executor(schema, connection_name_to_id={"notion": "conn-1"})
        http_resp = Mock()
        http_resp.status_code = 200
        http_resp.text = "{}"
        http_resp.json.return_value = {}
        http_resp.headers = {}
        http_resp.request = Mock(url="https://api.notion.com/v1/users")
        with (
            patch.object(executor, "_resolve_http_oauth_token", AsyncMock(return_value="tok")),
            patch("httpx.AsyncClient") as mock_client,
        ):
            instance = Mock()
            instance.request = AsyncMock(return_value=http_resp)
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=None)
            mock_client.return_value = instance
            result = await executor._execute_connection(executor.node_map["c"], {})
        self.assertEqual(result["status_code"], 200)

    async def test_http_connection_missing_bearer_auth_value(self) -> None:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {
                    "id": "c",
                    "type": "connection",
                    "config": {
                        "connector_type": "http",
                        "method": "GET",
                        "url": "https://example.com",
                        "auth_type": "bearer",
                        "auth_value": "",
                    },
                },
            ],
            [{"id": "e1", "from": "t", "to": "c", "type": "data_flow"}],
        )
        executor = _make_executor(schema)
        with self.assertRaises(ExecutionError) as ctx:
            await executor._execute_connection(executor.node_map["c"], {})
        self.assertEqual(ctx.exception.code, "HTTP_CONFIG_INVALID")

    async def test_http_connection_basic_auth_missing_colon(self) -> None:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {
                    "id": "c",
                    "type": "connection",
                    "config": {
                        "connector_type": "http",
                        "method": "GET",
                        "url": "https://example.com",
                        "auth_type": "basic",
                        "auth_value": "badvalue",
                    },
                },
            ],
            [{"id": "e1", "from": "t", "to": "c", "type": "data_flow"}],
        )
        executor = _make_executor(schema)
        with self.assertRaises(ExecutionError) as ctx:
            await executor._execute_connection(executor.node_map["c"], {})
        self.assertEqual(ctx.exception.code, "HTTP_CONFIG_INVALID")

    async def test_http_connection_body_parsing_json_vs_raw(self) -> None:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {
                    "id": "c",
                    "type": "connection",
                    "config": {
                        "connector_type": "http",
                        "method": "POST",
                        "url": "https://example.com",
                        "auth_type": "none",
                        "body": '{"key": "val"}',
                    },
                },
            ],
            [{"id": "e1", "from": "t", "to": "c", "type": "data_flow"}],
        )
        executor = _make_executor(schema)
        http_resp = Mock()
        http_resp.status_code = 200
        http_resp.text = "ok"
        http_resp.json.return_value = {"ok": True}
        http_resp.headers = {}
        http_resp.request = Mock(url="https://example.com")
        with patch("httpx.AsyncClient") as mock_client:
            instance = Mock()
            instance.request = AsyncMock(return_value=http_resp)
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=None)
            mock_client.return_value = instance
            result = await executor._execute_connection(executor.node_map["c"], {})
        self.assertEqual(result["status_code"], 200)

    async def test_resolve_http_oauth_token_missing_linked_connection(self) -> None:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {
                    "id": "c",
                    "type": "connection",
                    "config": {
                        "connector_type": "http",
                        "method": "GET",
                        "url": "https://api.notion.com/v1/users",
                        "auth_type": "bearer",
                        "auth_value": "__OAUTH_CONNECTION__",
                    },
                },
            ],
            [{"id": "e1", "from": "t", "to": "c", "type": "data_flow"}],
        )
        executor = _make_executor(schema)
        with self.assertRaises(ExecutionError) as ctx:
            await executor._resolve_http_oauth_token(executor.node_map["c"], {}, "https://api.notion.com/v1/users")
        self.assertEqual(ctx.exception.code, "HTTP_CONFIG_INVALID")

    async def test_resolve_http_oauth_token_invalid_hostname(self) -> None:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {
                    "id": "c",
                    "type": "connection",
                    "config": {
                        "connector_type": "http",
                        "method": "GET",
                        "url": "https://evil.com",
                        "auth_type": "bearer",
                        "auth_value": "__OAUTH_CONNECTION__",
                    },
                    "connection": "gmail:primary",
                },
            ],
            [{"id": "e1", "from": "t", "to": "c", "type": "data_flow"}],
        )
        executor = _make_executor(schema, connection_name_to_id={"gmail:primary": "conn-1"})
        with (
            patch.object(executor, "_provider_for_connection", Mock(return_value="gmail")),
            patch.object(executor, "_fetch_oauth_token", AsyncMock(return_value="tok")),
        ):
            with self.assertRaises(ExecutionError) as ctx:
                await executor._resolve_http_oauth_token(executor.node_map["c"], {}, "https://evil.com")
        self.assertEqual(ctx.exception.code, "HTTP_OAUTH_TARGET_INVALID")

    async def test_connector_returns_non_dict(self) -> None:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {
                    "id": "c",
                    "type": "connection",
                    "config": {
                        "connector_type": "oauth",
                        "scope_access": "write",
                        "scope_required": [],
                        "operation": "send",
                    },
                    "connection": "gmail:primary",
                },
            ],
            [{"id": "e1", "from": "t", "to": "c", "type": "data_flow"}],
        )
        executor = _make_executor(schema, connection_name_to_id={"gmail:primary": "conn-1"})
        mock_connector = Mock()
        mock_connector.execute = AsyncMock(return_value="not-a-dict")
        with (
            patch.object(executor, "_provider_for_connection", Mock(return_value="gmail")),
            patch.object(executor, "_fetch_oauth_token", AsyncMock(return_value="tok")),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch("engine.executor.get_connector", return_value=mock_connector),
        ):
            with self.assertRaises(ExecutionError) as ctx:
                await executor._execute_connection(executor.node_map["c"], {})
        self.assertEqual(ctx.exception.code, "CONNECTOR_OUTPUT_INVALID")

    async def test_connector_returns_reserved_keys(self) -> None:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {
                    "id": "c",
                    "type": "connection",
                    "config": {
                        "connector_type": "oauth",
                        "scope_access": "write",
                        "scope_required": [],
                        "operation": "send",
                    },
                    "connection": "gmail:primary",
                },
            ],
            [{"id": "e1", "from": "t", "to": "c", "type": "data_flow"}],
        )
        executor = _make_executor(schema, connection_name_to_id={"gmail:primary": "conn-1"})
        mock_connector = Mock()
        mock_connector.execute = AsyncMock(return_value={"__skipped__": True})
        with (
            patch.object(executor, "_provider_for_connection", Mock(return_value="gmail")),
            patch.object(executor, "_fetch_oauth_token", AsyncMock(return_value="tok")),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch("engine.executor.get_connector", return_value=mock_connector),
        ):
            with self.assertRaises(ExecutionError) as ctx:
                await executor._execute_connection(executor.node_map["c"], {})
        self.assertEqual(ctx.exception.code, "CONNECTOR_OUTPUT_INVALID")

    async def test_execute_connection_http_retry(self) -> None:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {
                    "id": "c",
                    "type": "connection",
                    "config": {
                        "connector_type": "http",
                        "method": "GET",
                        "url": "https://example.com",
                        "auth_type": "none",
                        "retry": {
                            "max_attempts": 2,
                            "backoff": "none",
                            "backoff_base_seconds": 0,
                            "fail_program_on_exhaust": False,
                        },
                    },
                },
            ],
            [{"id": "e1", "from": "t", "to": "c", "type": "data_flow"}],
        )
        executor = _make_executor(schema)
        http_resp = Mock()
        http_resp.status_code = 200
        http_resp.text = "ok"
        http_resp.json.return_value = {}
        http_resp.headers = {}
        http_resp.request = Mock(url="https://example.com")
        with patch("httpx.AsyncClient") as mock_client:
            instance = Mock()
            instance.request = AsyncMock(return_value=http_resp)
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=None)
            mock_client.return_value = instance
            result = await executor._execute_connection(executor.node_map["c"], {})
        self.assertEqual(result["status_code"], 200)


# ─────────────────────────────────────────────────────────────
# 9. Step execution error paths
# ─────────────────────────────────────────────────────────────


class TestStepExecutionErrorPaths(unittest.IsolatedAsyncioTestCase):
    async def test_format_key_error(self) -> None:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {
                    "id": "s",
                    "type": "step",
                    "config": {"logic_type": "format", "template": "{missing}", "output_key": "text"},
                },
            ],
            [{"id": "e1", "from": "t", "to": "s", "type": "data_flow"}],
        )
        executor = _make_executor(schema)
        with self.assertRaises(ExecutionError) as ctx:
            await executor._execute_step(executor.node_map["s"], {})
        self.assertEqual(ctx.exception.code, "FORMAT_KEY_MISSING")

    async def test_format_value_error(self) -> None:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {
                    "id": "s",
                    "type": "step",
                    "config": {"logic_type": "format", "template": "{:{}}", "output_key": "text"},
                },
            ],
            [{"id": "e1", "from": "t", "to": "s", "type": "data_flow"}],
        )
        executor = _make_executor(schema)
        with self.assertRaises(ExecutionError) as ctx:
            await executor._execute_step(executor.node_map["s"], {})
        self.assertEqual(ctx.exception.code, "FORMAT_ERROR")

    async def test_parse_json_exception(self) -> None:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {
                    "id": "s",
                    "type": "step",
                    "config": {"logic_type": "parse", "extra": {"format": "json", "input_key": "text"}},
                },
            ],
            [{"id": "e1", "from": "t", "to": "s", "type": "data_flow"}],
        )
        executor = _make_executor(schema)
        with self.assertRaises(ExecutionError) as ctx:
            await executor._execute_step(executor.node_map["s"], {"text": "not json"})
        self.assertEqual(ctx.exception.code, "PARSE_JSON_FAILED")

    async def test_parse_csv_exception(self) -> None:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {"id": "s", "type": "step", "config": {"logic_type": "parse", "format": "csv", "input_key": "text"}},
            ],
            [{"id": "e1", "from": "t", "to": "s", "type": "data_flow"}],
        )
        executor = _make_executor(schema)
        import csv

        with patch.object(csv, "DictReader", side_effect=Exception("bad csv")):
            with self.assertRaises(ExecutionError) as ctx:
                await executor._execute_step(executor.node_map["s"], {"text": "a,b"})
        self.assertEqual(ctx.exception.code, "PARSE_CSV_FAILED")

    async def test_sort_type_error(self) -> None:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {"id": "s", "type": "step", "config": {"logic_type": "sort", "extra": {"key": "val"}}},
            ],
            [{"id": "e1", "from": "t", "to": "s", "type": "data_flow"}],
        )
        executor = _make_executor(schema)
        with self.assertRaises(ExecutionError) as ctx:
            await executor._execute_step(executor.node_map["s"], {"items": [{"val": 1}, {"val": "a"}]})
        self.assertEqual(ctx.exception.code, "SORT_TYPE_ERROR")

    async def test_loop_non_list_items_with_iter(self) -> None:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {
                    "id": "s",
                    "type": "step",
                    "config": {"logic_type": "loop", "over": "input.items", "item_var": "item"},
                },
            ],
            [{"id": "e1", "from": "t", "to": "s", "type": "data_flow"}],
        )
        executor = _make_executor(schema)
        result = await executor._execute_step(executor.node_map["s"], {"items": (1, 2, 3)})
        self.assertEqual(result["items"], [1, 2, 3])

    async def test_loop_non_list_items_without_iter(self) -> None:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {"id": "s", "type": "step", "config": {"logic_type": "loop", "over": "input.val", "item_var": "item"}},
            ],
            [{"id": "e1", "from": "t", "to": "s", "type": "data_flow"}],
        )
        executor = _make_executor(schema)
        result = await executor._execute_step(executor.node_map["s"], {"val": 42})
        self.assertEqual(result["items"], [42])


# ─────────────────────────────────────────────────────────────
# 10. Retry paths
# ─────────────────────────────────────────────────────────────


class TestRetryPaths(unittest.IsolatedAsyncioTestCase):
    async def test_with_retry_non_fatal_exhaustion(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        retry_cfg = RetryConfig(2, "none", 0.0, False)
        call_count = 0

        async def _fail():
            nonlocal call_count
            call_count += 1
            raise RuntimeError("boom")

        with patch("engine.executor.update_node_execution", new=AsyncMock()):
            result = await executor._with_retry(_fail, retry_cfg, "t")
        self.assertEqual(result, {NODE_ERROR_KEY: "[Retries exhausted - continuing run] boom"})
        self.assertEqual(call_count, 2)

    async def test_with_retry_client_error_no_retry(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        retry_cfg = RetryConfig(3, "none", 0.0, True)
        call_count = 0

        async def _client_error():
            nonlocal call_count
            call_count += 1
            raise RuntimeError("LLM API error 404 from provider")

        with patch("engine.executor.update_node_execution", new=AsyncMock()):
            with self.assertRaises(ExecutionError) as ctx:
                await executor._with_retry(_client_error, retry_cfg, "t")
        self.assertEqual(ctx.exception.code, "MAX_RETRIES_EXHAUSTED")
        self.assertEqual(call_count, 1)

    async def test_with_retry_run_limit_exceeded_surfaces(self) -> None:
        from engine.run_limits import RunLimitExceeded

        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        retry_cfg = RetryConfig(3, "none", 0.0, True)

        async def _limit():
            raise RunLimitExceeded("limit")

        with self.assertRaises(RunLimitExceeded):
            await executor._with_retry(_limit, retry_cfg, "t")


# ─────────────────────────────────────────────────────────────
# 11. Auth / Token / Credit paths
# ─────────────────────────────────────────────────────────────


class TestAuthTokenCreditPaths(unittest.IsolatedAsyncioTestCase):
    async def test_fetch_api_key_platform_key_missing(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(ExecutionError) as ctx:
                await executor._fetch_api_key("platform")
        self.assertEqual(ctx.exception.code, "PLATFORM_KEY_MISSING")

    async def test_fetch_api_key_user_assigned_sentinel_uses_platform(self) -> None:
        # An unresolved "__USER_ASSIGNED__" placeholder must resolve to the shared
        # platform key, never hit the vault (which would 404).
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        with patch.dict(os.environ, {"PLATFORM_LLM_API_KEY": "platform-secret"}, clear=False):
            with patch("httpx.AsyncClient") as mock_client:
                key, provider = await executor._fetch_api_key("__USER_ASSIGNED__")
                mock_client.assert_not_called()
        self.assertEqual(key, "platform-secret")
        self.assertEqual(provider, "openrouter")

    async def test_fetch_api_key_vault_non_json(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        resp = Mock()
        resp.is_success = True
        resp.json = Mock(side_effect=Exception("bad json"))
        resp.text = "html"
        with patch("httpx.AsyncClient") as mock_client:
            instance = Mock()
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=None)
            instance.get = AsyncMock(return_value=resp)
            mock_client.return_value = instance
            with self.assertRaises(ExecutionError) as ctx:
                await executor._fetch_api_key("my-key")
        self.assertEqual(ctx.exception.code, "API_KEY_FETCH_FAILED")

    async def test_fetch_api_key_vault_missing_value(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        resp = Mock()
        resp.is_success = True
        resp.json.return_value = {"provider": "openai"}
        with patch("httpx.AsyncClient") as mock_client:
            instance = Mock()
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=None)
            instance.get = AsyncMock(return_value=resp)
            mock_client.return_value = instance
            with self.assertRaises(ExecutionError) as ctx:
                await executor._fetch_api_key("my-key")
        self.assertEqual(ctx.exception.code, "API_KEY_FETCH_FAILED")

    async def test_fetch_api_key_fallback_on_404_with_path_segment(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        resp1 = Mock()
        resp1.is_success = False
        resp1.status_code = 404
        resp1.json.return_value = {}
        resp1.text = "not found"
        resp2 = Mock()
        resp2.is_success = True
        resp2.json.return_value = {"value": "secret", "provider": "openai"}
        with (
            patch.dict(os.environ, {"NEXTJS_INTERNAL_URL": "http://app.com/browse"}, clear=False),
            patch("httpx.AsyncClient") as mock_client,
        ):
            instance = Mock()
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=None)
            instance.get = AsyncMock(side_effect=[resp1, resp2])
            mock_client.return_value = instance
            key, provider = await executor._fetch_api_key("my-key")
        self.assertEqual(key, "secret")
        self.assertEqual(provider, "openai")

    async def test_fetch_oauth_token_force_refresh_and_cached(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        from engine.credential_lock import get_token_refresh_manager

        mgr = get_token_refresh_manager()
        mgr.invalidate_cache("conn-1")

        # Patch CredentialLock to avoid real DB calls
        class DummyLock:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                pass

        with (
            patch("engine.credential_lock.CredentialLock", DummyLock),
            patch.object(executor, "_do_fetch_oauth_token", new=AsyncMock(return_value="forced")) as mock_do,
        ):
            token = await executor._fetch_oauth_token("conn-1", force_refresh=True)
        self.assertEqual(token, "forced")
        mock_do.assert_awaited_once()

    async def test_fetch_oauth_token_cached_token(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        from engine.credential_lock import get_token_refresh_manager

        mgr = get_token_refresh_manager()
        mgr.cache_token("conn-2", "cached", expires_in=3600)
        with patch.object(executor, "_do_fetch_oauth_token", new=AsyncMock()) as mock_do:
            token = await executor._fetch_oauth_token("conn-2")
        self.assertEqual(token, "cached")
        mock_do.assert_not_awaited()
        mgr.invalidate_cache("conn-2")

    async def test_do_fetch_oauth_token_non_json_response(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        resp = Mock()
        resp.is_success = True
        resp.json = Mock(side_effect=Exception("bad"))
        resp.text = "html"
        with patch("httpx.AsyncClient") as mock_client:
            instance = Mock()
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=None)
            instance.get = AsyncMock(return_value=resp)
            mock_client.return_value = instance
            with self.assertRaises(ExecutionError) as ctx:
                await executor._do_fetch_oauth_token("conn-1")
        self.assertEqual(ctx.exception.code, "OAUTH_TOKEN_FAILED")

    async def test_do_fetch_oauth_token_missing_access_token(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        resp = Mock()
        resp.is_success = True
        resp.json.return_value = {"token_type": "bearer"}
        with patch("httpx.AsyncClient") as mock_client:
            instance = Mock()
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=None)
            instance.get = AsyncMock(return_value=resp)
            mock_client.return_value = instance
            with self.assertRaises(ExecutionError) as ctx:
                await executor._do_fetch_oauth_token("conn-1")
        self.assertEqual(ctx.exception.code, "OAUTH_TOKEN_FAILED")

    async def test_check_platform_credits_insufficient(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        resp = Mock()
        resp.is_success = True
        resp.json.return_value = {"total": 0}
        with patch("httpx.AsyncClient") as mock_client:
            instance = Mock()
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=None)
            instance.get = AsyncMock(return_value=resp)
            mock_client.return_value = instance
            with self.assertRaises(ExecutionError) as ctx:
                await executor._check_platform_credits()
        self.assertEqual(ctx.exception.code, "INSUFFICIENT_CREDITS")

    async def test_deduct_platform_credits_best_effort_silence(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        with patch("httpx.AsyncClient") as mock_client:
            instance = Mock()
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=None)
            instance.post = AsyncMock(side_effect=Exception("network"))
            mock_client.return_value = instance
            # Should not raise
            await executor._deduct_platform_credits(100)

    async def test_resolve_connection_id_provider_alias_fallback(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        executor.db.table("connections").select().eq().eq().limit().execute.return_value = Mock(data=[])
        executor.db.table("program_connections").select().eq().execute.return_value = Mock(data=[])
        executor.db.table("connections").select().eq().eq().limit().execute.return_value = Mock(
            data=[{"id": "conn-gmail-1"}]
        )
        conn_id = executor._resolve_connection_id("gmail:primary")
        self.assertEqual(conn_id, "conn-gmail-1")

    async def test_provider_for_connection_not_found(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        executor.db.table("connections").select().eq().single().execute.return_value = Mock(data=None)
        with self.assertRaises(ExecutionError) as ctx:
            executor._provider_for_connection("conn-missing")
        self.assertEqual(ctx.exception.code, "CONNECTION_NOT_FOUND")


# ─────────────────────────────────────────────────────────────
# 12. Telemetry
# ─────────────────────────────────────────────────────────────


class TestTelemetry(unittest.TestCase):
    def test_node_telemetry_payload_total_tokens_zero(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = ProgramExecutor(schema, "r1", "p1", "u1")
        executor._record_telemetry("t", prompt_tokens=5, completion_tokens=3, total_tokens=0)
        payload = executor._node_telemetry_payload("t")
        self.assertEqual(payload["total_tokens"], 8)

    def test_record_telemetry_negative_values(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = ProgramExecutor(schema, "r1", "p1", "u1")
        executor._record_telemetry(
            "t", prompt_tokens=-5, completion_tokens=-3, total_tokens=-10, estimated_cost_usd=-0.5
        )
        payload = executor._node_telemetry_payload("t")
        self.assertEqual(payload["prompt_tokens"], 0)
        self.assertEqual(payload["completion_tokens"], 0)
        self.assertEqual(payload["total_tokens"], 0)
        self.assertEqual(payload["estimated_cost_usd"], 0.0)

    def test_run_telemetry_payload(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = ProgramExecutor(schema, "r1", "p1", "u1")
        executor._record_telemetry(
            "t",
            prompt_tokens=10,
            completion_tokens=5,
            total_tokens=15,
            estimated_cost_usd=0.001,
            connector_api_calls=2,
            model_call_count=1,
        )
        payload = executor.run_telemetry_payload()
        self.assertEqual(payload["prompt_tokens"], 10)
        self.assertEqual(payload["completion_tokens"], 5)
        self.assertEqual(payload["total_tokens"], 15)
        self.assertEqual(payload["estimated_cost_usd"], 0.001)
        self.assertEqual(payload["connector_api_calls"], 2)
        self.assertEqual(payload["model_call_count"], 1)


# ─────────────────────────────────────────────────────────────
# 13. Compliance
# ─────────────────────────────────────────────────────────────


class TestCompliance(unittest.IsolatedAsyncioTestCase):
    async def test_enforce_provider_policy_blocking_path(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = ProgramExecutor(schema, "r1", "p1", "u1", compliance_mode="eu_only")
        with (
            patch("engine.executor.get_provider") as mock_provider,
            patch("engine.executor.update_node_execution", new=AsyncMock()),
        ):
            mock_provider.return_value = SimpleNamespace(
                id="openrouter",
                name="OpenRouter",
                eu_only_supported=False,
                dpa_available=False,
                scc_available=False,
                status="blocked",
            )
            with self.assertRaises(ExecutionError) as ctx:
                await executor._enforce_provider_policy("openrouter", "t", model_id="gpt-4o")
        self.assertEqual(ctx.exception.code, "COMPLIANCE_BLOCKED")


# ─────────────────────────────────────────────────────────────
# 15. Failed-open visibility + loop aggregation status
# ─────────────────────────────────────────────────────────────


def _loop_schema() -> ProgramSchema:
    return _simple_schema(
        [
            {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
            {
                "id": "l",
                "type": "step",
                "config": {"logic_type": "loop", "extra": {"over": "items", "item_var": "item"}},
            },
            {"id": "s", "type": "step", "config": {"logic_type": "transform", "extra": {"transformation": "item"}}},
        ],
        [
            {"id": "e1", "from": "t", "to": "l", "type": "data_flow"},
            {"id": "e2", "from": "l", "to": "s", "type": "data_flow"},
        ],
    )


def _updates_for_node(update_mock: AsyncMock, node_id: str) -> list[dict]:
    return [c.kwargs for c in update_mock.call_args_list if c.args[2] == node_id]


class TestFailedOpenVisibility(unittest.IsolatedAsyncioTestCase):
    async def test_loop_aggregate_keeps_all_iteration_failures(self) -> None:
        """A body node that failed open in every iteration must end 'failed'."""
        executor = _make_executor(_loop_schema())
        tagged = {NODE_ERROR_KEY: "[Retries exhausted - continuing run] quota"}
        update_mock = AsyncMock()
        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.update_node_execution", new=update_mock),
            patch.object(executor, "_execute_node", new=AsyncMock(return_value=dict(tagged))),
        ):
            state: dict = {"l": {}}
            await executor._execute_loop_body("l", {"__loop_items__": [1, 2], "item_var": "item"}, state)
        final = _updates_for_node(update_mock, "s")[-1]
        self.assertEqual(final["status"], "failed")
        self.assertIn("Failed in all 2 executed loop iterations", final["error_message"])
        self.assertIn("quota", final["error_message"])
        self.assertEqual(state["s"]["count"], 2)

    async def test_loop_aggregate_partial_failures_stay_completed_with_error(self) -> None:
        executor = _make_executor(_loop_schema())
        outputs = [
            {NODE_ERROR_KEY: "[Retries exhausted - continuing run] blip"},
            {"ok": True},
        ]
        update_mock = AsyncMock()
        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.update_node_execution", new=update_mock),
            patch.object(executor, "_execute_node", new=AsyncMock(side_effect=outputs)),
        ):
            await executor._execute_loop_body("l", {"__loop_items__": [1, 2], "item_var": "item"}, {"l": {}})
        final = _updates_for_node(update_mock, "s")[-1]
        self.assertEqual(final["status"], "completed")
        self.assertIn("Failed in 1 of 2 executed loop iterations", final["error_message"])

    async def test_loop_aggregate_marks_never_ran_nodes_skipped(self) -> None:
        """Empty loop: body nodes must end 'skipped', not 'completed' at 0ms."""
        executor = _make_executor(_loop_schema())
        update_mock = AsyncMock()
        with (
            patch("engine.executor.update_node_execution", new=update_mock),
            patch.object(executor, "_execute_node", new=AsyncMock()) as exec_mock,
        ):
            await executor._execute_loop_body("l", {"__loop_items__": [], "item_var": "item"}, {"l": {}})
        exec_mock.assert_not_awaited()
        final = _updates_for_node(update_mock, "s")[-1]
        self.assertEqual(final["status"], "skipped")
        self.assertIsNone(final["error_message"])
        self.assertNotIn("started_at", final)

    async def test_loop_aggregate_clean_iterations_clear_stale_errors(self) -> None:
        executor = _make_executor(_loop_schema())
        update_mock = AsyncMock()
        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.update_node_execution", new=update_mock),
            patch.object(executor, "_execute_node", new=AsyncMock(return_value={"ok": True})),
        ):
            await executor._execute_loop_body("l", {"__loop_items__": [1], "item_var": "item"}, {"l": {}})
        final = _updates_for_node(update_mock, "s")[-1]
        self.assertEqual(final["status"], "completed")
        self.assertIsNone(final["error_message"])

    async def test_execute_node_keeps_failed_open_agent_failed(self) -> None:
        """The generic completion write must not flip a failed-open agent to completed."""
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {
                    "id": "a",
                    "type": "agent",
                    "config": {
                        "model": "gpt-4o",
                        "api_key_ref": "platform",
                        "system_prompt": "",
                        "requires_approval": False,
                        "scope_access": "read",
                        "retry": {
                            "max_attempts": 1,
                            "backoff": "none",
                            "backoff_base_seconds": 0,
                            "fail_program_on_exhaust": False,
                        },
                    },
                },
            ],
            [{"id": "e1", "from": "t", "to": "a", "type": "data_flow"}],
        )
        executor = _make_executor(schema)
        tagged = {NODE_ERROR_KEY: "[Retries exhausted - continuing run] boom"}
        update_mock = AsyncMock()
        with (
            patch("engine.executor.update_node_execution", new=update_mock),
            patch.object(executor, "_execute_agent", new=AsyncMock(return_value=dict(tagged))),
        ):
            output = await executor._execute_node(executor.node_map["a"], {"x": 1})
        self.assertEqual(output, tagged)
        final = _updates_for_node(update_mock, "a")[-1]
        self.assertEqual(final["status"], "failed")
        self.assertEqual(final["error_message"], tagged[NODE_ERROR_KEY])

    async def test_execute_node_success_still_completes_and_clears_error(self) -> None:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {"id": "s", "type": "step", "config": {"logic_type": "transform", "transformation": "data['x']"}},
            ],
            [{"id": "e1", "from": "t", "to": "s", "type": "data_flow"}],
        )
        executor = _make_executor(schema)
        update_mock = AsyncMock()
        with patch("engine.executor.update_node_execution", new=update_mock):
            await executor._execute_node(executor.node_map["s"], {"x": 41})
        final = _updates_for_node(update_mock, "s")[-1]
        self.assertEqual(final["status"], "completed")
        self.assertIsNone(final["error_message"])


class TestOpenAiReasoningModelParams(unittest.IsolatedAsyncioTestCase):
    def _agent_cfg(self, model: str) -> AgentConfig:
        schema = _simple_schema(
            [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {
                    "id": "a",
                    "type": "agent",
                    "config": {
                        "model": model,
                        "api_key_ref": "my-key",
                        "system_prompt": "judge",
                        "requires_approval": False,
                        "scope_access": "read",
                        "retry": {
                            "max_attempts": 1,
                            "backoff": "none",
                            "backoff_base_seconds": 0,
                            "fail_program_on_exhaust": False,
                        },
                    },
                },
            ],
            [{"id": "e1", "from": "t", "to": "a", "type": "data_flow"}],
        )
        self.executor = _make_executor(schema)
        return self.executor.node_map["a"].config

    def _chat_response(self) -> Mock:
        resp = Mock()
        resp.is_success = True
        resp.json.return_value = {
            "choices": [{"message": {"content": '{"ok": true}'}}],
            "usage": {"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5},
        }
        return resp

    async def _captured_call_llm_body(self, model: str, provider: str) -> tuple[str, dict]:
        cfg = self._agent_cfg(model)
        with (
            patch.dict(os.environ),
            patch("engine.executor._get_llm_client") as mock_client,
            patch("engine.executor.update_node_execution", new=AsyncMock()),
        ):
            os.environ.pop("LITELLM_URL", None)
            os.environ.pop("PLATFORM_LLM_BASE_URL", None)
            mock_client.return_value.post = AsyncMock(return_value=self._chat_response())
            await self.executor._call_llm(cfg, "sk-test", provider, {"x": 1}, "a")
            call = mock_client.return_value.post.call_args
        return call.args[0], call.kwargs["json"]

    async def test_call_llm_openai_direct_uses_max_completion_tokens(self) -> None:
        url, body = await self._captured_call_llm_body("o3-mini", "openai")
        self.assertIn("api.openai.com", url)
        self.assertEqual(body["max_completion_tokens"], 4096)
        self.assertNotIn("max_tokens", body)

    async def test_call_llm_openrouter_keeps_max_tokens(self) -> None:
        url, body = await self._captured_call_llm_body("openai/o3-mini", "openrouter")
        self.assertIn("openrouter.ai", url)
        self.assertEqual(body["max_tokens"], 4096)
        self.assertNotIn("max_completion_tokens", body)

    async def _captured_agent_loop_body(self, model: str) -> dict:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        cfg = AgentTaskConfig(
            objective="test",
            model=model,
            api_key_ref="my-key",
            max_iterations=1,
            requires_approval=False,
            scope_access="read",
            retry=RetryConfig(1, "none", 0.0, False),
            input_schema=None,
            output_schema=None,
            approval_timeout_hours=24.0,
            tools=[],
        )
        with (
            patch.dict(os.environ),
            patch("engine.executor._get_llm_client") as mock_client,
            patch("engine.executor.update_node_execution", new=AsyncMock()),
        ):
            os.environ.pop("LITELLM_URL", None)
            os.environ.pop("PLATFORM_LLM_BASE_URL", None)
            mock_client.return_value.post = AsyncMock(return_value=self._chat_response())
            await executor._agent_loop_openai(cfg, "sk-test", "openai", "node-1", "sys", "input", [], 1, model)
            call = mock_client.return_value.post.call_args
        return call.kwargs["json"]

    async def test_agent_loop_openai_reasoning_model_drops_temperature(self) -> None:
        body = await self._captured_agent_loop_body("o3-mini")
        self.assertEqual(body["max_completion_tokens"], 2048)
        self.assertNotIn("max_tokens", body)
        self.assertNotIn("temperature", body)

    async def test_agent_loop_openai_non_reasoning_model_keeps_temperature(self) -> None:
        body = await self._captured_agent_loop_body("gpt-4o")
        self.assertEqual(body["max_completion_tokens"], 2048)
        self.assertNotIn("max_tokens", body)
        self.assertIn("temperature", body)


if __name__ == "__main__":
    unittest.main()
