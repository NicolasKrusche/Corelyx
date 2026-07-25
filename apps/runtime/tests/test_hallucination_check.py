"""Tests for the post-execution hallucination (groundedness) check on agent nodes.

A confident "hallucinated" judge verdict must abort the ENTIRE run; a grounded /
not-applicable / low-confidence / unparseable verdict (or a broken judge call)
must let the run continue unchanged.
"""

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


import os
import unittest
from typing import Any
from unittest.mock import AsyncMock, Mock, patch

from schema import ProgramSchema, parse_schema
from engine.executor import (
    ExecutionError,
    HallucinationError,
    ProgramExecutor,
    _HALLUCINATION_JUDGE_PROMPT,
    _parse_hallucination_verdict,
)

os.environ.setdefault("SUPABASE_URL", "http://localhost")
os.environ.setdefault("SUPABASE_KEY", "test-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
os.environ.setdefault("INTERNAL_SERVICE_AUTH_SECRET", "test-internal-secret")


def _mock_db() -> Mock:
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
    return db


def _agent_schema() -> ProgramSchema:
    return parse_schema(
        {
            "version": "1.0",
            "program_id": "test",
            "program_name": "Test",
            "execution_mode": "autonomous",
            "nodes": [
                {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                {
                    "id": "a",
                    "type": "agent",
                    "config": {
                        "model": "gpt-4o",
                        "api_key_ref": "my-key",
                        "system_prompt": "Summarize the emails.",
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
            "edges": [{"id": "e1", "from": "t", "to": "a", "type": "data_flow"}],
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
    executor._connection_name_to_id = {}
    telemetry = {
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
        "estimated_cost_usd": 0.0,
        "connector_api_calls": 0,
        "model_call_count": 0,
    }
    executor._node_telemetry = {n.id: dict(telemetry) for n in schema.nodes}
    executor._run_telemetry = dict(telemetry)
    executor._limiter = Mock()
    for method in [
        "check_node_limit",
        "check_execution_time",
        "check_llm_call",
        "check_llm_tokens",
        "check_cost",
        "check_connector_call",
    ]:
        setattr(executor._limiter, method, Mock())
    executor._agent_credentials = None
    executor.dry_run = False
    return executor


INPUT_DATA = {"emails": [{"subject": "Invoice 42", "from": "a@b.com"}]}
AGENT_OUTPUT = {"summary": "One invoice email from a@b.com"}

GROUNDED = {"verdict": "grounded", "confidence": 0.95, "issues": []}
HALLUCINATED = {
    "verdict": "hallucinated",
    "confidence": 0.92,
    "issues": ["mentions a refund of EUR 990 that appears nowhere in the input"],
}


class TestVerdictParser(unittest.TestCase):
    def test_plain_dict_verdict(self) -> None:
        verdict, confidence, issues = _parse_hallucination_verdict(HALLUCINATED)
        self.assertEqual(verdict, "hallucinated")
        self.assertAlmostEqual(confidence, 0.92)
        self.assertEqual(len(issues), 1)

    def test_prose_wrapped_json(self) -> None:
        raw = {"text": 'Here is my audit:\n{"verdict": "grounded", "confidence": 0.8, "issues": []}'}
        verdict, confidence, issues = _parse_hallucination_verdict(raw)
        self.assertEqual(verdict, "grounded")
        self.assertAlmostEqual(confidence, 0.8)
        self.assertEqual(issues, [])

    def test_garbage_fails_open(self) -> None:
        for raw in [{"text": "no json here"}, {"confidence": "high"}, [], None, "x"]:
            verdict, confidence, _ = _parse_hallucination_verdict(raw)
            self.assertNotEqual(verdict, "hallucinated")
            self.assertEqual(confidence, 0.0)

    def test_non_numeric_confidence(self) -> None:
        verdict, confidence, _ = _parse_hallucination_verdict(
            {"verdict": "hallucinated", "confidence": "very", "issues": []}
        )
        self.assertEqual(verdict, "hallucinated")
        self.assertEqual(confidence, 0.0)


class TestHallucinationCheck(unittest.IsolatedAsyncioTestCase):
    def _patched_executor(self) -> ProgramExecutor:
        executor = _make_executor(_agent_schema())
        return executor

    def _common_patches(self, executor: ProgramExecutor, judge_result: Any):
        """Patch key fetch, policy, circuit (returns the agent answer) and the
        judge LLM call. A dict is returned on every judge call; an Exception is
        raised; a list is replayed in sequence (one entry per regeneration)."""
        circuit = Mock()
        circuit.call = AsyncMock(return_value=AGENT_OUTPUT)
        judge = (
            AsyncMock(side_effect=judge_result)
            if isinstance(judge_result, (Exception, list))
            else AsyncMock(return_value=judge_result)
        )
        return [
            patch.object(executor, "_fetch_api_key", AsyncMock(return_value=("key", "openai"))),
            patch.object(executor, "_check_platform_credits", new=AsyncMock()),
            patch.object(executor, "_enforce_provider_policy", new=AsyncMock()),
            patch("engine.executor.get_llm_circuit", return_value=circuit),
            patch.object(executor, "_call_llm", judge),
        ], judge

    async def test_grounded_verdict_continues(self) -> None:
        executor = self._patched_executor()
        patches, judge = self._common_patches(executor, GROUNDED)
        with patches[0], patches[1], patches[2], patches[3], patches[4]:
            output = await executor._execute_agent(executor.node_map["a"], INPUT_DATA)
        self.assertEqual(output, AGENT_OUTPUT)
        judge.assert_awaited_once()

    async def test_persistent_hallucination_warns_not_aborts(self) -> None:
        # Judge flags every attempt: the agent is regenerated up to the retry cap,
        # then the run continues with a non-fatal groundedness warning attached
        # (no HallucinationError, so the rest of the run can complete).
        from engine.executor import GROUNDEDNESS_WARNING_KEY, HALLUCINATION_MAX_RETRIES

        executor = self._patched_executor()
        patches, judge = self._common_patches(executor, HALLUCINATED)
        with patches[0], patches[1], patches[2], patches[3], patches[4]:
            output = await executor._execute_agent(executor.node_map["a"], INPUT_DATA)
        self.assertIn(GROUNDEDNESS_WARNING_KEY, output)
        self.assertIn("refund of EUR 990", output[GROUNDEDNESS_WARNING_KEY])
        # One initial generation + one judge call per attempt (initial + retries).
        self.assertEqual(judge.await_count, HALLUCINATION_MAX_RETRIES + 1)

    async def test_hallucination_then_recovers_on_retry(self) -> None:
        # First attempt hallucinates, the corrected regeneration is grounded:
        # the run continues with NO warning attached.
        from engine.executor import GROUNDEDNESS_WARNING_KEY

        executor = self._patched_executor()
        patches, judge = self._common_patches(executor, [HALLUCINATED, GROUNDED])
        with patches[0], patches[1], patches[2], patches[3], patches[4]:
            output = await executor._execute_agent(executor.node_map["a"], INPUT_DATA)
        self.assertNotIn(GROUNDEDNESS_WARNING_KEY, output)
        self.assertEqual(output, AGENT_OUTPUT)
        self.assertEqual(judge.await_count, 2)  # flagged once, then grounded

    async def test_low_confidence_does_not_abort(self) -> None:
        executor = self._patched_executor()
        weak = {"verdict": "hallucinated", "confidence": 0.4, "issues": ["maybe"]}
        patches, _ = self._common_patches(executor, weak)
        with patches[0], patches[1], patches[2], patches[3], patches[4]:
            output = await executor._execute_agent(executor.node_map["a"], INPUT_DATA)
        self.assertEqual(output, AGENT_OUTPUT)

    async def test_not_applicable_does_not_abort(self) -> None:
        executor = self._patched_executor()
        na = {"verdict": "not_applicable", "confidence": 0.99, "issues": []}
        patches, _ = self._common_patches(executor, na)
        with patches[0], patches[1], patches[2], patches[3], patches[4]:
            output = await executor._execute_agent(executor.node_map["a"], INPUT_DATA)
        self.assertEqual(output, AGENT_OUTPUT)

    async def test_judge_failure_fails_open(self) -> None:
        executor = self._patched_executor()
        patches, _ = self._common_patches(executor, RuntimeError("judge provider down"))
        with patches[0], patches[1], patches[2], patches[3], patches[4]:
            output = await executor._execute_agent(executor.node_map["a"], INPUT_DATA)
        self.assertEqual(output, AGENT_OUTPUT)

    async def test_judge_run_limit_exceeded_still_aborts(self) -> None:
        # The limiter raises RunLimitExceeded (NOT an ExecutionError) from inside
        # the judge call. It must propagate and abort the run — not be swallowed
        # by the judge's fail-open path (R10). The old test mocked an
        # ExecutionError, which the fail-open `except Exception` never sees, so
        # it passed while prod fell open on the real (RunLimitExceeded) type.
        from engine.run_limits import RunLimitExceeded

        executor = self._patched_executor()
        limit_error = RunLimitExceeded("Run cost limit exceeded")
        patches, _ = self._common_patches(executor, limit_error)
        with patches[0], patches[1], patches[2], patches[3], patches[4]:
            with self.assertRaises(RunLimitExceeded):
                await executor._execute_agent(executor.node_map["a"], INPUT_DATA)

    async def test_judge_execution_error_still_aborts(self) -> None:
        # An ExecutionError from the judge (e.g. a hard limit surfaced as one)
        # must also keep its abort semantics.
        executor = self._patched_executor()
        limit_error = ExecutionError("LIMIT_EXCEEDED", "Run cost limit exceeded", "a")
        patches, _ = self._common_patches(executor, limit_error)
        with patches[0], patches[1], patches[2], patches[3], patches[4]:
            with self.assertRaises(ExecutionError) as ctx:
                await executor._execute_agent(executor.node_map["a"], INPUT_DATA)
        self.assertEqual(ctx.exception.code, "LIMIT_EXCEEDED")

    async def test_disabled_via_env_skips_judge(self) -> None:
        executor = self._patched_executor()
        patches, judge = self._common_patches(executor, GROUNDED)
        with patch.dict(os.environ, {"HALLUCINATION_CHECK_ENABLED": "false"}):
            with patches[0], patches[1], patches[2], patches[3], patches[4]:
                output = await executor._execute_agent(executor.node_map["a"], INPUT_DATA)
        self.assertEqual(output, AGENT_OUTPUT)
        judge.assert_not_awaited()

    async def test_empty_input_skips_judge(self) -> None:
        # Purely generative steps (no source data) have nothing to ground against.
        executor = self._patched_executor()
        patches, judge = self._common_patches(executor, GROUNDED)
        with patches[0], patches[1], patches[2], patches[3], patches[4]:
            output = await executor._execute_agent(executor.node_map["a"], {})
        self.assertEqual(output, AGENT_OUTPUT)
        judge.assert_not_awaited()

    async def test_judge_uses_audit_prompt_and_full_context(self) -> None:
        executor = self._patched_executor()
        patches, judge = self._common_patches(executor, GROUNDED)
        with patches[0], patches[1], patches[2], patches[3], patches[4]:
            await executor._execute_agent(executor.node_map["a"], INPUT_DATA)
        cfg_arg = judge.await_args.args[0]
        input_arg = judge.await_args.args[3]
        self.assertIn("groundedness auditor", cfg_arg.system_prompt)
        self.assertEqual(input_arg["source_data"], INPUT_DATA)
        self.assertEqual(input_arg["ai_answer"], AGENT_OUTPUT)
        self.assertEqual(input_arg["task"], "Summarize the emails.")


class TestJudgePrompt(unittest.TestCase):
    def test_prompt_excludes_decorative_differences(self) -> None:
        # Summarization steps legitimately re-decorate output (e.g. a different
        # subject emoji); the judge must not treat that as a fabricated claim.
        prompt = _HALLUCINATION_JUDGE_PROMPT.lower()
        self.assertIn("emoji", prompt)
        self.assertIn("decorative", prompt)


class TestRunAbortPropagation(unittest.IsolatedAsyncioTestCase):
    async def test_hallucination_aborts_entire_run(self) -> None:
        """With two parallel branches, a hallucination in one must abort the whole
        run immediately instead of letting the other branch keep executing."""
        schema = parse_schema(
            {
                "version": "1.0",
                "program_id": "test",
                "program_name": "Test",
                "execution_mode": "autonomous",
                "nodes": [
                    {"id": "t", "type": "trigger", "config": {"trigger_type": "manual"}},
                    {
                        "id": "a",
                        "type": "agent",
                        "config": {
                            "model": "gpt-4o",
                            "api_key_ref": "my-key",
                            "system_prompt": "Summarize.",
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
                    {
                        "id": "s2",
                        "type": "step",
                        "config": {"logic_type": "transform", "extra": {"transformation": "data"}},
                    },
                ],
                "edges": [
                    {"id": "e1", "from": "t", "to": "a", "type": "data_flow"},
                    {"id": "e2", "from": "t", "to": "s2", "type": "data_flow"},
                ],
                "triggers": [],
                "version_history": [],
                "metadata": {},
            }
        )
        executor = _make_executor(schema)
        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(executor, "_acquire_program_locks", new=AsyncMock()),
            patch.object(
                executor,
                "_execute_agent",
                AsyncMock(side_effect=HallucinationError("a", "fabricated claim")),
            ),
        ):
            with self.assertRaises(ExecutionError) as ctx:
                await executor.execute({"data": 1})
        self.assertEqual(ctx.exception.code, "HALLUCINATION_DETECTED")
        self.assertIn("Run aborted", ctx.exception.message)


if __name__ == "__main__":
    unittest.main()
