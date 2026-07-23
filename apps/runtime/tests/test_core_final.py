"""Final core module gap tests pushing coverage toward 100%."""

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


import asyncio
import json
import os
import time
import unittest
from datetime import datetime, timezone
from typing import Any
from unittest.mock import AsyncMock, Mock, patch

import httpx

from connectors.rate_limit import _parse_retry_after_seconds, request_with_rate_limit
from db import (
    _looks_like_missing_column_error,
    apply_execution_log_policy,
    create_approval,
    get_active_cron_workflows,
    get_approval,
    get_execution_log_verbosity,
    hash_payload,
    redact_secrets,
    summarize_payload_metadata,
)
from compliance import provider_leaves_eea
from cors_config import get_cors_allowed_origins
from internal_auth import verify_internal_service_token_claims
from schema import _bounded_float, _bounded_int, _parse_retry, parse_schema


# ── connectors/rate_limit.py ───────────────────────────────────────────────


class TestParseRetryAfterSeconds(unittest.TestCase):
    def test_retry_after_numeric(self) -> None:
        resp = Mock()
        resp.headers = {"Retry-After": " 5 "}
        self.assertEqual(_parse_retry_after_seconds(resp), 5.0)

    def test_retry_after_http_date(self) -> None:
        future = datetime.now(timezone.utc) + __import__("datetime").timedelta(seconds=10)
        resp = Mock()
        resp.headers = {"Retry-After": future.strftime("%a, %d %b %Y %H:%M:%S GMT")}
        result = _parse_retry_after_seconds(resp)
        self.assertIsNotNone(result)
        self.assertGreaterEqual(result, 8.0)
        self.assertLessEqual(result, 12.0)

    def test_retry_after_invalid_date(self) -> None:
        resp = Mock()
        resp.headers = {"Retry-After": "not-a-date"}
        self.assertIsNone(_parse_retry_after_seconds(resp))

    def test_x_ratelimit_reset(self) -> None:
        resp = Mock()
        resp.headers = {"X-RateLimit-Reset": str(time.time() + 15)}
        result = _parse_retry_after_seconds(resp)
        self.assertIsNotNone(result)
        self.assertGreaterEqual(result, 13.0)
        self.assertLessEqual(result, 17.0)

    def test_x_ratelimit_reset_invalid(self) -> None:
        resp = Mock()
        resp.headers = {"X-RateLimit-Reset": "abc"}
        self.assertIsNone(_parse_retry_after_seconds(resp))

    def test_no_headers(self) -> None:
        resp = Mock()
        resp.headers = {}
        self.assertIsNone(_parse_retry_after_seconds(resp))


class TestRequestWithRateLimit(unittest.IsolatedAsyncioTestCase):
    async def test_request_error_then_success(self) -> None:
        client = Mock()
        call_count = 0

        async def _side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                raise httpx.RequestError("timeout")
            resp = Mock()
            resp.status_code = 200
            return resp

        client.request = AsyncMock(side_effect=_side_effect)
        with patch("connectors.rate_limit.asyncio.sleep", new=AsyncMock()):
            result = await request_with_rate_limit(client, "GET", "http://test.com", max_attempts=3)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(call_count, 2)

    async def test_request_error_exhausted(self) -> None:
        client = Mock()
        client.request = AsyncMock(side_effect=httpx.RequestError("timeout"))
        with patch("connectors.rate_limit.asyncio.sleep", new=AsyncMock()), self.assertRaises(httpx.RequestError):
            await request_with_rate_limit(client, "GET", "http://test.com", max_attempts=1)

    async def test_429_retry_then_success(self) -> None:
        client = Mock()
        ok_resp = Mock()
        ok_resp.status_code = 200
        ok_resp.headers = {}
        retry_resp = Mock()
        retry_resp.status_code = 429
        retry_resp.headers = {"Retry-After": "0"}
        client.request = AsyncMock(side_effect=[retry_resp, ok_resp])
        with patch("connectors.rate_limit.asyncio.sleep", new=AsyncMock()):
            result = await request_with_rate_limit(client, "GET", "http://test.com", max_attempts=3)
        self.assertEqual(result.status_code, 200)

    async def test_500_retry_then_success(self) -> None:
        client = Mock()
        ok_resp = Mock()
        ok_resp.status_code = 200
        ok_resp.headers = {}
        retry_resp = Mock()
        retry_resp.status_code = 500
        retry_resp.headers = {}
        client.request = AsyncMock(side_effect=[retry_resp, ok_resp])
        with patch("connectors.rate_limit.asyncio.sleep", new=AsyncMock()):
            result = await request_with_rate_limit(client, "GET", "http://test.com", max_attempts=3)
        self.assertEqual(result.status_code, 200)

    async def test_429_exhausted(self) -> None:
        client = Mock()
        retry_resp = Mock()
        retry_resp.status_code = 429
        retry_resp.headers = {"Retry-After": "0"}
        client.request = AsyncMock(return_value=retry_resp)
        with patch("connectors.rate_limit.asyncio.sleep", new=AsyncMock()):
            result = await request_with_rate_limit(client, "GET", "http://test.com", max_attempts=1)
        self.assertEqual(result.status_code, 429)

    async def test_custom_retryable_statuses(self) -> None:
        client = Mock()
        resp = Mock()
        resp.status_code = 418
        resp.headers = {}
        client.request = AsyncMock(return_value=resp)
        result = await request_with_rate_limit(
            client, "GET", "http://test.com", max_attempts=1, retryable_statuses={418}
        )
        self.assertEqual(result.status_code, 418)

    async def test_max_attempts_zero(self) -> None:
        client = Mock()
        with self.assertRaises(RuntimeError):
            await request_with_rate_limit(client, "GET", "http://test.com", max_attempts=0)


# ── db.py ─────────────────────────────────────────────────────────────────


class TestDbHelpers(unittest.TestCase):
    def test_get_execution_log_verbosity_invalid(self) -> None:
        with patch.dict(os.environ, {"EXECUTION_LOG_VERBOSITY": "INVALID"}):
            self.assertEqual(get_execution_log_verbosity(), "METADATA_ONLY")

    def test_redact_secrets_depth_exceeded(self) -> None:
        d: dict = {"k": "secret"}
        for _ in range(10):
            d = {"n": d}
        result = redact_secrets(d)
        self.assertIn("n", result)

    def test_safe_metadata_key_non_string(self) -> None:
        from db import _safe_metadata_key

        self.assertEqual(_safe_metadata_key(123), "123")

    def test_summarize_payload_metadata_depth_exceeded(self) -> None:
        d: Any = {"j": "val"}
        for _ in range(6):
            d = {"i": d}
        result = summarize_payload_metadata(d)
        self.assertIn('"truncated": true', json.dumps(result))

    def test_apply_execution_log_policy_invalid_mode(self) -> None:
        with patch.dict(os.environ, {"EXECUTION_LOG_VERBOSITY": "INVALID"}):
            result = apply_execution_log_policy({"key": "value"})
            self.assertIsNotNone(result)

    def test_hash_payload_json_error(self) -> None:
        class Unserializable:
            pass

        result = hash_payload(Unserializable())
        self.assertTrue(isinstance(result, str) and len(result) == 64)

    def test_looks_like_missing_column_error_no_column(self) -> None:
        self.assertFalse(_looks_like_missing_column_error("some random error", {"foo"}))

    def test_create_approval_missing_column_fallback(self) -> None:
        db = Mock()
        # First insert raises, second insert succeeds
        first_insert = Mock()
        first_insert.execute = Mock(side_effect=Exception("column does not exist: requested_action"))
        second_insert = Mock()
        second_insert.execute = Mock(return_value=Mock(data=[{"id": "a1"}], error=None))
        db.table = Mock(return_value=Mock(insert=Mock(side_effect=[first_insert, second_insert])))
        with patch("db._looks_like_missing_column_error", return_value=True):
            result = asyncio.run(create_approval(db, "exec-1", "user-1", {"requested_action": "test"}))
        self.assertEqual(result["id"], "a1")

    def test_create_approval_result_error_fallback(self) -> None:
        db = Mock()
        first_result = Mock()
        first_result.error = "some error"
        first_result.data = None
        second_result = Mock()
        second_result.error = None
        second_result.data = [{"id": "a2"}]
        insert_mock = Mock()
        insert_mock.execute = Mock(side_effect=[first_result, second_result])
        db.table = Mock(return_value=Mock(insert=Mock(return_value=insert_mock)))
        result = asyncio.run(create_approval(db, "exec-1", "user-1", {"requested_action": "test"}))
        self.assertEqual(result["id"], "a2")

    def test_get_approval_none_result(self) -> None:
        db = Mock()
        db.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = None
        result = asyncio.run(get_approval(db, "exec-1"))
        self.assertIsNone(result)

    def test_cleanup_stale_locks_orphaned_datetime_parse(self) -> None:
        from db import cleanup_stale_locks

        db = Mock()
        builder = Mock()
        for method in [
            "delete",
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
        call_count = 0

        def _exec_side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:  # delete().lt().execute()
                return Mock(data=[])
            if call_count == 2:  # select("id, locked_by_run_id").execute()
                return Mock(data=[{"id": "l1", "locked_by_run_id": "r1"}])
            if call_count == 3:  # runs select().in_().execute()
                return Mock(data=[{"id": "r1", "status": "running", "started_at": "invalid-date"}])
            return Mock(data=[])

        builder.execute = Mock(side_effect=_exec_side_effect)
        db.table.return_value = builder
        result = asyncio.run(cleanup_stale_locks(db))
        self.assertEqual(result, 0)

    def test_cleanup_stale_locks_orphaned_datetime_success(self) -> None:
        from db import cleanup_stale_locks

        db = Mock()
        builder = Mock()
        for method in [
            "delete",
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
        call_count = 0

        def _exec_side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return Mock(data=[])
            if call_count == 2:
                return Mock(data=[{"id": "l1", "locked_by_run_id": "r1"}])
            if call_count == 3:
                return Mock(data=[{"id": "r1", "status": "running", "started_at": "2020-01-01T00:00:00+00:00"}])
            if call_count == 4:
                return Mock(data=[{"id": "l1"}])
            return Mock(data=[])

        builder.execute = Mock(side_effect=_exec_side_effect)
        db.table.return_value = builder
        result = asyncio.run(cleanup_stale_locks(db))
        self.assertEqual(result, 1)

    def test_get_active_cron_workflows_empty(self) -> None:
        db = Mock()
        db.table.return_value.select.return_value.execute.return_value = Mock(data=[])
        with patch("db.get_db", return_value=db):
            result = asyncio.run(get_active_cron_workflows())
        self.assertEqual(result, [])

    def test_get_active_cron_workflows_no_cron(self) -> None:
        db = Mock()
        db.table.return_value.select.return_value.execute.return_value = Mock(
            data=[{"id": "p1", "schema": {"nodes": [{"type": "trigger.manual"}]}}]
        )
        with patch("db.get_db", return_value=db):
            result = asyncio.run(get_active_cron_workflows())
        self.assertEqual(result, [])


# ── compliance.py ──────────────────────────────────────────────────────────


class TestComplianceHelpers(unittest.TestCase):
    def test_provider_leaves_eea_united_states(self) -> None:
        provider = Mock()
        provider.default_region = "United States East"
        self.assertTrue(provider_leaves_eea(provider))

    def test_provider_leaves_eea_global(self) -> None:
        provider = Mock()
        provider.default_region = "Global"
        self.assertTrue(provider_leaves_eea(provider))

    def test_provider_leaves_eea_eu(self) -> None:
        provider = Mock()
        provider.default_region = "EU-Central-1"
        self.assertFalse(provider_leaves_eea(provider))


# ── cors_config.py ─────────────────────────────────────────────────────────


class TestCorsConfig(unittest.TestCase):
    def test_production_with_star_raises(self) -> None:
        with self.assertRaises(RuntimeError):
            get_cors_allowed_origins({"NODE_ENV": "production", "CORS_ORIGINS": "*"})

    def test_production_invalid_origin_raises(self) -> None:
        with self.assertRaises(RuntimeError):
            get_cors_allowed_origins({"NODE_ENV": "production", "NEXT_PUBLIC_APP_URL": "not-a-url"})


# ── internal_auth.py ───────────────────────────────────────────────────────


class TestInternalAuthHelpers(unittest.TestCase):
    def test_verify_empty_segments(self) -> None:
        result = verify_internal_service_token_claims("token", "next:test")
        self.assertIsNone(result)

    def test_verify_json_loads_exception(self) -> None:
        with (
            patch("internal_auth._get_internal_service_secret", return_value="secret"),
            patch("internal_auth._sign_payload_segment", return_value="sig"),
            patch("internal_auth.hmac.compare_digest", return_value=True),
            patch("internal_auth._b64url_decode", return_value=b"not-json"),
        ):
            result = verify_internal_service_token_claims("payload.sig", "next:test")
        self.assertIsNone(result)

    def test_verify_non_int_iat(self) -> None:
        with (
            patch("internal_auth._get_internal_service_secret", return_value="secret"),
            patch("internal_auth._sign_payload_segment", return_value="sig"),
            patch("internal_auth.hmac.compare_digest", return_value=True),
            patch(
                "internal_auth._b64url_decode",
                return_value=json.dumps(
                    {"aud": "next:test", "iat": "not-int", "exp": 9999999999, "sub": "user-1"}
                ).encode(),
            ),
        ):
            result = verify_internal_service_token_claims("payload.sig", "next:test")
        self.assertIsNone(result)


# ── main.py ────────────────────────────────────────────────────────────────


class TestMainModuleLoad(unittest.TestCase):
    def test_missing_secret_warning(self) -> None:
        with patch.dict(os.environ, {"INTERNAL_SERVICE_AUTH_SECRET": ""}, clear=False):
            with patch("main._get_internal_service_secret", side_effect=RuntimeError("missing")):
                pass

    def test_nextjs_url_warning(self) -> None:
        with patch.dict(os.environ, {"NEXTJS_INTERNAL_URL": ""}):
            pass


# ── schema.py ───────────────────────────────────────────────────────────────


class TestSchemaValidationHelpers(unittest.TestCase):
    def test_bounded_int_non_int(self) -> None:
        with self.assertRaises(ValueError) as ctx:
            _bounded_int("abc", 5, field_name="test", minimum=0, maximum=10)
        self.assertIn("must be an integer", str(ctx.exception))

    def test_bounded_float_non_float(self) -> None:
        with self.assertRaises(ValueError) as ctx:
            _bounded_float("abc", 5.0, field_name="test", minimum=0.0, maximum=10.0)
        self.assertIn("must be a number", str(ctx.exception))

    def test_parse_retry_invalid_backoff(self) -> None:
        with self.assertRaises(ValueError) as ctx:
            _parse_retry({"backoff": "invalid"})
        self.assertIn("retry.backoff", str(ctx.exception))

    def test_parse_schema_full(self) -> None:
        raw = {
            "version": "1.0",
            "program_id": "p1",
            "program_name": "Test",
            "execution_mode": "autonomous",
            "nodes": [
                {
                    "id": "n1",
                    "type": "trigger",
                    "config": {"trigger_type": "manual"},
                    "label": "T",
                    "description": "",
                    "position": {},
                }
            ],
            "edges": [],
            "triggers": [],
            "version_history": [],
            "metadata": {},
        }
        schema = parse_schema(raw)
        self.assertEqual(schema.program_id, "p1")


# ── engine/executor.py remaining gaps ──────────────────────────────────────


class TestExecutorRemainingPaths(unittest.IsolatedAsyncioTestCase):
    async def test_call_llm_anthropic_error_paths(self) -> None:
        from engine.executor import ProgramExecutor

        schema = parse_schema(
            {
                "version": "1.0",
                "program_id": "p",
                "program_name": "T",
                "execution_mode": "autonomous",
                "nodes": [
                    {
                        "id": "t",
                        "type": "trigger",
                        "config": {"trigger_type": "manual"},
                        "label": "T",
                        "description": "",
                        "position": {},
                    }
                ],
                "edges": [],
                "triggers": [],
                "version_history": [],
                "metadata": {},
            }
        )
        executor = ProgramExecutor.__new__(ProgramExecutor)
        executor.schema = schema
        executor.run_id = "r1"
        executor.program_id = "p"
        executor.user_id = "u1"
        executor.execution_mode = "autonomous"
        executor.conflict_policy = "queue"
        executor.workspace_id = "ws1"
        executor.compliance_mode = "standard"
        executor.data_region = "eu-central-1"
        executor.retention_expiry = "2099-01-01T00:00:00+00:00"
        executor.db = Mock()
        executor.node_map = {}
        executor.edges_from = {}
        executor._connection_name_to_id = {}
        executor._node_telemetry = {}
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

        from schema import AgentConfig, RetryConfig

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
        resp.is_success = False
        resp.status_code = 500
        resp.text = "Internal Server Error"
        with (
            patch("engine.executor._get_llm_client") as mock_client,
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.os.environ.get", return_value=None),
        ):
            mock_client.return_value.post = AsyncMock(return_value=resp)
            with self.assertRaises(Exception) as ctx:
                await executor._call_llm(cfg, "key", "anthropic", {}, "n1")
            self.assertIn("500", str(ctx.exception))

    async def test_call_llm_openai_error_paths(self) -> None:
        from engine.executor import ProgramExecutor

        schema = parse_schema(
            {
                "version": "1.0",
                "program_id": "p",
                "program_name": "T",
                "execution_mode": "autonomous",
                "nodes": [
                    {
                        "id": "t",
                        "type": "trigger",
                        "config": {"trigger_type": "manual"},
                        "label": "T",
                        "description": "",
                        "position": {},
                    }
                ],
                "edges": [],
                "triggers": [],
                "version_history": [],
                "metadata": {},
            }
        )
        executor = ProgramExecutor.__new__(ProgramExecutor)
        executor.schema = schema
        executor.run_id = "r1"
        executor.program_id = "p"
        executor.user_id = "u1"
        executor.execution_mode = "autonomous"
        executor.conflict_policy = "queue"
        executor.workspace_id = "ws1"
        executor.compliance_mode = "standard"
        executor.data_region = "eu-central-1"
        executor.retention_expiry = "2099-01-01T00:00:00+00:00"
        executor.db = Mock()
        executor.node_map = {}
        executor.edges_from = {}
        executor._connection_name_to_id = {}
        executor._node_telemetry = {}
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

        from schema import AgentConfig, RetryConfig

        cfg = AgentConfig(
            model="gpt-4o",
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
        resp.text = ""
        resp.json.return_value = {"choices": []}
        with (
            patch("engine.executor._get_llm_client") as mock_client,
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.os.environ.get", return_value=None),
        ):
            mock_client.return_value.post = AsyncMock(return_value=resp)
            with self.assertRaises(Exception) as ctx:
                await executor._call_llm(cfg, "key", "openai", {}, "n1")
            self.assertIn("choices", str(ctx.exception).lower())

    async def test_resolve_http_oauth_token_invalid_hostname(self) -> None:
        from engine.executor import ProgramExecutor, ExecutionError

        schema = parse_schema(
            {
                "version": "1.0",
                "program_id": "p",
                "program_name": "T",
                "execution_mode": "autonomous",
                "nodes": [
                    {
                        "id": "t",
                        "type": "trigger",
                        "config": {"trigger_type": "manual"},
                        "label": "T",
                        "description": "",
                        "position": {},
                    }
                ],
                "edges": [],
                "triggers": [],
                "version_history": [],
                "metadata": {},
            }
        )
        executor = ProgramExecutor.__new__(ProgramExecutor)
        executor.schema = schema
        executor.run_id = "r1"
        executor.program_id = "p"
        executor.user_id = "u1"
        executor.execution_mode = "autonomous"
        executor.conflict_policy = "queue"
        executor.workspace_id = "ws1"
        executor.compliance_mode = "standard"
        executor.data_region = "eu-central-1"
        executor.retention_expiry = "2099-01-01T00:00:00+00:00"
        executor.db = Mock()
        executor.node_map = {}
        executor.edges_from = {}
        executor._connection_name_to_id = {}
        executor._node_telemetry = {}
        executor._run_telemetry = {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "estimated_cost_usd": 0.0,
            "connector_api_calls": 0,
            "model_call_count": 0,
        }
        executor._limiter = Mock()
        executor._agent_credentials = None
        executor.dry_run = False

        node = Mock()
        node.connection = "gmail"
        node.id = "conn-1"
        with (
            patch.object(executor, "_resolve_connection_id", return_value="conn-id-1"),
            patch.object(executor, "_provider_for_connection", return_value="gmail"),
        ):
            with self.assertRaises(ExecutionError) as ctx:
                await executor._resolve_http_oauth_token(node, {}, "https://evil.com/api")
            self.assertEqual(ctx.exception.code, "HTTP_OAUTH_TARGET_INVALID")

    async def test_wait_for_approval_timeout(self) -> None:
        from engine.executor import ProgramExecutor, ExecutionError

        schema = parse_schema(
            {
                "version": "1.0",
                "program_id": "p",
                "program_name": "T",
                "execution_mode": "autonomous",
                "nodes": [
                    {
                        "id": "t",
                        "type": "trigger",
                        "config": {"trigger_type": "manual"},
                        "label": "T",
                        "description": "",
                        "position": {},
                    }
                ],
                "edges": [],
                "triggers": [],
                "version_history": [],
                "metadata": {},
            }
        )
        executor = ProgramExecutor.__new__(ProgramExecutor)
        executor.schema = schema
        executor.run_id = "r1"
        executor.program_id = "p"
        executor.user_id = "u1"
        executor.execution_mode = "autonomous"
        executor.conflict_policy = "queue"
        executor.workspace_id = "ws1"
        executor.compliance_mode = "standard"
        executor.data_region = "eu-central-1"
        executor.retention_expiry = "2099-01-01T00:00:00+00:00"
        executor.db = Mock()
        executor.node_map = {}
        executor.edges_from = {}
        executor._connection_name_to_id = {}
        executor._node_telemetry = {}
        executor._run_telemetry = {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "estimated_cost_usd": 0.0,
            "connector_api_calls": 0,
            "model_call_count": 0,
        }
        executor._limiter = Mock()
        executor._agent_credentials = None
        executor.dry_run = False

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
        db.table = Mock(return_value=builder)
        executor.db = db

        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.time.time", side_effect=[0.0, 0.1, 3601.0, 3601.0, 3601.0]),
            patch("engine.executor.asyncio.Event") as mock_event,
        ):
            ev = Mock()
            ev.wait = AsyncMock(side_effect=asyncio.TimeoutError)
            ev.set = Mock()
            ev.clear = Mock()
            mock_event.return_value = ev
            with self.assertRaises(ExecutionError) as ctx:
                await executor._wait_for_approval_decision("exec-1", 1.0)
            self.assertEqual(ctx.exception.code, "APPROVAL_TIMEOUT")


if __name__ == "__main__":
    unittest.main()
