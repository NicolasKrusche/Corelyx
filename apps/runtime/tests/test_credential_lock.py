"""Comprehensive tests for engine.credential_lock."""

from __future__ import annotations

import asyncio
import time
import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from engine.credential_lock import (
    CredentialLock,
    TokenRefreshManager,
    get_token_refresh_manager,
)


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    """Minimal chainable stand-in for the supabase query builder."""

    def __init__(self, table: "_FakeTable", op: str):
        self._table = table
        self._op = op
        self._filters: list = []
        self._insert_payload: dict | None = None

    def insert(self, payload: dict):
        self._insert_payload = payload
        return self

    def delete(self):
        return self

    def eq(self, col, val):
        self._filters.append(("eq", col, val))
        return self

    def lt(self, col, val):
        self._filters.append(("lt", col, val))
        return self

    def _matches(self, row) -> bool:
        for kind, col, val in self._filters:
            if kind == "eq":
                if row.get(col) != val:
                    return False
            if kind == "lt":
                if not (row.get(col) is not None and row[col] < val):
                    return False
        return True

    def execute(self):
        if self._op == "insert":
            if self._insert_payload:
                # Unique constraint simulation
                for r in self._table.rows:
                    if r.get("lock_key") == self._insert_payload.get("lock_key"):
                        raise Exception("duplicate key value violates unique constraint")
                self._table.rows.append(self._insert_payload)
                return _Result([self._insert_payload])
            return _Result([])
        if self._op == "delete":
            rows = [r for r in self._table.rows if self._matches(r)]
            for r in rows:
                self._table.rows.remove(r)
            return _Result(rows)
        return _Result([])


class _FakeTable:
    def __init__(self, rows=None):
        self.rows = rows or []

    def insert(self, payload):
        q = _Query(self, "insert")
        q._insert_payload = payload
        return q

    def delete(self):
        return _Query(self, "delete")

    def eq(self, col, val):
        return _Query(self, "delete").eq(col, val)


class _FakeClient:
    def __init__(self, locks=None):
        self._locks = _FakeTable(locks or [])

    def table(self, name):
        if name == "credential_locks":
            return self._locks
        raise KeyError(name)


class TestTokenRefreshManagerCache(unittest.TestCase):
    def setUp(self):
        self.trm = TokenRefreshManager()

    def test_get_cached_token_hit(self):
        self.trm._cache["conn1"] = ("tok123", time.time() + 300)
        token = self.trm.get_cached_token("conn1")
        self.assertEqual(token, "tok123")

    def test_get_cached_token_miss(self):
        token = self.trm.get_cached_token("missing")
        self.assertIsNone(token)

    def test_get_cached_token_expired(self):
        self.trm._cache["conn1"] = ("tok123", time.time() + 30)
        token = self.trm.get_cached_token("conn1")
        self.assertIsNone(token)
        self.assertNotIn("conn1", self.trm._cache)

    def test_cache_token(self):
        self.trm.cache_token("conn1", "tok123", expires_in=600)
        self.assertIn("conn1", self.trm._cache)
        token, expires = self.trm._cache["conn1"]
        self.assertEqual(token, "tok123")
        self.assertTrue(expires > time.time())

    def test_cache_token_uses_default_ttl_when_none(self):
        self.trm.cache_token("conn1", "tok123")
        _, expires = self.trm._cache["conn1"]
        self.assertTrue(expires <= time.time() + self.trm._cache_ttl)

    def test_invalidate_cache(self):
        self.trm._cache["conn1"] = ("tok123", time.time() + 300)
        self.trm.invalidate_cache("conn1")
        self.assertNotIn("conn1", self.trm._cache)

    def test_invalidate_cache_missing_is_noop(self):
        self.trm.invalidate_cache("missing")
        self.assertEqual(self.trm._cache, {})


class TestTokenRefreshManagerRefreshWithLock(unittest.TestCase):
    def setUp(self):
        self.trm = TokenRefreshManager()

    @patch("engine.credential_lock.get_db")
    def test_refresh_with_lock_cache_hit(self, mock_get_db):
        self.trm._cache["conn1"] = ("cached_tok", time.time() + 300)
        mock_refresh = AsyncMock(return_value="new_tok")
        result = asyncio.run(self.trm.refresh_with_lock("conn1", mock_refresh))
        self.assertEqual(result, "cached_tok")
        mock_refresh.assert_not_awaited()

    @patch("engine.credential_lock.get_db")
    def test_refresh_with_lock_calls_refresh_func(self, mock_get_db):
        fake_client = _FakeClient()
        mock_get_db.return_value = fake_client
        mock_refresh = AsyncMock(return_value="new_tok")
        result = asyncio.run(self.trm.refresh_with_lock("conn1", mock_refresh))
        self.assertEqual(result, "new_tok")
        mock_refresh.assert_awaited_once()

    @patch("engine.credential_lock.get_db")
    def test_refresh_with_lock_caches_result(self, mock_get_db):
        fake_client = _FakeClient()
        mock_get_db.return_value = fake_client
        mock_refresh = AsyncMock(return_value="new_tok")
        asyncio.run(self.trm.refresh_with_lock("conn1", mock_refresh))
        self.assertEqual(self.trm.get_cached_token("conn1"), "new_tok")

    @patch("engine.credential_lock.get_db")
    def test_refresh_with_lock_double_check_after_lock(self, mock_get_db):
        fake_client = _FakeClient()
        mock_get_db.return_value = fake_client
        # Simulate another worker caching while waiting for lock
        calls = []

        async def refresh_func():
            calls.append("refresh")
            return "refreshed"

        # Pre-populate cache after first check but inside lock (simulated by patching get_cached_token)

        def side_effect(cid):
            if not hasattr(side_effect, "called"):
                side_effect.called = True
                return None
            return "double_checked"

        with patch.object(self.trm, "get_cached_token", side_effect=side_effect):
            result = asyncio.run(self.trm.refresh_with_lock("conn1", refresh_func))
        self.assertEqual(result, "double_checked")
        self.assertEqual(calls, [])

    @patch("engine.credential_lock.get_db")
    def test_refresh_with_lock_passes_args_and_kwargs(self, mock_get_db):
        fake_client = _FakeClient()
        mock_get_db.return_value = fake_client
        mock_refresh = AsyncMock(return_value="tok")
        asyncio.run(self.trm.refresh_with_lock("conn1", mock_refresh, "arg1", key="val"))
        mock_refresh.assert_awaited_once_with("arg1", key="val")


class TestGetTokenRefreshManager(unittest.TestCase):
    def tearDown(self):
        import engine.credential_lock as cl

        cl._token_refresh_manager = None

    def test_singleton(self):
        t1 = get_token_refresh_manager()
        t2 = get_token_refresh_manager()
        self.assertIs(t1, t2)

    def test_returns_token_refresh_manager(self):
        trm = get_token_refresh_manager()
        self.assertIsInstance(trm, TokenRefreshManager)


class TestCredentialLockAcquire(unittest.TestCase):
    @patch("engine.credential_lock.get_db")
    def test_acquire_success(self, mock_get_db):
        fake_client = _FakeClient()
        mock_get_db.return_value = fake_client
        lock = CredentialLock("conn1")
        acquired = asyncio.run(lock.acquire())
        self.assertTrue(acquired)
        self.assertTrue(lock._acquired)

    @patch("engine.credential_lock.get_db")
    def test_acquire_timeout(self, mock_get_db):
        # Always conflict
        class AlwaysConflictTable(_FakeTable):
            def insert(self, payload):
                raise Exception("duplicate key value violates unique constraint")

        fake_client = MagicMock()
        fake_client.table.return_value = AlwaysConflictTable()
        mock_get_db.return_value = fake_client

        lock = CredentialLock("conn1", retry_interval=0.01, max_wait=0.05)
        acquired = asyncio.run(lock.acquire())
        self.assertFalse(acquired)

    @patch("engine.credential_lock.get_db")
    def test_acquire_cleans_up_expired_lock(self, mock_get_db):
        past = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
        fake_client = _FakeClient(locks=[{"lock_key": "cred_lock:conn1", "lock_id": "old", "expires_at": past}])
        mock_get_db.return_value = fake_client
        lock = CredentialLock("conn1", retry_interval=0.01, max_wait=0.5)
        acquired = asyncio.run(lock.acquire())
        self.assertTrue(acquired)

    @patch("engine.credential_lock.get_db")
    def test_release(self, mock_get_db):
        fake_client = _FakeClient(locks=[])
        mock_get_db.return_value = fake_client
        lock = CredentialLock("conn1")
        lock._acquired = True
        lock._lock_id = "test_id"
        asyncio.run(lock.release())
        self.assertFalse(lock._acquired)

    @patch("engine.credential_lock.get_db")
    def test_release_not_acquired_is_noop(self, mock_get_db):
        fake_client = _FakeClient(locks=[])
        mock_get_db.return_value = fake_client
        lock = CredentialLock("conn1")
        asyncio.run(lock.release())
        self.assertFalse(lock._acquired)
        mock_get_db.assert_not_called()

    @patch("engine.credential_lock.get_db")
    def test_context_manager(self, mock_get_db):
        fake_client = _FakeClient(locks=[])
        mock_get_db.return_value = fake_client

        async def ctx():
            async with CredentialLock("conn1") as lock:
                self.assertTrue(lock._acquired)

        asyncio.run(ctx())

    @patch("engine.credential_lock.get_db")
    def test_unique_constraint_retries(self, mock_get_db):
        attempts = [0]

        class _RetryQuery:
            def __init__(self, table, payload):
                self._table = table
                self._payload = payload

            def execute(self):
                attempts[0] += 1
                if attempts[0] < 2:
                    raise Exception("duplicate key value violates unique constraint")
                self._table.rows.append(self._payload)
                return _Result([self._payload])

        class RetryTable(_FakeTable):
            def insert(self, payload):
                return _RetryQuery(self, payload)

        fake_client = MagicMock()
        fake_client.table.return_value = RetryTable()
        mock_get_db.return_value = fake_client

        lock = CredentialLock("conn1", retry_interval=0.01, max_wait=0.5)
        acquired = asyncio.run(lock.acquire())
        self.assertTrue(acquired)
        self.assertEqual(attempts[0], 2)

    @patch("engine.credential_lock.get_db")
    def test_non_unique_error_propagates(self, mock_get_db):
        class FailTable(_FakeTable):
            def insert(self, payload):
                raise Exception("connection refused")

        fake_client = MagicMock()
        fake_client.table.return_value = FailTable()
        mock_get_db.return_value = fake_client

        lock = CredentialLock("conn1", retry_interval=0.01, max_wait=0.5)
        with self.assertRaises(Exception) as ctx:
            asyncio.run(lock.acquire())
        self.assertIn("connection refused", str(ctx.exception))

    @patch("engine.credential_lock.get_db")
    def test_cleanup_expired_lock_returns_true(self, mock_get_db):
        past = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
        fake_client = _FakeClient(locks=[{"lock_key": "cred_lock:conn1", "lock_id": "old", "expires_at": past}])
        mock_get_db.return_value = fake_client
        lock = CredentialLock("conn1")
        result = asyncio.run(lock._cleanup_expired_lock())
        self.assertTrue(result)

    @patch("engine.credential_lock.get_db")
    def test_cleanup_expired_lock_returns_false(self, mock_get_db):
        future = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
        fake_client = _FakeClient(locks=[{"lock_key": "cred_lock:conn1", "lock_id": "old", "expires_at": future}])
        mock_get_db.return_value = fake_client
        lock = CredentialLock("conn1")
        result = asyncio.run(lock._cleanup_expired_lock())
        self.assertFalse(result)

    @patch("engine.credential_lock.get_db")
    def test_acquire_sets_lock_key(self, mock_get_db):
        fake_client = _FakeClient(locks=[])
        mock_get_db.return_value = fake_client
        lock = CredentialLock("conn1")
        self.assertEqual(lock.lock_key, "cred_lock:conn1")

    @patch("engine.credential_lock.get_db")
    def test_lock_id_is_unique(self, mock_get_db):
        lock1 = CredentialLock("conn1")
        lock2 = CredentialLock("conn1")
        self.assertNotEqual(lock1._lock_id, lock2._lock_id)

    @patch("engine.credential_lock.get_db")
    def test_race_condition_double_check_prevents_duplicate_refresh(self, mock_get_db):
        fake_client = _FakeClient(locks=[])
        mock_get_db.return_value = fake_client
        trm = TokenRefreshManager()
        call_count = [0]

        async def slow_refresh():
            call_count[0] += 1
            await asyncio.sleep(0)
            return "new_tok"

        # First call populates cache
        result1 = asyncio.run(trm.refresh_with_lock("conn1", slow_refresh))
        self.assertEqual(result1, "new_tok")
        self.assertEqual(call_count[0], 1)

        # Second call should hit cache immediately (before lock)
        result2 = asyncio.run(trm.refresh_with_lock("conn1", slow_refresh))
        self.assertEqual(result2, "new_tok")
        self.assertEqual(call_count[0], 1)


if __name__ == "__main__":
    unittest.main()
