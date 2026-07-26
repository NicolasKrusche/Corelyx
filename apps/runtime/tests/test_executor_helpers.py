"""Unit tests for engine/executor helper functions and safe paths."""

from __future__ import annotations


import os
import socket
import unittest
from typing import Any
from unittest.mock import AsyncMock, Mock, patch

from engine.executor import (
    ExecutionError,
    ProgramExecutor,
    _empty_telemetry,
    _extract_usage_tokens,
    _non_negative_float,
    _non_negative_int,
    _resolve_expressions,
    _resolve_nested,
    _round_cost,
    _safe_json_args,
)
from schema import parse_schema


os.environ.setdefault("SUPABASE_URL", "http://localhost")
os.environ.setdefault("SUPABASE_KEY", "test-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")


def _simple_schema(nodes: list[dict], edges: list[dict] | None = None) -> Any:
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


class TestSafeJsonArgs(unittest.TestCase):
    def test_dict_passthrough(self) -> None:
        self.assertEqual(_safe_json_args({"a": 1}), {"a": 1})

    def test_valid_json_string(self) -> None:
        self.assertEqual(_safe_json_args('{"a": 1}'), {"a": 1})

    def test_non_dict_json_returns_empty(self) -> None:
        self.assertEqual(_safe_json_args("[1, 2]"), {})

    def test_invalid_json_returns_empty(self) -> None:
        self.assertEqual(_safe_json_args("not json"), {})

    def test_none_returns_empty(self) -> None:
        self.assertEqual(_safe_json_args(None), {})


class TestNonNegativeInt(unittest.TestCase):
    def test_positive(self) -> None:
        self.assertEqual(_non_negative_int(5), 5)

    def test_zero(self) -> None:
        self.assertEqual(_non_negative_int(0), 0)

    def test_negative(self) -> None:
        self.assertEqual(_non_negative_int(-3), 0)

    def test_invalid(self) -> None:
        self.assertEqual(_non_negative_int("abc"), 0)

    def test_none(self) -> None:
        self.assertEqual(_non_negative_int(None), 0)


class TestNonNegativeFloat(unittest.TestCase):
    def test_positive(self) -> None:
        self.assertEqual(_non_negative_float(3.5), 3.5)

    def test_zero(self) -> None:
        self.assertEqual(_non_negative_float(0.0), 0.0)

    def test_negative(self) -> None:
        self.assertEqual(_non_negative_float(-2.1), 0.0)

    def test_invalid(self) -> None:
        self.assertEqual(_non_negative_float("x"), 0.0)

    def test_none(self) -> None:
        self.assertEqual(_non_negative_float(None), 0.0)


class TestRoundCost(unittest.TestCase):
    def test_rounds(self) -> None:
        self.assertEqual(_round_cost(1.2345678), 1.234568)

    def test_negative_becomes_zero(self) -> None:
        self.assertEqual(_round_cost(-1.0), 0.0)


class TestExtractUsageTokens(unittest.TestCase):
    def test_missing_usage(self) -> None:
        self.assertEqual(_extract_usage_tokens({}), (0, 0, 0))

    def test_non_dict_usage(self) -> None:
        self.assertEqual(_extract_usage_tokens({"usage": "bad"}), (0, 0, 0))

    def test_openai_style(self) -> None:
        self.assertEqual(
            _extract_usage_tokens({"usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}}),
            (10, 5, 15),
        )

    def test_anthropic_style(self) -> None:
        self.assertEqual(
            _extract_usage_tokens({"usage": {"input_tokens": 8, "output_tokens": 2}}),
            (8, 2, 10),
        )

    def test_negative_values_clamped(self) -> None:
        self.assertEqual(
            _extract_usage_tokens({"usage": {"prompt_tokens": -1, "completion_tokens": -2, "total_tokens": -3}}),
            (0, 0, 0),
        )


class TestResolveExpressions(unittest.TestCase):
    def test_simple_substitution(self) -> None:
        result = _resolve_expressions("Hello {{name}}", {"name": "world"})
        self.assertEqual(result, "Hello world")

    def test_missing_key_returns_empty(self) -> None:
        self.assertEqual(_resolve_expressions("Hello {{missing}}", {}), "Hello ")

    def test_no_substitution(self) -> None:
        result = _resolve_expressions("Hello world", {})
        self.assertEqual(result, "Hello world")

    def test_nested_dict_access(self) -> None:
        result = _resolve_expressions("{{a.b}}", {"a": {"b": 1}})
        self.assertEqual(result, "1")

    def test_list_result_json(self) -> None:
        result = _resolve_expressions("{{items}}", {"items": [1, 2]})
        self.assertEqual(result, "[1, 2]")


class TestResolveNested(unittest.TestCase):
    def test_string(self) -> None:
        self.assertEqual(_resolve_nested("{{x}}", {"x": 1}), "1")

    def test_dict(self) -> None:
        self.assertEqual(_resolve_nested({"k": "{{x}}"}, {"x": 1}), {"k": "1"})

    def test_list(self) -> None:
        self.assertEqual(_resolve_nested(["{{x}}"], {"x": 1}), ["1"])

    def test_other(self) -> None:
        self.assertEqual(_resolve_nested(42, {}), 42)


class TestValidateHttpUrl(unittest.TestCase):
    def test_valid_http(self) -> None:
        # Stub the resolver. _validate_http_url resolves the hostname to check it
        # against the private ranges, so the unmocked call fired a live DNS query
        # for example.com — a real network dependency, and flaky besides (the
        # assertion is only meaningful if example.com resolves to a public IP).
        with patch(
            "engine.executor.socket.getaddrinfo",
            return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))],
        ):
            ProgramExecutor._validate_http_url("https://example.com/path")

    def test_blocked_scheme_file(self) -> None:
        with self.assertRaises(ExecutionError) as ctx:
            ProgramExecutor._validate_http_url("file:///etc/passwd")
        self.assertEqual(ctx.exception.code, "HTTP_CONFIG_INVALID")

    def test_blocked_scheme_ftp(self) -> None:
        with self.assertRaises(ExecutionError) as ctx:
            ProgramExecutor._validate_http_url("ftp://example.com")
        self.assertEqual(ctx.exception.code, "HTTP_CONFIG_INVALID")

    def test_blocked_localhost(self) -> None:
        with self.assertRaises(ExecutionError) as ctx:
            ProgramExecutor._validate_http_url("http://127.0.0.1:8080")
        self.assertEqual(ctx.exception.code, "HTTP_CONFIG_INVALID")

    def test_blocked_loopback_ipv6(self) -> None:
        with self.assertRaises(ExecutionError) as ctx:
            ProgramExecutor._validate_http_url("http://[::1]:3000")
        self.assertEqual(ctx.exception.code, "HTTP_CONFIG_INVALID")

    def test_blocked_link_local(self) -> None:
        with self.assertRaises(ExecutionError) as ctx:
            ProgramExecutor._validate_http_url("http://169.254.169.254")
        self.assertEqual(ctx.exception.code, "HTTP_CONFIG_INVALID")

    def test_blocked_private(self) -> None:
        with self.assertRaises(ExecutionError) as ctx:
            ProgramExecutor._validate_http_url("http://10.0.0.1")
        self.assertEqual(ctx.exception.code, "HTTP_CONFIG_INVALID")


class TestProgramExecutorInit(unittest.TestCase):
    def test_compliance_mode_fallback(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = ProgramExecutor(schema, "r1", "p1", "u1", compliance_mode="invalid")
        self.assertEqual(executor.compliance_mode, "standard")

    def test_retention_days_fallback(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = ProgramExecutor(schema, "r1", "p1", "u1", execution_log_retention_days="bad")
        self.assertTrue(executor.retention_expiry.startswith("20"))

    def test_dry_run_default_false(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = ProgramExecutor(schema, "r1", "p1", "u1")
        self.assertFalse(executor.dry_run)

    def test_dry_run_true(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = ProgramExecutor(schema, "r1", "p1", "u1", dry_run=True)
        self.assertTrue(executor.dry_run)

    def test_data_region_default(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = ProgramExecutor(schema, "r1", "p1", "u1")
        self.assertEqual(executor.data_region, "eu-central-1")


class TestRecordTelemetry(unittest.IsolatedAsyncioTestCase):
    async def test_records_prompt_tokens(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = ProgramExecutor(schema, "r1", "p1", "u1")
        executor._record_telemetry("t", prompt_tokens=10)
        self.assertEqual(executor._node_telemetry["t"]["prompt_tokens"], 10)

    async def test_run_telemetry_payload(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = ProgramExecutor(schema, "r1", "p1", "u1")
        executor._record_telemetry(
            "t",
            prompt_tokens=5,
            completion_tokens=3,
            total_tokens=8,
            estimated_cost_usd=0.001,
            connector_api_calls=2,
            model_call_count=1,
        )
        payload = executor.run_telemetry_payload()
        self.assertEqual(payload["prompt_tokens"], 5)
        self.assertEqual(payload["completion_tokens"], 3)
        self.assertEqual(payload["total_tokens"], 8)
        self.assertEqual(payload["estimated_cost_usd"], 0.001)
        self.assertEqual(payload["connector_api_calls"], 2)
        self.assertEqual(payload["model_call_count"], 1)


class TestCheckPlatformCredits(unittest.IsolatedAsyncioTestCase):
    async def test_success(self) -> None:
        schema = _simple_schema([{"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}}])
        executor = ProgramExecutor(schema, "r1", "p1", "u1")
        with patch("engine.executor.httpx.AsyncClient") as mock_client:
            instance = Mock()
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=None)
            instance.post = AsyncMock(return_value=Mock(status_code=200, json=lambda: {"ok": True}))
            mock_client.return_value = instance
            await executor._check_platform_credits()


class TestEmptyTelemetry(unittest.TestCase):
    def test_structure(self) -> None:
        t = _empty_telemetry()
        self.assertEqual(t["prompt_tokens"], 0)
        self.assertEqual(t["completion_tokens"], 0)
        self.assertEqual(t["total_tokens"], 0)
        self.assertEqual(t["estimated_cost_usd"], 0.0)
        self.assertEqual(t["connector_api_calls"], 0)
        self.assertEqual(t["model_call_count"], 0)


if __name__ == "__main__":
    unittest.main()
