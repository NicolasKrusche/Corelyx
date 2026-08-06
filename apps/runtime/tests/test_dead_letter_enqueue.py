"""Dead-letter enqueue path: the branch taken when a node exhausts its retries
and its policy says the run should keep going (fail_program_on_exhaust=False).
"""

from __future__ import annotations

import asyncio
import inspect
import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from engine.dead_letter import DeadLetterQueue, get_dead_letter_queue
from engine.executor import ProgramExecutor

os.environ.setdefault("SUPABASE_URL", "http://localhost")
os.environ.setdefault("SUPABASE_KEY", "test-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")


def _fake_supabase() -> tuple[Mock, Mock]:
    """A Supabase client stub that records the insert payload."""
    insert = Mock()
    insert.execute = Mock(return_value=SimpleNamespace(data=[{"id": "entry-1"}]))
    table = Mock()
    table.insert = Mock(return_value=insert)
    client = Mock()
    client.table = Mock(return_value=table)
    return client, table


class TestDeadLetterFactory(unittest.TestCase):
    def test_factory_is_a_coroutine_function(self) -> None:
        # Regression: the executor called get_dead_letter_queue() without
        # awaiting it, so `dlq` was a coroutine and the enqueue below raised
        # "'coroutine' object has no attribute 'enqueue'" — which then replaced
        # the node's real error in the run log.
        self.assertTrue(inspect.iscoroutinefunction(get_dead_letter_queue))
        queue = asyncio.run(get_dead_letter_queue())
        self.assertIsInstance(queue, DeadLetterQueue)


class TestDeadLetterEnqueue(unittest.TestCase):
    def test_writes_through_the_supabase_table_api(self) -> None:
        # get_db() returns a Supabase client, not an asyncpg pool — the old
        # `db.execute("INSERT ... $1", ...)` call could never have worked.
        client, table = _fake_supabase()
        queue = DeadLetterQueue(db_pool=client)

        entry_id = asyncio.run(
            queue.enqueue(
                program_id="prog-1",
                run_id="run-1",
                node_id="loop-emails",
                node_type="step",
                node_config={"foo": "bar"},
                input_data={"emails": []},
                error=ValueError("upstream exploded"),
                attempt_count=3,
                retry_policy={"max_attempts": 3},
                metadata={"final_outcome": "exhausted"},
            )
        )

        client.table.assert_called_once_with("dead_letter_entries")
        payload = table.insert.call_args[0][0]
        self.assertEqual(payload["id"], entry_id)
        self.assertEqual(payload["run_id"], "run-1")
        self.assertEqual(payload["node_id"], "loop-emails")
        self.assertEqual(payload["error_type"], "ValueError")
        self.assertEqual(payload["error_message"], "upstream exploded")
        self.assertEqual(payload["status"], "pending")

    def test_jsonb_columns_stay_objects(self) -> None:
        # Pre-serializing these would store a JSON *string* in a JSONB column,
        # so the dead-letter UI would render escaped text instead of a payload.
        client, table = _fake_supabase()
        queue = DeadLetterQueue(db_pool=client)

        asyncio.run(
            queue.enqueue(
                program_id="prog-1",
                run_id="run-1",
                node_id="n1",
                node_type="step",
                node_config={"a": 1},
                input_data={"b": 2},
                error=RuntimeError("boom"),
                attempt_count=1,
                retry_policy={"max_attempts": 1},
            )
        )

        payload = table.insert.call_args[0][0]
        self.assertEqual(payload["node_config"], {"a": 1})
        self.assertEqual(payload["input_data"], {"b": 2})
        self.assertEqual(payload["retry_policy"], {"max_attempts": 1})
        self.assertEqual(payload["metadata"], {})


class TestEnqueueNeverMasksTheRealError(unittest.TestCase):
    """A bookkeeping failure must not become the error the user sees."""

    def _call(self, dlq: Mock) -> bool:
        executor = SimpleNamespace(program_id="prog-1", run_id="run-1")
        node = SimpleNamespace(id="loop-emails", type="step", config={})
        retry_result = SimpleNamespace(
            attempt_count=3,
            final_outcome=SimpleNamespace(value="exhausted"),
            total_duration=1.5,
        )
        retry_policy = SimpleNamespace(
            max_attempts=3,
            backoff_type=SimpleNamespace(value="exponential"),
            backoff_base_seconds=1,
            fail_program_on_exhaust=False,
            timeout_per_attempt_seconds=30,
            timeout_total_seconds=300,
        )

        async def run() -> bool:
            with unittest.mock.patch(
                "engine.executor.get_dead_letter_queue",
                AsyncMock(return_value=dlq),
            ):
                return await ProgramExecutor._enqueue_dead_letter(
                    executor,
                    node,
                    {"emails": []},
                    ValueError("the real failure"),
                    retry_result,
                    retry_policy,
                )

        return asyncio.run(run())

    def test_reports_success_when_the_entry_is_written(self) -> None:
        dlq = Mock()
        dlq.enqueue = AsyncMock(return_value="entry-1")
        self.assertTrue(self._call(dlq))
        self.assertEqual(dlq.enqueue.call_args.kwargs["node_id"], "loop-emails")

    def test_swallows_an_enqueue_failure_instead_of_raising(self) -> None:
        dlq = Mock()
        dlq.enqueue = AsyncMock(side_effect=RuntimeError("dlq table missing"))
        # Must return False rather than propagate: the caller is inside the
        # failed-open branch, and a raise there surfaces the DLQ's error as the
        # run's error message instead of the node's own.
        self.assertFalse(self._call(dlq))


if __name__ == "__main__":
    unittest.main()
