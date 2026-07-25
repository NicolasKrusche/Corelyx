from __future__ import annotations

import asyncio
import unittest
from datetime import datetime, timezone, timedelta

from db import cleanup_stale_locks


def _iso(dt: datetime) -> str:
    return dt.isoformat()


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    """Minimal chainable stand-in for the supabase query builder, scoped to
    the exact call chains cleanup_stale_locks uses."""

    def __init__(self, table: "_FakeTable", op: str):
        self._table = table
        self._op = op  # "select" | "delete"
        self._filters: list = []

    # filters
    def lt(self, col, val):
        self._filters.append(("lt", col, val))
        return self

    def in_(self, col, vals):
        self._filters.append(("in", col, set(vals)))
        return self

    def _matches(self, row) -> bool:
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
            return _Result(rows)
        # select: return projected copies (cleanup only reads keys it asked for)
        return _Result([dict(r) for r in rows])


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


class CleanupStaleLocksTests(unittest.TestCase):
    def _run(self, locks, runs):
        client = _FakeClient(locks, runs)
        deleted = asyncio.run(cleanup_stale_locks(client))
        return deleted, client._tables["resource_locks"].rows

    def test_deletes_time_expired_locks(self):
        past = _iso(datetime.now(timezone.utc) - timedelta(minutes=5))
        future = _iso(datetime.now(timezone.utc) + timedelta(minutes=20))
        locks = [
            {"id": "l1", "locked_by_run_id": "r1", "expires_at": past},
            {"id": "l2", "locked_by_run_id": "r2", "expires_at": future},
        ]
        runs = [
            {"id": "r1", "status": "running", "started_at": _iso(datetime.now(timezone.utc))},
            {"id": "r2", "status": "running", "started_at": _iso(datetime.now(timezone.utc))},
        ]
        deleted, remaining = self._run(locks, runs)
        self.assertEqual(deleted, 1)
        self.assertEqual([r["id"] for r in remaining], ["l2"])

    def test_deletes_lock_held_by_terminal_run(self):
        future = _iso(datetime.now(timezone.utc) + timedelta(minutes=20))
        locks = [{"id": "l1", "locked_by_run_id": "r1", "expires_at": future}]
        runs = [{"id": "r1", "status": "failed", "started_at": _iso(datetime.now(timezone.utc))}]
        deleted, remaining = self._run(locks, runs)
        self.assertEqual(deleted, 1)
        self.assertEqual(remaining, [])

    def test_deletes_lock_held_by_missing_run(self):
        future = _iso(datetime.now(timezone.utc) + timedelta(minutes=20))
        locks = [{"id": "l1", "locked_by_run_id": "ghost", "expires_at": future}]
        deleted, remaining = self._run(locks, [])
        self.assertEqual(deleted, 1)
        self.assertEqual(remaining, [])

    def test_deletes_lock_held_by_long_dead_running_run(self):
        future = _iso(datetime.now(timezone.utc) + timedelta(minutes=20))
        # Must clear the new 60-min orphan window (which covers the 30-min paid
        # active ceiling with margin) to still count as orphaned.
        stale_start = _iso(datetime.now(timezone.utc) - timedelta(minutes=90))
        locks = [{"id": "l1", "locked_by_run_id": "r1", "expires_at": future}]
        runs = [{"id": "r1", "status": "running", "started_at": stale_start}]
        deleted, remaining = self._run(locks, runs)
        self.assertEqual(deleted, 1)
        self.assertEqual(remaining, [])

    def test_keeps_lock_held_by_active_recent_run(self):
        future = _iso(datetime.now(timezone.utc) + timedelta(minutes=20))
        recent = _iso(datetime.now(timezone.utc) - timedelta(seconds=30))
        locks = [{"id": "l1", "locked_by_run_id": "r1", "expires_at": future}]
        runs = [{"id": "r1", "status": "running", "started_at": recent}]
        deleted, remaining = self._run(locks, runs)
        self.assertEqual(deleted, 0)
        self.assertEqual([r["id"] for r in remaining], ["l1"])

    def test_keeps_lock_for_long_run_with_fresh_watcher_heartbeat(self):
        """R13: a run started well past the orphan window but actively watched
        (fresh heartbeat, e.g. paused on a long approval) must NOT be reaped."""
        future = _iso(datetime.now(timezone.utc) + timedelta(minutes=20))
        old_start = _iso(datetime.now(timezone.utc) - timedelta(hours=3))
        fresh_beat = _iso(datetime.now(timezone.utc) - timedelta(seconds=20))
        locks = [{"id": "l1", "locked_by_run_id": "r1", "expires_at": future}]
        runs = [
            {
                "id": "r1",
                "status": "running",
                "started_at": old_start,
                "watcher_heartbeat_at": fresh_beat,
            }
        ]
        deleted, remaining = self._run(locks, runs)
        self.assertEqual(deleted, 0)
        self.assertEqual([r["id"] for r in remaining], ["l1"])

    def test_reaps_long_run_with_stale_watcher_heartbeat(self):
        """A stale heartbeat (watcher died) does not save an over-age run's lock."""
        future = _iso(datetime.now(timezone.utc) + timedelta(minutes=20))
        old_start = _iso(datetime.now(timezone.utc) - timedelta(hours=3))
        stale_beat = _iso(datetime.now(timezone.utc) - timedelta(minutes=30))
        locks = [{"id": "l1", "locked_by_run_id": "r1", "expires_at": future}]
        runs = [
            {
                "id": "r1",
                "status": "running",
                "started_at": old_start,
                "watcher_heartbeat_at": stale_beat,
            }
        ]
        deleted, remaining = self._run(locks, runs)
        self.assertEqual(deleted, 1)
        self.assertEqual(remaining, [])


if __name__ == "__main__":
    unittest.main()
