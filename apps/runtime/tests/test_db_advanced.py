from __future__ import annotations

import asyncio
import os
import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import db as db_module


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


class _QueryBuilder:
    """Minimal chainable stand-in for the Supabase query builder."""

    def __init__(self):
        self.execute = MagicMock()
        self.select = MagicMock(return_value=self)
        self.insert = MagicMock(return_value=self)
        self.update = MagicMock(return_value=self)
        self.delete = MagicMock(return_value=self)
        self.eq = MagicMock(return_value=self)
        self.single = MagicMock(return_value=self)
        self.maybe_single = MagicMock(return_value=self)
        self.limit = MagicMock(return_value=self)
        self.gt = MagicMock(return_value=self)
        self.lt = MagicMock(return_value=self)
        self.in_ = MagicMock(return_value=self)

    def __getattr__(self, name):
        return lambda *args, **kwargs: self


def _make_db():
    client = MagicMock()
    client.table.return_value = _QueryBuilder()
    client.rpc.return_value = _QueryBuilder()
    return client


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class GetDbTests(unittest.TestCase):
    @patch.dict(
        os.environ,
        {"SUPABASE_URL": "https://test.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": "test-key"},
        clear=True,
    )
    @patch("db.create_client")
    def test_get_db_success(self, mock_create_client):
        mock_client = MagicMock()
        mock_create_client.return_value = mock_client
        client = db_module.get_db()
        mock_create_client.assert_called_once_with("https://test.supabase.co", "test-key")
        self.assertEqual(client, mock_client)

    @patch.dict(os.environ, {}, clear=True)
    def test_get_db_missing_url_raises(self):
        with self.assertRaises(KeyError):
            db_module.get_db()

    @patch.dict(os.environ, {"SUPABASE_URL": "https://test.supabase.co"}, clear=True)
    def test_get_db_missing_key_raises(self):
        with self.assertRaises(KeyError):
            db_module.get_db()


class CreateRunTests(unittest.TestCase):
    def _run(self, db, trigger_payload=None):
        return asyncio.run(db_module.create_run(db, "prog-1", "user-1", "manual", trigger_payload))

    def test_create_run_success(self):
        db = _make_db()
        db.table.return_value.execute.return_value = MagicMock(data=[{"id": "run-1", "status": "running"}])
        result = self._run(db, trigger_payload={"key": "value"})
        self.assertEqual(result["id"], "run-1")
        db.table.assert_called_once_with("runs")
        payload = db.table.return_value.insert.call_args[0][0]
        self.assertEqual(payload["program_id"], "prog-1")
        self.assertEqual(payload["triggered_by"], "manual")
        self.assertEqual(payload["status"], "running")

    def test_create_run_no_data_raises_runtime_error(self):
        db = _make_db()
        db.table.return_value.execute.return_value = MagicMock(data=[])
        with self.assertRaises(RuntimeError) as ctx:
            self._run(db, trigger_payload={"key": "value"})
        self.assertIn("no data", str(ctx.exception).lower())

    def test_create_run_none_trigger_payload(self):
        db = _make_db()
        db.table.return_value.execute.return_value = MagicMock(data=[{"id": "run-1"}])
        result = self._run(db, trigger_payload=None)
        self.assertEqual(result["id"], "run-1")
        payload = db.table.return_value.insert.call_args[0][0]
        self.assertIsNone(payload["trigger_payload"])


class UpdateRunTests(unittest.TestCase):
    def _run(self, db, **kwargs):
        return asyncio.run(db_module.update_run(db, "run-1", **kwargs))

    def test_update_run_success(self):
        db = _make_db()
        db.table.return_value.execute.return_value = MagicMock(data=[{"id": "run-1"}], error=None)
        self._run(db, status="completed")
        db.table.assert_called_with("runs")
        db.table.return_value.update.assert_called_once_with({"status": "completed"})
        db.table.return_value.eq.assert_called_with("id", "run-1")

    def test_update_run_missing_column_error_fallback(self):
        exc = Exception("column prompt_tokens does not exist")
        db = _make_db()
        db.table.return_value.execute.side_effect = [
            exc,
            MagicMock(data=[{"id": "run-1"}], error=None),
        ]
        self._run(db, status="completed", prompt_tokens=10)
        self.assertEqual(db.table.return_value.update.call_count, 2)
        second_call = db.table.return_value.update.call_args_list[1]
        self.assertNotIn("prompt_tokens", second_call[0][0])

    def test_update_run_missing_column_error_no_fallback_needed(self):
        exc = Exception("column prompt_tokens does not exist")
        db = _make_db()
        db.table.return_value.execute.side_effect = exc
        with self.assertRaises(Exception) as ctx:
            self._run(db, prompt_tokens=10)
        self.assertIn("does not exist", str(ctx.exception))
        self.assertEqual(db.table.return_value.update.call_count, 1)

    def test_update_run_non_missing_column_error_raises(self):
        exc = Exception("connection refused")
        db = _make_db()
        db.table.return_value.execute.side_effect = exc
        with self.assertRaises(Exception) as ctx:
            self._run(db, status="failed")
        self.assertIn("connection refused", str(ctx.exception))

    def test_update_run_result_error_with_fallback(self):
        result_with_error = MagicMock(data=None, error="some error")
        result_ok = MagicMock(data=[{"id": "run-1"}], error=None)
        db = _make_db()
        db.table.return_value.execute.side_effect = [result_with_error, result_ok]
        self._run(db, status="completed", prompt_tokens=10)
        self.assertEqual(db.table.return_value.update.call_count, 2)

    def test_update_run_result_error_no_fallback(self):
        result_with_error = MagicMock(data=None, error="some error")
        db = _make_db()
        db.table.return_value.execute.return_value = result_with_error
        self._run(db, status="completed")
        self.assertEqual(db.table.return_value.update.call_count, 1)

    def test_update_run_result_error_fallback_same_kwargs(self):
        result_with_error = MagicMock(data=None, error="some error")
        db = _make_db()
        db.table.return_value.execute.return_value = result_with_error
        self._run(db, prompt_tokens=10)
        self.assertEqual(db.table.return_value.update.call_count, 1)


class GetRunStatusTests(unittest.TestCase):
    def _run(self, db):
        return asyncio.run(db_module.get_run_status(db, "run-1"))

    def test_get_run_status_success(self):
        db = _make_db()
        db.table.return_value.execute.return_value = MagicMock(data={"status": "running"})
        status = self._run(db)
        self.assertEqual(status, "running")

    def test_get_run_status_empty_data_returns_unknown(self):
        db = _make_db()
        db.table.return_value.execute.return_value = MagicMock(data={})
        status = self._run(db)
        self.assertEqual(status, "unknown")

    def test_get_run_status_none_data_raises_attribute_error(self):
        db = _make_db()
        db.table.return_value.execute.return_value = MagicMock(data=None)
        with self.assertRaises(AttributeError):
            self._run(db)


class TouchRunWatcherHeartbeatTests(unittest.TestCase):
    """touch_run_watcher_heartbeat is called from inside long approval/
    ask_user/file-op waits (see engine/executor.py) -- it must never raise,
    even if the column is missing (migration not yet applied) or the DB call
    otherwise fails, since that would abort the wait it's meant to be a
    best-effort side channel for."""

    def _run(self, db):
        return asyncio.run(db_module.touch_run_watcher_heartbeat(db, "run-1"))

    def test_touch_heartbeat_success(self):
        db = _make_db()
        self._run(db)
        # Renews both the run heartbeat and (R13) this run's resource-lock TTL,
        # so assert across all calls rather than just the last one.
        db.table.assert_any_call("runs")
        db.table.assert_any_call("resource_locks")
        update_payloads = [c.args[0] for c in db.table.return_value.update.call_args_list]
        self.assertTrue(any("watcher_heartbeat_at" in p for p in update_payloads))
        self.assertTrue(any("expires_at" in p for p in update_payloads))

    def test_touch_heartbeat_swallows_db_error(self):
        db = _make_db()
        db.table.return_value.execute.side_effect = RuntimeError("column watcher_heartbeat_at does not exist")
        self._run(db)  # must not raise


class CreateNodeExecutionTests(unittest.TestCase):
    def _run(self, db):
        return asyncio.run(db_module.create_node_execution(db, "run-1", "node-1"))

    def test_create_node_execution_existing_returns_existing(self):
        existing = [{"id": "ne-1", "run_id": "run-1", "node_id": "node-1"}]
        db = _make_db()
        db.table.return_value.execute.return_value = MagicMock(data=existing)
        result = self._run(db)
        self.assertEqual(result["id"], "ne-1")
        db.table.return_value.insert.assert_not_called()

    def test_create_node_execution_new_success(self):
        db = _make_db()
        db.table.return_value.execute.side_effect = [
            MagicMock(data=[]),
            MagicMock(data=[{"id": "ne-2", "run_id": "run-1", "node_id": "node-1"}]),
        ]
        result = self._run(db)
        self.assertEqual(result["id"], "ne-2")
        db.table.return_value.insert.assert_called_once()

    def test_create_node_execution_duplicate_error_recheck_success(self):
        err = Exception("unique constraint violation 23505")
        db = _make_db()
        db.table.return_value.execute.side_effect = [
            MagicMock(data=[]),
            err,
            MagicMock(data=[{"id": "ne-3", "run_id": "run-1", "node_id": "node-1"}]),
        ]
        result = self._run(db)
        self.assertEqual(result["id"], "ne-3")

    def test_create_node_execution_duplicate_error_recheck_missing_raises(self):
        err = Exception("unique constraint violation")
        db = _make_db()
        db.table.return_value.execute.side_effect = [
            MagicMock(data=[]),
            err,
            MagicMock(data=[]),
        ]
        with self.assertRaises(RuntimeError) as ctx:
            self._run(db)
        self.assertIn("missing after conflict", str(ctx.exception))

    def test_create_node_execution_other_error_raises(self):
        err = Exception("connection refused")
        db = _make_db()
        db.table.return_value.execute.side_effect = [
            MagicMock(data=[]),
            err,
        ]
        with self.assertRaises(Exception) as ctx:
            self._run(db)
        self.assertIn("connection refused", str(ctx.exception))


class UpdateNodeExecutionTests(unittest.TestCase):
    def _run(self, db, **kwargs):
        return asyncio.run(db_module.update_node_execution(db, "run-1", "node-1", **kwargs))

    def test_update_node_execution_success(self):
        db = _make_db()
        db.table.return_value.execute.return_value = MagicMock(data=[{"id": "ne-1"}], error=None)
        self._run(db, status="completed")
        db.table.assert_called_with("node_executions")

    def test_update_node_execution_with_input_payload(self):
        db = _make_db()
        db.table.return_value.execute.return_value = MagicMock(data=[{"id": "ne-1"}], error=None)
        self._run(db, input_payload={"email": "test@example.com"})
        call_kwargs = db.table.return_value.update.call_args[0][0]
        self.assertIn("input_hash", call_kwargs)
        self.assertIn("input_payload", call_kwargs)

    def test_update_node_execution_with_output_payload(self):
        db = _make_db()
        db.table.return_value.execute.return_value = MagicMock(data=[{"id": "ne-1"}], error=None)
        self._run(db, output_payload={"result": "ok"})
        call_kwargs = db.table.return_value.update.call_args[0][0]
        self.assertIn("output_hash", call_kwargs)
        self.assertIn("output_payload", call_kwargs)

    def test_update_node_execution_missing_column_fallback(self):
        exc = Exception("column total_tokens does not exist")
        db = _make_db()
        db.table.return_value.execute.side_effect = [
            exc,
            MagicMock(data=[{"id": "ne-1"}], error=None),
        ]
        self._run(db, status="completed", total_tokens=5)
        self.assertEqual(db.table.return_value.update.call_count, 2)
        second_call = db.table.return_value.update.call_args_list[1]
        self.assertNotIn("total_tokens", second_call[0][0])

    def test_update_node_execution_result_error_fallback(self):
        result_err = MagicMock(data=None, error="some error")
        result_ok = MagicMock(data=[{"id": "ne-1"}], error=None)
        db = _make_db()
        db.table.return_value.execute.side_effect = [result_err, result_ok]
        self._run(db, status="completed", total_tokens=5)
        self.assertEqual(db.table.return_value.update.call_count, 2)

    def test_update_node_execution_non_missing_error_raises(self):
        exc = Exception("connection refused")
        db = _make_db()
        db.table.return_value.execute.side_effect = exc
        with self.assertRaises(Exception) as ctx:
            self._run(db, status="failed")
        self.assertIn("connection refused", str(ctx.exception))


class GetExistingLockTests(unittest.TestCase):
    def _run(self, db):
        return asyncio.run(db_module.get_existing_lock(db, "connection", "conn-1"))

    def test_get_existing_lock_found(self):
        db = _make_db()
        db.table.return_value.execute.return_value = MagicMock(data={"id": "lock-1", "locked_by_run_id": "run-1"})
        result = self._run(db)
        self.assertEqual(result["id"], "lock-1")

    def test_get_existing_lock_not_found(self):
        db = _make_db()
        db.table.return_value.execute.return_value = MagicMock(data=None)
        result = self._run(db)
        self.assertIsNone(result)

    def test_get_existing_lock_none_result_object(self):
        # Simulate execute() returning None directly
        db = _make_db()
        db.table.return_value.execute.return_value = None
        result = self._run(db)
        self.assertIsNone(result)


class AcquireResourceLockTests(unittest.TestCase):
    def _run(self, db):
        return asyncio.run(db_module.acquire_resource_lock(db, "run-1", "connection", "conn-1"))

    def test_acquire_resource_lock_success(self):
        db = _make_db()
        db.table.return_value.execute.return_value = MagicMock(data=[{"id": "lock-1"}])
        acquired = self._run(db)
        self.assertTrue(acquired)

    def test_acquire_resource_lock_conflict_returns_false(self):
        err = Exception("duplicate key value violates unique constraint")
        db = _make_db()
        db.table.return_value.execute.side_effect = err
        acquired = self._run(db)
        self.assertFalse(acquired)

    def test_acquire_resource_lock_other_error_raises(self):
        err = Exception("connection refused")
        db = _make_db()
        db.table.return_value.execute.side_effect = err
        with self.assertRaises(RuntimeError) as ctx:
            self._run(db)
        self.assertIn("acquire_resource_lock failed", str(ctx.exception))


class CleanupStaleLocksTests(unittest.TestCase):
    def _run(self, locks, runs):
        class _Query:
            def __init__(self, table, op):
                self._table = table
                self._op = op
                self._filters = []

            def lt(self, col, val):
                self._filters.append(("lt", col, val))
                return self

            def in_(self, col, vals):
                self._filters.append(("in", col, set(vals)))
                return self

            def _matches(self, row):
                for kind, col, val in self._filters:
                    if kind == "lt" and not (row.get(col) is not None and row[col] < val):
                        return False
                    if kind == "in" and row.get(col) not in val:
                        return False
                return True

            def execute(self):
                rows = [r for r in self._table.rows if self._matches(r)]
                if self._op == "delete":
                    for r in rows:
                        self._table.rows.remove(r)
                    return MagicMock(data=rows)
                return MagicMock(data=[dict(r) for r in rows])

        class _FakeTable:
            def __init__(self, rows):
                self.rows = rows

            def select(self, _cols):
                return _Query(self, "select")

            def delete(self):
                return _Query(self, "delete")

        class _FakeClient:
            def __init__(self, locks, runs):
                self._tables = {
                    "resource_locks": _FakeTable(locks),
                    "runs": _FakeTable(runs),
                }

            def table(self, name):
                return self._tables[name]

        client = _FakeClient(locks, runs)
        deleted = asyncio.run(db_module.cleanup_stale_locks(client))
        return deleted, client._tables["resource_locks"].rows

    def test_cleanup_deletes_expired_locks(self):
        past = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        future = (datetime.now(timezone.utc) + timedelta(minutes=20)).isoformat()
        locks = [
            {"id": "l1", "locked_by_run_id": "r1", "expires_at": past},
            {"id": "l2", "locked_by_run_id": "r2", "expires_at": future},
        ]
        runs = [
            {"id": "r1", "status": "running", "started_at": datetime.now(timezone.utc).isoformat()},
            {"id": "r2", "status": "running", "started_at": datetime.now(timezone.utc).isoformat()},
        ]
        deleted, remaining = self._run(locks, runs)
        self.assertEqual(deleted, 1)
        self.assertEqual([r["id"] for r in remaining], ["l2"])

    def test_cleanup_deletes_terminal_run_lock(self):
        future = (datetime.now(timezone.utc) + timedelta(minutes=20)).isoformat()
        locks = [{"id": "l1", "locked_by_run_id": "r1", "expires_at": future}]
        runs = [{"id": "r1", "status": "failed", "started_at": datetime.now(timezone.utc).isoformat()}]
        deleted, remaining = self._run(locks, runs)
        self.assertEqual(deleted, 1)
        self.assertEqual(remaining, [])

    def test_cleanup_keeps_active_run_lock(self):
        future = (datetime.now(timezone.utc) + timedelta(minutes=20)).isoformat()
        recent = (datetime.now(timezone.utc) - timedelta(seconds=30)).isoformat()
        locks = [{"id": "l1", "locked_by_run_id": "r1", "expires_at": future}]
        runs = [{"id": "r1", "status": "running", "started_at": recent}]
        deleted, remaining = self._run(locks, runs)
        self.assertEqual(deleted, 0)
        self.assertEqual([r["id"] for r in remaining], ["l1"])

    def test_cleanup_no_remaining_after_expired(self):
        past = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        locks = [{"id": "l1", "locked_by_run_id": "r1", "expires_at": past}]
        runs = []
        deleted, remaining = self._run(locks, runs)
        self.assertEqual(deleted, 1)
        self.assertEqual(remaining, [])


class GetCredentialTests(unittest.TestCase):
    @patch("db.get_db")
    def test_get_credential_success(self, mock_get_db):
        mock_db = _make_db()
        mock_db.table.return_value.execute.return_value = MagicMock(data={"secret": "shh"})
        mock_db.rpc.return_value.execute.return_value = MagicMock(data={"secret": "shh"})
        mock_get_db.return_value = mock_db
        result = asyncio.run(db_module.get_credential("ref-1", "user-1"))
        self.assertEqual(result, {"secret": "shh"})
        mock_db.rpc.assert_called_once_with("get_decrypted_secret", {"secret_name": "ref-1_user-1"})

    @patch("db.get_db")
    def test_get_credential_not_found_raises(self, mock_get_db):
        mock_db = _make_db()
        mock_db.rpc.return_value.execute.return_value = MagicMock(data=None)
        mock_get_db.return_value = mock_db
        with self.assertRaises(ValueError) as ctx:
            asyncio.run(db_module.get_credential("ref-1", "user-1"))
        self.assertIn("not found", str(ctx.exception))

    @patch("db.get_db")
    def test_get_credential_empty_data_raises(self, mock_get_db):
        mock_db = _make_db()
        mock_db.rpc.return_value.execute.return_value = MagicMock(data="")
        mock_get_db.return_value = mock_db
        with self.assertRaises(ValueError) as ctx:
            asyncio.run(db_module.get_credential("ref-1", "user-1"))
        self.assertIn("not found", str(ctx.exception))


class GetUserRunPlanTests(unittest.TestCase):
    def _run(self, db):
        return db_module.get_user_run_plan(db, "user-1")

    def test_get_user_run_plan_unlimited(self):
        db = _make_db()
        db.table.return_value.execute.return_value = MagicMock(data=[{"tier": "unlimited", "is_admin": False}])
        plan = self._run(db)
        self.assertEqual(plan, "unlimited")

    def test_get_user_run_plan_admin(self):
        db = _make_db()
        db.table.return_value.execute.return_value = MagicMock(data=[{"tier": "free", "is_admin": True}])
        plan = self._run(db)
        self.assertEqual(plan, "unlimited")

    def test_get_user_run_plan_paid(self):
        db = _make_db()
        db.table.return_value.execute.return_value = MagicMock(data=[{"tier": "pro", "is_admin": False}])
        plan = self._run(db)
        self.assertEqual(plan, "paid")

    def test_get_user_run_plan_free(self):
        db = _make_db()
        db.table.return_value.execute.return_value = MagicMock(data=[{"tier": "free", "is_admin": False}])
        plan = self._run(db)
        self.assertEqual(plan, "free")

    def test_get_user_run_plan_no_rows(self):
        db = _make_db()
        db.table.return_value.execute.return_value = MagicMock(data=[])
        plan = self._run(db)
        self.assertEqual(plan, "free")

    def test_get_user_run_plan_exception_fallback(self):
        db = _make_db()
        db.table.return_value.execute.side_effect = Exception("connection refused")
        plan = self._run(db)
        self.assertEqual(plan, "free")

    def test_get_user_run_plan_empty_user_id(self):
        db = MagicMock()
        plan = db_module.get_user_run_plan(db, "")
        self.assertEqual(plan, "free")


class GetModelAccessTierTests(unittest.TestCase):
    def _db(self, profile_rows, workspace_rows):
        db = MagicMock()
        profile_query = _QueryBuilder()
        profile_query.execute.return_value = MagicMock(data=profile_rows)
        workspace_query = _QueryBuilder()
        workspace_query.execute.return_value = MagicMock(data=workspace_rows)
        db.table.side_effect = lambda table: profile_query if table == "profiles" else workspace_query
        return db

    def test_uses_workspace_tier_for_members(self):
        db = self._db(
            [{"tier": "free", "is_admin": False}],
            [{"tier": "pro"}],
        )
        self.assertEqual(
            db_module.get_model_access_tier(db, "user-1", "workspace-1"),
            "pro",
        )

    def test_admin_is_unlimited_even_in_free_workspace(self):
        db = self._db(
            [{"tier": "free", "is_admin": True}],
            [{"tier": "free"}],
        )
        self.assertEqual(
            db_module.get_model_access_tier(db, "user-1", "workspace-1"),
            "unlimited",
        )

    def test_missing_workspace_tier_fails_closed(self):
        db = self._db(
            [{"tier": "builder", "is_admin": False}],
            [],
        )
        self.assertEqual(
            db_module.get_model_access_tier(db, "user-1", "workspace-1"),
            "free",
        )


class IsProcessingRestrictedTests(unittest.TestCase):
    def _run(self, db):
        return db_module.is_processing_restricted(db, "user-1")

    def test_is_processing_restricted_true(self):
        db = _make_db()
        db.table.return_value.execute.return_value = MagicMock(data=[{"processing_restricted": True}])
        result = self._run(db)
        self.assertTrue(result)

    def test_is_processing_restricted_false(self):
        db = _make_db()
        db.table.return_value.execute.return_value = MagicMock(data=[{"processing_restricted": False}])
        result = self._run(db)
        self.assertFalse(result)

    def test_is_processing_restricted_no_rows(self):
        db = _make_db()
        db.table.return_value.execute.return_value = MagicMock(data=[])
        result = self._run(db)
        self.assertFalse(result)


class AsyncMockUsageTests(unittest.TestCase):
    """Smoke tests that exercise AsyncMock in the test suite."""

    def test_async_mock_can_be_used_for_async_dependencies(self):
        coro = AsyncMock(return_value={"async": "value"})
        result = asyncio.run(coro())
        self.assertEqual(result, {"async": "value"})


class EnqueueFileOperationDeviceAuthTests(unittest.IsolatedAsyncioTestCase):
    """The cross-tenant backstop: a file op may only target a device that belongs
    to the run's own workspace."""

    async def _enqueue(self, db, device_id, workspace_id="ws-1"):
        return await db_module.enqueue_file_operation(
            db,
            run_id="run-1",
            node_execution_id=None,
            device_id=device_id,
            workspace_id=workspace_id,
            user_id="user-1",
            op_type="read",
            args={"path": "/x"},
        )

    async def test_rejects_device_in_another_workspace(self):
        db = _make_db()
        # devices ownership lookup returns no row → device not in this workspace.
        db.table.return_value.execute.return_value = MagicMock(data=[])
        with self.assertRaises(ValueError):
            await self._enqueue(db, "device-other")
        db.table.return_value.insert.assert_not_called()

    async def test_rejects_missing_device(self):
        db = _make_db()
        with self.assertRaises(ValueError):
            await self._enqueue(db, None)
        db.table.return_value.insert.assert_not_called()

    async def test_allows_device_in_workspace(self):
        db = _make_db()
        db.table.return_value.execute.side_effect = [
            MagicMock(data=[{"id": "device-1", "platform": "windows"}]),  # ownership check passes
            MagicMock(data=[{"id": "op-1"}]),  # file_operations insert
        ]
        row = await self._enqueue(db, "device-1")
        self.assertEqual(row["id"], "op-1")
        db.table.return_value.insert.assert_called_once()


if __name__ == "__main__":
    unittest.main()
