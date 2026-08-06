"""Remaining executor tests closing specific coverage gaps in engine/executor.py."""

from __future__ import annotations


import os
import unittest
from typing import Any
from unittest.mock import AsyncMock, Mock, patch

from schema import (
    AgentConfig,
    ProgramSchema,
    RetryConfig,
    SchemaNode,
    StepConfig,
    parse_schema,
)
from engine.executor import (
    NODE_ERROR_KEY,
    ConflictError,
    ExecutionError,
    ProgramExecutor,
    run_agent,
)
from engine.retry import BackoffType, RetryPolicy

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


class TestRunAgent(unittest.IsolatedAsyncioTestCase):
    async def test_claude_path(self) -> None:
        with (
            patch("engine.executor.ChatAnthropic") as mock_claude,
            patch("engine.executor.StateGraph") as mock_graph_cls,
        ):
            mock_llm = Mock()
            mock_llm.invoke.return_value = Mock(content="claude result")
            mock_claude.return_value = mock_llm
            compiled = Mock()
            compiled.ainvoke = AsyncMock(return_value={"output": "claude result"})
            mock_graph = Mock()
            mock_graph.compile.return_value = compiled
            mock_graph_cls.return_value = mock_graph
            result = await run_agent(
                {"model": "claude", "prompt": "hi"},
                {"key": "val"},
                "test-api-key",
            )
            self.assertEqual(result, {"output": "claude result"})
            mock_claude.assert_called_once()

    async def test_openai_path(self) -> None:
        with patch("engine.executor.ChatOpenAI") as mock_openai, patch("engine.executor.StateGraph") as mock_graph_cls:
            mock_llm = Mock()
            mock_llm.invoke.return_value = Mock(content="openai result")
            mock_openai.return_value = mock_llm
            compiled = Mock()
            compiled.ainvoke = AsyncMock(return_value={"output": "openai result"})
            mock_graph = Mock()
            mock_graph.compile.return_value = compiled
            mock_graph_cls.return_value = mock_graph
            result = await run_agent(
                {"model": "gpt-4", "prompt": "hi"},
                {"key": "val"},
                "test-api-key",
            )
            self.assertEqual(result, {"output": "openai result"})
            mock_openai.assert_called_once()


class TestExecuteNodeCatchAll(unittest.IsolatedAsyncioTestCase):
    """What a node's own exception does depends on fail_program_on_exhaust.

    The default policy is failed-open (see create_retry_policy_for_node), so a
    raising step does NOT abort the run — it returns a NODE_ERROR_KEY-tagged
    output and the graph walker fails the run once the walk finishes. Only an
    exception raised outside the retry executor reaches the catch-all.
    """

    def _executor(self) -> Any:
        return _make_executor(
            _simple_schema(
                [
                    {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                    {"id": "s", "type": "step", "config": {"logic_type": "transform"}},
                ]
            )
        )

    def _policy(self, fail_on_exhaust: bool) -> RetryPolicy:
        # Patched in rather than set on the node: StepConfig has no `retry`
        # field, so a step's retry block lands in `extra` and never reaches
        # create_retry_policy_for_node. One attempt, no backoff, keeps the test
        # instant.
        return RetryPolicy(
            max_attempts=1,
            backoff_type=BackoffType.NONE,
            backoff_base_seconds=0.0,
            fail_program_on_exhaust=fail_on_exhaust,
            timeout_per_attempt_seconds=5.0,
            timeout_total_seconds=5.0,
        )

    async def test_catch_all_wraps_an_exception_raised_outside_the_retry_path(self) -> None:
        executor = self._executor()
        node = executor.node_map["s"]
        with (
            patch(
                "engine.executor.create_retry_policy_for_node",
                return_value=self._policy(False),
            ),
            patch.object(executor, "_execute_step", return_value={"ok": True}),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch(
                "engine.executor.record_node_execution",
                side_effect=ValueError("boom"),
            ),
            self.assertRaises(ExecutionError) as ctx,
        ):
            await executor._execute_node(node, {"a": 1})
        self.assertEqual(ctx.exception.code, "NODE_FAILED")
        self.assertIn("boom", ctx.exception.message)

    async def test_failed_open_returns_the_nodes_real_error(self) -> None:
        # Regression: the dead-letter enqueue on this path raised
        # "'coroutine' object has no attribute 'enqueue'", which replaced the
        # node's actual error as the run's failure message.
        executor = self._executor()
        node = executor.node_map["s"]
        dlq = Mock()
        dlq.enqueue = AsyncMock(return_value="entry-1")
        with (
            patch(
                "engine.executor.create_retry_policy_for_node",
                return_value=self._policy(False),
            ),
            patch.object(executor, "_execute_step", side_effect=ValueError("boom")),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.get_dead_letter_queue", AsyncMock(return_value=dlq)),
        ):
            output = await executor._execute_node(node, {"a": 1})

        self.assertIn("boom", output[NODE_ERROR_KEY])
        self.assertIn("enqueued to DLQ", output[NODE_ERROR_KEY])
        self.assertNotIn("coroutine", output[NODE_ERROR_KEY])
        dlq.enqueue.assert_awaited_once()

    async def test_failed_open_survives_a_dead_letter_write_failure(self) -> None:
        executor = self._executor()
        node = executor.node_map["s"]
        dlq = Mock()
        dlq.enqueue = AsyncMock(side_effect=RuntimeError("dlq unreachable"))
        with (
            patch(
                "engine.executor.create_retry_policy_for_node",
                return_value=self._policy(False),
            ),
            patch.object(executor, "_execute_step", side_effect=ValueError("boom")),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.get_dead_letter_queue", AsyncMock(return_value=dlq)),
        ):
            output = await executor._execute_node(node, {"a": 1})

        # The node's own error survives; the DLQ's does not take its place.
        self.assertIn("boom", output[NODE_ERROR_KEY])
        self.assertIn("DLQ enqueue failed", output[NODE_ERROR_KEY])
        self.assertNotIn("dlq unreachable", output[NODE_ERROR_KEY])

    async def test_fail_program_on_exhaust_still_aborts_the_run(self) -> None:
        executor = self._executor()
        node = executor.node_map["s"]
        with (
            patch(
                "engine.executor.create_retry_policy_for_node",
                return_value=self._policy(True),
            ),
            patch.object(executor, "_execute_step", side_effect=ValueError("boom")),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            self.assertRaises(ExecutionError) as ctx,
        ):
            await executor._execute_node(node, {"a": 1})
        self.assertEqual(ctx.exception.code, "MAX_RETRIES_EXHAUSTED")
        self.assertIn("boom", ctx.exception.message)


class TestWithRetryDelayAndSleep(unittest.IsolatedAsyncioTestCase):
    async def test_exponential_delay_calls_sleep(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        retry = RetryConfig(
            max_attempts=3, backoff="exponential", backoff_base_seconds=2.0, fail_program_on_exhaust=False
        )
        call_count = 0

        async def _flaky():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise RuntimeError("fail")
            return {"ok": True}

        with (
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.asyncio.sleep", new=AsyncMock()) as mock_sleep,
        ):
            result = await executor._with_retry(_flaky, retry, "n1")

        self.assertTrue(result.get("ok"))
        self.assertEqual(call_count, 3)
        # attempt 1 delay = 2.0 * 2**0 = 2.0
        # attempt 2 delay = 2.0 * 2**1 = 4.0
        self.assertEqual(mock_sleep.call_count, 2)
        self.assertEqual(mock_sleep.call_args_list[0][0][0], 2.0)
        self.assertEqual(mock_sleep.call_args_list[1][0][0], 4.0)


class TestAcquireOneLockRaceAfterAcquire(unittest.IsolatedAsyncioTestCase):
    async def test_race_with_fail_policy_raises_conflict(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema, conflict_policy="fail")
        with (
            patch("engine.executor.get_existing_lock", new=AsyncMock(return_value=None)),
            patch("engine.executor.acquire_resource_lock", new=AsyncMock(return_value=False)),
            self.assertRaises(ConflictError) as ctx,
        ):
            await executor._acquire_one_lock("connection", "conn-1")
        self.assertEqual(ctx.exception.code, "RESOURCE_CONFLICT")

    async def test_race_with_skip_policy_proceeds(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema, conflict_policy="skip")
        with (
            patch("engine.executor.get_existing_lock", new=AsyncMock(return_value=None)),
            patch("engine.executor.acquire_resource_lock", new=AsyncMock(return_value=False)),
        ):
            await executor._acquire_one_lock("connection", "conn-1")


class TestResolveConnectionIdProviderAliasFallback(unittest.IsolatedAsyncioTestCase):
    async def test_fallback_to_user_provider_connection(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)

        # Build a DB mock where program_connections is empty, but the fallback connections query returns data.
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
        builder.single.return_value = builder

        _table_calls: list[str] = []

        def _table(name):
            _table_calls.append(name)
            return builder

        db.table = Mock(side_effect=_table)

        def _execute():
            if _table_calls[-1] == "program_connections":
                return Mock(data=[])
            # For connections table, differentiate by which eqs were called
            eq_calls = [c for c in builder.method_calls if c[0] == "eq"]
            # Fallback uses eq("provider", ...) then eq("user_id", ...)
            if any(c[1][0] == "user_id" for c in eq_calls):
                return Mock(data=[{"id": "fallback-uuid"}])
            return Mock(data=[])

        builder.execute = Mock(side_effect=_execute)
        executor.db = db

        conn_id = executor._resolve_connection_id("gmail:primary")
        self.assertEqual(conn_id, "fallback-uuid")


class TestNextjsEndpointCandidatesEdgeCases(unittest.TestCase):
    def test_empty_env_var(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        with patch("engine.executor.os.environ.get", return_value=""):
            urls = executor._nextjs_endpoint_candidates("/api/test")
        self.assertTrue(all("http://localhost:3000" in u for u in urls))

    def test_no_colon_slash_slash(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        with patch("engine.executor.os.environ.get", return_value="localhost:3000"):
            urls = executor._nextjs_endpoint_candidates("/api/test")
        self.assertTrue(any("http://localhost:3000" in u for u in urls))


class TestResponseErrorDetailNonDictBody(unittest.TestCase):
    def test_list_body_returns_str_body(self) -> None:
        resp = Mock()
        resp.json.return_value = [1, 2, 3]
        resp.text = "[1, 2, 3]"
        detail = ProgramExecutor._response_error_detail(resp)
        self.assertEqual(detail, "[1, 2, 3]")


class TestExecuteStepDefaultReturn(unittest.IsolatedAsyncioTestCase):
    async def test_unknown_logic_type_returns_input(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        node = SchemaNode(
            id="s",
            type="step",
            label="",
            description="",
            connection=None,
            config=StepConfig(logic_type="unknown", extra={}),
            position={},
            status="idle",
        )
        input_data = {"a": 1}
        result = await executor._execute_step(node, input_data)
        self.assertEqual(result, input_data)


class TestExecuteNodeTriggerPassThrough(unittest.IsolatedAsyncioTestCase):
    async def test_trigger_returns_input_data(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        node = executor.node_map["t"]
        input_data = {"payload": "hello"}
        with patch("engine.executor.update_node_execution", new=AsyncMock()):
            result = await executor._execute_node(node, input_data)
        self.assertEqual(result, input_data)


class TestCallLlmLitellmUrlPath(unittest.IsolatedAsyncioTestCase):
    async def test_litellm_url_used_as_base_url(self) -> None:
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
            "usage": {"prompt_tokens": 5, "completion_tokens": 3},
        }
        with (
            patch("engine.executor._get_llm_client") as mock_client,
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.os.environ.get", return_value="http://litellm-proxy:4000"),
        ):
            post_mock = AsyncMock(return_value=resp)
            mock_client.return_value.post = post_mock
            result = await executor._call_llm(cfg, "key", "openai", {}, "n1")
        self.assertEqual(result["text"], "hi")
        call_url = post_mock.call_args[0][0]
        self.assertTrue(call_url.startswith("http://litellm-proxy:4000"))


class TestCallLlmClaudeAnthropicModelPath(unittest.IsolatedAsyncioTestCase):
    async def test_claude_with_litellm_url(self) -> None:
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
            "choices": [{"message": {"content": "ok"}}],
            "usage": {"prompt_tokens": 5, "completion_tokens": 3},
        }
        with (
            patch("engine.executor._get_llm_client") as mock_client,
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.os.environ.get", return_value="http://litellm"),
        ):
            post_mock = AsyncMock(return_value=resp)
            mock_client.return_value.post = post_mock
            await executor._call_llm(cfg, "key", "anthropic", {}, "n1")
        call_url = post_mock.call_args[0][0]
        self.assertTrue(call_url.startswith("http://litellm"))

    async def test_anthropic_without_litellm_url(self) -> None:
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
            patch("engine.executor.os.environ.get", return_value=None),
        ):
            post_mock = AsyncMock(return_value=resp)
            mock_client.return_value.post = post_mock
            await executor._call_llm(cfg, "key", "anthropic", {}, "n1")
        call_url = post_mock.call_args[0][0]
        self.assertEqual(call_url, "https://api.anthropic.com/v1/messages")


class TestApprovalRealtimeException(unittest.IsolatedAsyncioTestCase):
    async def test_realtime_unavailable_falls_back_to_polling(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        executor.db.channel = Mock(side_effect=Exception("realtime unavailable"))

        # Polling should find an approved row after one check
        poll_builder = Mock()
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
            getattr(poll_builder, method).return_value = poll_builder
        poll_builder.execute.return_value = Mock(data=[{"status": "approved"}])
        executor.db.table = Mock(return_value=poll_builder)

        with (
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.time.time", side_effect=[0.0, 0.0, 86401.0]),
        ):
            approved = await executor._wait_for_approval_decision("exec-1", 3600)
        self.assertTrue(approved)


class TestRequestApprovalAlias(unittest.IsolatedAsyncioTestCase):
    async def test_delegates_to_request_step_approval(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        node = executor.node_map["t"]
        with patch.object(executor, "_request_step_approval", new=AsyncMock(return_value=True)) as mock_req:
            result = await executor._request_approval(node, {"a": 1})
        self.assertTrue(result)
        mock_req.assert_awaited_once_with(node, {"a": 1}, "Approval required")


class TestAcquireProgramLocksEmptyConnections(unittest.IsolatedAsyncioTestCase):
    async def test_empty_connections_no_locks_no_error(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        with patch("engine.executor.acquire_resource_lock", new=AsyncMock()) as mock_lock:
            await executor._acquire_program_locks()
        mock_lock.assert_not_awaited()


class TestProviderForConnectionSingleFailure(unittest.TestCase):
    def test_no_data_raises_connection_not_found(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        with self.assertRaises(ExecutionError) as ctx:
            executor._provider_for_connection("conn-missing")
        self.assertEqual(ctx.exception.code, "CONNECTION_NOT_FOUND")


class TestCallLlmAnthropicBaseUrlButLitellm(unittest.IsolatedAsyncioTestCase):
    async def test_litellm_with_anthropic_provider_uses_openai_path(self) -> None:
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
            "choices": [{"message": {"content": "ok"}}],
            "usage": {"prompt_tokens": 5, "completion_tokens": 3},
        }
        with (
            patch("engine.executor._get_llm_client") as mock_client,
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.os.environ.get", return_value="http://my-litellm.local"),
        ):
            post_mock = AsyncMock(return_value=resp)
            mock_client.return_value.post = post_mock
            await executor._call_llm(cfg, "key", "anthropic", {}, "n1")
        call_url = post_mock.call_args[0][0]
        self.assertTrue("/chat/completions" in call_url)


class TestCallLlmJsonObjectNotSupported(unittest.IsolatedAsyncioTestCase):
    async def test_anthropic_native_no_response_format(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = _make_executor(schema)
        cfg = AgentConfig(
            model="claude-3-haiku",
            api_key_ref="platform",
            system_prompt="Return JSON",
            input_schema=None,
            output_schema={"type": "object"},
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
            "content": [{"type": "text", "text": '{"ok": true}'}],
            "usage": {"input_tokens": 5, "output_tokens": 3},
        }
        with (
            patch("engine.executor._get_llm_client") as mock_client,
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.os.environ.get", return_value=None),
        ):
            post_mock = AsyncMock(return_value=resp)
            mock_client.return_value.post = post_mock
            await executor._call_llm(cfg, "key", "anthropic", {}, "n1")
        call_url = post_mock.call_args[0][0]
        self.assertEqual(call_url, "https://api.anthropic.com/v1/messages")
        call_body = post_mock.call_args[1]["json"]
        self.assertNotIn("response_format", call_body)


if __name__ == "__main__":
    unittest.main()
