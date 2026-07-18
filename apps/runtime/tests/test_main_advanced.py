"""Advanced tests for main.py endpoints and helpers."""

from __future__ import annotations

import json
import os
import unittest
from typing import Any
from unittest.mock import AsyncMock, MagicMock, Mock, patch

from fastapi.testclient import TestClient

# Set required env vars before importing main
os.environ.setdefault("SUPABASE_URL", "http://localhost")
os.environ.setdefault("SUPABASE_KEY", "test-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
os.environ.setdefault("INTERNAL_SERVICE_AUTH_SECRET_RUNTIME_EXECUTE", "secret-execute")
os.environ.setdefault("INTERNAL_SERVICE_AUTH_SECRET_NEXT_RUNS_COMPLETE", "secret-complete")
os.environ.setdefault("INTERNAL_SERVICE_AUTH_SECRET_NEXT_CONNECTIONS_TOKEN", "secret-token")
os.environ.setdefault("INTERNAL_SERVICE_AUTH_SECRET_NEXT_VAULT", "secret-vault")
os.environ.setdefault("INTERNAL_SERVICE_AUTH_SECRET_NEXT_CREDITS", "secret-credits")
os.environ.setdefault("INTERNAL_SERVICE_AUTH_SECRET_NEXT_AGENT_TOOLS", "secret-tools")
os.environ.setdefault("INTERNAL_SERVICE_AUTH_SECRET_NEXT_CRON_TICK", "secret-cron")

import asyncio

import main as main_module
from main import (
    ExecuteRequest,
    _cron_tick,
    _notify_complete,
    _retention_expiry,
    _run_program,
    _run_with_active_timeout,
    app,
    parse_cron,
    trigger_workflow,
)


client = TestClient(app)


class TestRetentionExpiry(unittest.TestCase):
    def test_valid_days(self) -> None:
        result = _retention_expiry({"execution_log_retention_days": 30})
        self.assertTrue(result.startswith("20"))

    def test_missing_days_fallback(self) -> None:
        result = _retention_expiry({})
        self.assertTrue(result.startswith("20"))

    def test_invalid_days_fallback(self) -> None:
        result = _retention_expiry({"execution_log_retention_days": "bad"})
        self.assertTrue(result.startswith("20"))

    def test_zero_days_clamped(self) -> None:
        result = _retention_expiry({"execution_log_retention_days": 0})
        # max(1, 0) -> 1
        self.assertTrue(result.startswith("20"))


class TestParseCron(unittest.TestCase):
    def test_valid(self) -> None:
        result = parse_cron("0 9 * * 1")
        self.assertEqual(result["minute"], "0")
        self.assertEqual(result["hour"], "9")
        self.assertEqual(result["day"], "*")
        self.assertEqual(result["month"], "*")
        self.assertEqual(result["day_of_week"], "1")

    def test_invalid_field_count(self) -> None:
        with self.assertRaises(ValueError):
            parse_cron("0 9 * *")

    def test_whitespace_stripped(self) -> None:
        result = parse_cron("  0  9  *  *  1  ")
        self.assertEqual(result["minute"], "0")


class TestHealthEndpoint(unittest.IsolatedAsyncioTestCase):
    async def test_health(self) -> None:
        response = client.get("/health")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "ok")
        # `commit` answers "did the redeploy land?" without host logs. No commit
        # env var is injected under test, so it reports the honest fallback.
        self.assertEqual(body["commit"], "unknown")

    async def test_health_reports_the_deployed_commit(self) -> None:
        sha = "aaa065bb5e4b9f2c1d0e"
        with patch.object(main_module, "_DEPLOYED_COMMIT", sha):
            body = client.get("/health").json()
        # Short SHA so it diffs directly against `git rev-parse --short=12`.
        self.assertEqual(body["commit"], "aaa065bb5e4b")

    async def test_health_never_leaks_configuration(self) -> None:
        # The route is public and unauthenticated: liveness, version, and
        # heartbeat health only — never error text or configured URLs.
        with patch.object(main_module, "_DEPLOYED_COMMIT", "deadbeefcafe"):
            body = client.get("/health").json()
        self.assertEqual(
            set(body),
            {"status", "commit", "heartbeat_last_success_at", "heartbeat_consecutive_failures"},
        )

    async def test_health_reports_degraded_after_sustained_heartbeat_failures(self) -> None:
        with (
            patch.object(main_module, "_cron_tick_failures", main_module._HEARTBEAT_UNHEALTHY_THRESHOLD),
            patch.object(main_module, "_cron_tick_last_success_at", None),
        ):
            response = client.get("/health")
        self.assertEqual(response.status_code, 503)
        body = response.json()
        self.assertEqual(body["status"], "degraded")
        self.assertEqual(body["heartbeat_consecutive_failures"], main_module._HEARTBEAT_UNHEALTHY_THRESHOLD)
        self.assertIsNone(body["heartbeat_last_success_at"])

    async def test_health_ok_below_heartbeat_failure_threshold(self) -> None:
        with patch.object(main_module, "_cron_tick_failures", main_module._HEARTBEAT_UNHEALTHY_THRESHOLD - 1):
            response = client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")


class TestExecuteEndpointAuth(unittest.IsolatedAsyncioTestCase):
    def test_missing_token(self) -> None:
        response = client.post("/execute", json={"run_id": "r1"})
        self.assertEqual(response.status_code, 401)

    def test_invalid_token(self) -> None:
        response = client.post("/execute", json={"run_id": "r1"}, headers={"x-internal-service-token": "bad"})
        self.assertEqual(response.status_code, 401)

    def test_misconfigured_secret(self) -> None:
        with patch(
            "main.verify_internal_service_token",
            side_effect=RuntimeError("INTERNAL_SERVICE_AUTH_SECRET_RUNTIME_EXECUTE not set"),
        ):
            response = client.post("/execute", json={"run_id": "r1"}, headers={"x-internal-service-token": "tok"})
        self.assertEqual(response.status_code, 500)


class TestExecuteEndpointPayloadValidation(unittest.IsolatedAsyncioTestCase):
    def test_invalid_json(self) -> None:
        with patch("main.verify_internal_service_token", return_value=True):
            response = client.post("/execute", content=b"not json", headers={"x-internal-service-token": "tok"})
        self.assertEqual(response.status_code, 400)

    def test_missing_run_id(self) -> None:
        with patch("main.verify_internal_service_token", return_value=True):
            response = client.post("/execute", json={}, headers={"x-internal-service-token": "tok"})
        self.assertEqual(response.status_code, 400)


class TestExecuteEndpointRunLookup(unittest.IsolatedAsyncioTestCase):
    def test_run_not_found(self) -> None:
        with patch("main.verify_internal_service_token", return_value=True), patch("main.get_db") as mock_get_db:
            db = Mock()
            db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = (
                MagicMock(data=[])
            )
            mock_get_db.return_value = db
            response = client.post("/execute", json={"run_id": "r1"}, headers={"x-internal-service-token": "tok"})
        self.assertEqual(response.status_code, 404)

    def test_run_not_dispatchable(self) -> None:
        with patch("main.verify_internal_service_token", return_value=True), patch("main.get_db") as mock_get_db:
            db = Mock()
            db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = (
                MagicMock(data=[{"id": "r1", "program_id": "p1", "status": "completed"}])
            )
            mock_get_db.return_value = db
            response = client.post("/execute", json={"run_id": "r1"}, headers={"x-internal-service-token": "tok"})
        self.assertEqual(response.status_code, 409)

    def test_program_not_found(self) -> None:
        with patch("main.verify_internal_service_token", return_value=True), patch("main.get_db") as mock_get_db:
            db = Mock()
            db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute = Mock(
                side_effect=[
                    MagicMock(data=[{"id": "r1", "program_id": "p1", "status": "running"}]),
                    MagicMock(data=[]),
                ]
            )
            mock_get_db.return_value = db
            response = client.post("/execute", json={"run_id": "r1"}, headers={"x-internal-service-token": "tok"})
        self.assertEqual(response.status_code, 404)

    def test_processing_restricted(self) -> None:
        with (
            patch("main.verify_internal_service_token", return_value=True),
            patch("main.get_db") as mock_get_db,
            patch("main.is_processing_restricted", return_value=True),
        ):
            db = Mock()
            db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute = Mock(
                side_effect=[
                    MagicMock(data=[{"id": "r1", "program_id": "p1", "status": "running"}]),
                    MagicMock(data=[{"id": "p1", "user_id": "u1", "schema": {}, "workspace_id": "w1"}]),
                ]
            )
            mock_get_db.return_value = db
            response = client.post("/execute", json={"run_id": "r1"}, headers={"x-internal-service-token": "tok"})
        self.assertEqual(response.status_code, 423)

    def test_policy_blocks(self) -> None:
        with (
            patch("main.verify_internal_service_token", return_value=True),
            patch("main.get_db") as mock_get_db,
            patch("main.is_processing_restricted", return_value=False),
            patch("main.validate_schema_policy", return_value=[{"reason": "blocked"}]),
            patch("main.update_run", new=AsyncMock()),
        ):
            db = Mock()
            db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute = Mock(
                side_effect=[
                    MagicMock(data=[{"id": "r1", "program_id": "p1", "status": "running"}]),
                    MagicMock(data=[{"id": "p1", "user_id": "u1", "schema": {}, "workspace_id": "w1"}]),
                ]
            )
            mock_get_db.return_value = db
            response = client.post("/execute", json={"run_id": "r1"}, headers={"x-internal-service-token": "tok"})
        self.assertEqual(response.status_code, 422)

    def test_success(self) -> None:
        with (
            patch("main.verify_internal_service_token", return_value=True),
            patch("main.get_db") as mock_get_db,
            patch("main.is_processing_restricted", return_value=False),
            patch("main.validate_schema_policy", return_value=[]),
            patch("main._run_program", new=AsyncMock()) as mock_run,
        ):
            db = Mock()
            db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute = Mock(
                side_effect=[
                    MagicMock(data=[{"id": "r1", "program_id": "p1", "status": "running"}]),
                    MagicMock(data=[{"id": "p1", "user_id": "u1", "schema": {}, "workspace_id": "w1"}]),
                ]
            )
            mock_get_db.return_value = db
            response = client.post(
                "/execute",
                json={"run_id": "r1", "trigger_payload": {"x": 1}},
                headers={"x-internal-service-token": "tok"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "started")
        self.assertEqual(response.json()["run_id"], "r1")
        mock_run.assert_called_once()


class TestRunProgram(unittest.IsolatedAsyncioTestCase):
    async def test_success(self) -> None:
        schema = {
            "version": "1.0",
            "program_id": "p1",
            "program_name": "Test",
            "execution_mode": "autonomous",
            "nodes": [],
            "edges": [],
            "triggers": [],
            "version_history": [],
            "metadata": {},
        }
        with (
            patch("main.get_db"),
            patch("main.ProgramExecutor") as mock_executor_cls,
            patch("main.update_run", new=AsyncMock()),
            patch("main.release_run_locks", new=AsyncMock()),
            patch("main._notify_complete", new=AsyncMock()),
        ):
            executor = Mock()
            executor.execute = AsyncMock()
            executor.run_telemetry_payload.return_value = {}
            executor.retention_expiry = "2026-01-01T00:00:00+00:00"
            mock_executor_cls.return_value = executor
            await _run_program(schema, "r1", "p1", "u1", {"x": 1})
        self.assertEqual(mock_executor_cls.call_count, 1)

    async def test_timeout(self) -> None:
        schema = {
            "version": "1.0",
            "program_id": "p1",
            "program_name": "Test",
            "execution_mode": "autonomous",
            "nodes": [],
            "edges": [],
            "triggers": [],
            "version_history": [],
            "metadata": {},
        }
        with (
            patch("main.get_db"),
            patch("main.ProgramExecutor") as mock_executor_cls,
            patch("main.update_run", new=AsyncMock()),
            patch("main.release_run_locks", new=AsyncMock()),
            patch("main._notify_complete", new=AsyncMock()),
        ):
            executor = Mock()
            executor.execute = AsyncMock(side_effect=TimeoutError("timeout"))
            executor.run_telemetry_payload.return_value = {}
            executor.retention_expiry = "2026-01-01T00:00:00+00:00"
            mock_executor_cls.return_value = executor
            await _run_program(schema, "r1", "p1", "u1", {"x": 1})

    async def test_execution_error(self) -> None:
        from engine.executor import ExecutionError

        schema = {
            "version": "1.0",
            "program_id": "p1",
            "program_name": "Test",
            "execution_mode": "autonomous",
            "nodes": [],
            "edges": [],
            "triggers": [],
            "version_history": [],
            "metadata": {},
        }
        with (
            patch("main.get_db"),
            patch("main.ProgramExecutor") as mock_executor_cls,
            patch("main.update_run", new=AsyncMock()),
            patch("main.release_run_locks", new=AsyncMock()),
            patch("main._notify_complete", new=AsyncMock()),
        ):
            executor = Mock()
            executor.execute = AsyncMock(side_effect=ExecutionError("FAIL", "boom"))
            executor.run_telemetry_payload.return_value = {}
            executor.retention_expiry = "2026-01-01T00:00:00+00:00"
            mock_executor_cls.return_value = executor
            await _run_program(schema, "r1", "p1", "u1", {"x": 1})

    async def test_generic_exception(self) -> None:
        schema = {
            "version": "1.0",
            "program_id": "p1",
            "program_name": "Test",
            "execution_mode": "autonomous",
            "nodes": [],
            "edges": [],
            "triggers": [],
            "version_history": [],
            "metadata": {},
        }
        with (
            patch("main.get_db"),
            patch("main.ProgramExecutor") as mock_executor_cls,
            patch("main.update_run", new=AsyncMock()),
            patch("main.release_run_locks", new=AsyncMock()),
            patch("main._notify_complete", new=AsyncMock()),
        ):
            executor = Mock()
            executor.execute = AsyncMock(side_effect=RuntimeError("boom"))
            executor.run_telemetry_payload.return_value = {}
            executor.retention_expiry = "2026-01-01T00:00:00+00:00"
            mock_executor_cls.return_value = executor
            await _run_program(schema, "r1", "p1", "u1", {"x": 1})


class _FakeApprovalExecutor:
    """Stands in for ProgramExecutor in _run_with_active_timeout tests: a
    controllable active_execution_seconds()/is_paused_for_human_input()
    pair plus a real coroutine for execute(), instead of a Mock (whose
    execute() would resolve on the very first event-loop tick, before the
    watchdog's polling loop ever gets to run)."""

    def __init__(self, sleep_seconds: float, *, paused: bool, limit_seconds: float | None) -> None:
        self._sleep_seconds = sleep_seconds
        self._paused = paused
        self._limit_seconds = limit_seconds

    async def execute(self, trigger_payload: Any) -> str:
        await asyncio.sleep(self._sleep_seconds)
        return "done"

    def active_execution_seconds(self) -> float:
        # Deliberately far over any sane limit -- the paused/unlimited tests
        # assert the watchdog does NOT cancel despite this.
        return 10_000.0

    def active_execution_limit_seconds(self) -> float | None:
        return self._limit_seconds

    def is_paused_for_human_input(self) -> bool:
        return self._paused


class TestRunWithActiveTimeout(unittest.IsolatedAsyncioTestCase):
    """Covers the bug: a run blocked on a Human Approval gate (or
    corelyx.ask_user, or a file-operation wait) must not be killed by the
    active-execution watchdog just because the wait is long -- only a node
    hung *outside* such a wait, with no plan-level max_execution_time left,
    should be cancelled."""

    async def test_paused_run_is_not_cancelled_even_over_budget(self) -> None:
        executor = _FakeApprovalExecutor(sleep_seconds=0.08, paused=True, limit_seconds=0.01)
        with patch.object(main_module, "_WATCHDOG_POLL_SECONDS", 0.02):
            result = await _run_with_active_timeout(executor, {})
        self.assertEqual(result, "done")

    async def test_unpaused_run_over_budget_is_cancelled(self) -> None:
        executor = _FakeApprovalExecutor(sleep_seconds=5.0, paused=False, limit_seconds=0.01)
        with patch.object(main_module, "_WATCHDOG_POLL_SECONDS", 0.02):
            with self.assertRaises(asyncio.TimeoutError) as ctx:
                await _run_with_active_timeout(executor, {})
        self.assertIn("0.01", str(ctx.exception))

    async def test_unlimited_plan_never_cancels(self) -> None:
        executor = _FakeApprovalExecutor(sleep_seconds=0.05, paused=False, limit_seconds=None)
        with patch.object(main_module, "_WATCHDOG_POLL_SECONDS", 0.02):
            result = await _run_with_active_timeout(executor, {})
        self.assertEqual(result, "done")


class TestNotifyComplete(unittest.IsolatedAsyncioTestCase):
    async def test_success(self) -> None:
        with patch("httpx.AsyncClient") as mock_client:
            instance = Mock()
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=None)
            instance.post = AsyncMock(return_value=Mock(status_code=200))
            mock_client.return_value = instance
            await _notify_complete("r1", "p1", "u1", "completed")
            instance.post.assert_called_once()

    async def test_exception_caught(self) -> None:
        with patch("httpx.AsyncClient") as mock_client:
            instance = Mock()
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=None)
            instance.post = AsyncMock(side_effect=ConnectionError("down"))
            mock_client.return_value = instance
            await _notify_complete("r1", "p1", "u1", "completed")

    async def test_includes_error_message_when_provided(self) -> None:
        with patch("httpx.AsyncClient") as mock_client:
            instance = Mock()
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=None)
            instance.post = AsyncMock(return_value=Mock(status_code=200))
            mock_client.return_value = instance
            await _notify_complete("r1", "p1", "u1", "failed", "boom")
            sent_body = json.loads(instance.post.call_args.kwargs["content"])
        self.assertEqual(sent_body["error_message"], "boom")

    async def test_omits_error_message_when_none(self) -> None:
        with patch("httpx.AsyncClient") as mock_client:
            instance = Mock()
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=None)
            instance.post = AsyncMock(return_value=Mock(status_code=200))
            mock_client.return_value = instance
            await _notify_complete("r1", "p1", "u1", "completed")
            sent_body = json.loads(instance.post.call_args.kwargs["content"])
        self.assertNotIn("error_message", sent_body)


class TestTriggerWorkflow(unittest.IsolatedAsyncioTestCase):
    async def test_program_not_found(self) -> None:
        with patch("main.get_db") as mock_get_db:
            db = Mock()
            db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = (
                MagicMock(data=None)
            )
            mock_get_db.return_value = db
            await trigger_workflow("w1")

    async def test_processing_restricted(self) -> None:
        with (
            patch("main.get_db") as mock_get_db,
            patch("main.is_processing_restricted", return_value=True),
            patch("main.update_run", new=AsyncMock()),
            patch("main._notify_complete", new=AsyncMock()),
        ):
            db = Mock()
            db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = (
                MagicMock(data={"id": "w1", "schema": {}, "user_id": "u1", "workspace_id": "ws1"})
            )
            db.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[{"id": "r1"}])
            mock_get_db.return_value = db
            await trigger_workflow("w1")

    async def test_policy_blocks(self) -> None:
        with (
            patch("main.get_db") as mock_get_db,
            patch("main.is_processing_restricted", return_value=False),
            patch("main.validate_schema_policy", return_value=[{"reason": "block"}]),
            patch("main.update_run", new=AsyncMock()),
            patch("main._notify_complete", new=AsyncMock()),
        ):
            db = Mock()
            db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = (
                MagicMock(data={"id": "w1", "schema": {}, "user_id": "u1", "workspace_id": "ws1"})
            )
            db.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[{"id": "r1"}])
            mock_get_db.return_value = db
            await trigger_workflow("w1")

    async def test_success(self) -> None:
        with (
            patch("main.get_db") as mock_get_db,
            patch("main.is_processing_restricted", return_value=False),
            patch("main.validate_schema_policy", return_value=[]),
            patch("main.ProgramExecutor") as mock_executor_cls,
            patch("main.update_run", new=AsyncMock()),
            patch("main.release_run_locks", new=AsyncMock()),
            patch("main._notify_complete", new=AsyncMock()),
        ):
            db = Mock()
            db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = (
                MagicMock(data={"id": "w1", "schema": {}, "user_id": "u1", "workspace_id": "ws1"})
            )
            db.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[{"id": "r1"}])
            mock_get_db.return_value = db
            executor = Mock()
            executor.execute = AsyncMock()
            executor.run_telemetry_payload.return_value = {}
            mock_executor_cls.return_value = executor
            await trigger_workflow("w1")

    async def test_execution_error(self) -> None:
        from engine.executor import ExecutionError

        with (
            patch("main.get_db") as mock_get_db,
            patch("main.is_processing_restricted", return_value=False),
            patch("main.validate_schema_policy", return_value=[]),
            patch("main.ProgramExecutor") as mock_executor_cls,
            patch("main.update_run", new=AsyncMock()),
            patch("main.release_run_locks", new=AsyncMock()),
            patch("main._notify_complete", new=AsyncMock()),
        ):
            db = Mock()
            db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = (
                MagicMock(data={"id": "w1", "schema": {}, "user_id": "u1", "workspace_id": "ws1"})
            )
            db.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[{"id": "r1"}])
            mock_get_db.return_value = db
            executor = Mock()
            executor.execute = AsyncMock(side_effect=ExecutionError("FAIL", "boom"))
            executor.run_telemetry_payload.return_value = {}
            mock_executor_cls.return_value = executor
            await trigger_workflow("w1")

    async def test_generic_exception(self) -> None:
        with (
            patch("main.get_db") as mock_get_db,
            patch("main.is_processing_restricted", return_value=False),
            patch("main.validate_schema_policy", return_value=[]),
            patch("main.ProgramExecutor") as mock_executor_cls,
            patch("main.update_run", new=AsyncMock()),
            patch("main.release_run_locks", new=AsyncMock()),
            patch("main._notify_complete", new=AsyncMock()),
        ):
            db = Mock()
            db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = (
                MagicMock(data={"id": "w1", "schema": {}, "user_id": "u1", "workspace_id": "ws1"})
            )
            db.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[{"id": "r1"}])
            mock_get_db.return_value = db
            executor = Mock()
            executor.execute = AsyncMock(side_effect=RuntimeError("boom"))
            executor.run_telemetry_payload.return_value = {}
            mock_executor_cls.return_value = executor
            await trigger_workflow("w1")


class TestLifespan(unittest.IsolatedAsyncioTestCase):
    async def test_registers_only_the_web_cron_heartbeat(self) -> None:
        fake_scheduler = Mock()
        with patch("main.scheduler", fake_scheduler), patch("main.close_llm_client", new=AsyncMock()):
            async with main_module.lifespan(app):
                pass

        fake_scheduler.add_job.assert_called_once_with(
            main_module._cron_tick,
            "interval",
            seconds=60,
            max_instances=1,
            coalesce=True,
            id="cron-heartbeat",
            replace_existing=True,
        )
        fake_scheduler.start.assert_called_once_with()
        fake_scheduler.shutdown.assert_called_once_with(wait=False)


class TestCronHeartbeat(unittest.IsolatedAsyncioTestCase):
    async def test_follows_canonical_host_redirects(self) -> None:
        import httpx

        client_options: dict[str, Any] = {}
        requests: list[httpx.Request] = []
        real_async_client = httpx.AsyncClient

        def handle(request: httpx.Request) -> httpx.Response:
            requests.append(request)
            if request.url.host == "corelyx.app":
                return httpx.Response(
                    308,
                    headers={"location": "https://www.corelyx.app/api/internal/cron/tick"},
                )
            return httpx.Response(200, json={"fired": 0})

        def make_client(**kwargs: Any) -> httpx.AsyncClient:
            client_options.update(kwargs)
            return real_async_client(transport=httpx.MockTransport(handle), **kwargs)

        with (
            patch.dict(os.environ, {"NEXTJS_INTERNAL_URL": "https://corelyx.app"}),
            patch("httpx.AsyncClient", side_effect=make_client),
            patch("main.build_internal_service_headers", return_value={"x-internal-service-token": "signed"}),
        ):
            await _cron_tick()

        self.assertEqual([request.url.host for request in requests], ["corelyx.app", "www.corelyx.app"])
        self.assertEqual(requests[-1].method, "POST")
        self.assertEqual(requests[-1].content, b"{}")
        self.assertEqual(requests[-1].headers["x-internal-service-token"], "signed")
        self.assertFalse(client_options.get("follow_redirects"))
        self.assertEqual(client_options.get("timeout"), 55)

    async def test_rejects_cross_site_redirects_without_forwarding_token(self) -> None:
        import httpx

        requests: list[httpx.Request] = []
        real_async_client = httpx.AsyncClient

        def handle(request: httpx.Request) -> httpx.Response:
            requests.append(request)
            return httpx.Response(
                308,
                headers={"location": "https://attacker.example/api/internal/cron/tick"},
            )

        def make_client(**kwargs: Any) -> httpx.AsyncClient:
            return real_async_client(transport=httpx.MockTransport(handle), **kwargs)

        with (
            patch.dict(os.environ, {"NEXTJS_INTERNAL_URL": "https://corelyx.app"}),
            patch("httpx.AsyncClient", side_effect=make_client),
            patch("main.build_internal_service_headers", return_value={"x-internal-service-token": "signed"}),
        ):
            await _cron_tick()

        self.assertEqual([request.url.host for request in requests], ["corelyx.app"])


class TestExecuteRequestModel(unittest.TestCase):
    def test_minimal(self) -> None:
        req = ExecuteRequest(run_id="r1")
        self.assertEqual(req.run_id, "r1")
        self.assertIsNone(req.program_id)
        self.assertIsNone(req.user_id)
        self.assertIsNone(req.workflow_schema)
        self.assertIsNone(req.trigger_payload)
        self.assertEqual(req.triggered_by, "manual")
        self.assertEqual(req.connections, {})

    def test_with_schema_alias(self) -> None:
        req = ExecuteRequest.model_validate({"run_id": "r1", "schema": {"nodes": []}})
        self.assertEqual(req.workflow_schema, {"nodes": []})


if __name__ == "__main__":
    unittest.main()
