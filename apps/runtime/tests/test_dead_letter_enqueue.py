"""Dead-letter enqueue path: the branch taken when a node exhausts its retries
and its policy says the run should keep going (fail_program_on_exhaust=False).
"""

from __future__ import annotations

import asyncio
import inspect
import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from schema import HttpConnectionConfig, RetryConfig, StepConfig, parse_schema
from engine.dead_letter import MAX_DLQ_PAYLOAD_CHARS, DeadLetterQueue, get_dead_letter_queue
from engine.executor import ProgramExecutor, _serialize_node_config

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
        # FULL verbosity so the input survives verbatim and the comparison is
        # against the exact payload rather than a metadata summary.
        client, table = _fake_supabase()
        queue = DeadLetterQueue(db_pool=client)

        with patch.dict(os.environ, {"EXECUTION_LOG_VERBOSITY": "FULL"}):
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


def _enqueue(**overrides) -> dict:
    """Run a real enqueue against a stub client and return the inserted row."""
    client, table = _fake_supabase()
    kwargs = {
        "program_id": "prog-1",
        "run_id": "run-1",
        "node_id": "n1",
        "node_type": "step",
        "node_config": {},
        "input_data": {},
        "error": RuntimeError("boom"),
        "attempt_count": 1,
        "retry_policy": {"max_attempts": 1},
    }
    kwargs.update(overrides)
    asyncio.run(DeadLetterQueue(db_pool=client).enqueue(**kwargs))
    return table.insert.call_args[0][0]


class TestDeadLetterPayloadPolicy(unittest.TestCase):
    """The DLQ used to write the node's raw input verbatim — no redaction, no
    verbosity gate, no size cap — while every other payload write went through
    apply_execution_log_policy. A single failure could therefore persist the
    tokens that the node_executions row for that same failure had scrubbed.
    """

    def test_secrets_in_the_input_are_redacted(self) -> None:
        with patch.dict(os.environ, {"EXECUTION_LOG_VERBOSITY": "FULL"}):
            payload = _enqueue(
                input_data={
                    "access_token": "ya29.super-secret-value",
                    "nested": {"api_key": "sk-live-abcdefghijklmnop"},
                    "note": "Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345",
                    "kept": "ordinary value",
                }
            )

        stored = payload["input_data"]
        self.assertEqual(stored["access_token"], "[redacted]")
        self.assertEqual(stored["nested"]["api_key"], "[redacted]")
        self.assertNotIn("abcdefghijklmnopqrstuvwxyz012345", stored["note"])
        # Redaction must not swallow the diagnostic value of the entry.
        self.assertEqual(stored["kept"], "ordinary value")

    def test_secrets_in_the_node_config_are_redacted(self) -> None:
        # HttpConnectionConfig carries auth_value, and its header list can hold a
        # bearer token — both would otherwise land in a user-visible row.
        payload = _enqueue(
            node_config={
                "url": "https://api.example.com/v1/items",
                "auth_value": "super-secret-token",
                "headers": [{"name": "Authorization", "value": "Bearer abcdefghijklmnopqrstuvwxyz012345"}],
            }
        )

        stored = payload["node_config"]
        self.assertEqual(stored["auth_value"], "[redacted]")
        self.assertNotIn("abcdefghijklmnopqrstuvwxyz012345", stored["headers"][0]["value"])
        # Config is workflow definition, not user data, so it is never
        # verbosity-gated away — the analyser needs it.
        self.assertEqual(stored["url"], "https://api.example.com/v1/items")

    def test_verbosity_metadata_only_stores_a_summary(self) -> None:
        with patch.dict(os.environ, {"EXECUTION_LOG_VERBOSITY": "METADATA_ONLY"}):
            payload = _enqueue(input_data={"customer_email": "someone@example.com"})

        stored = payload["input_data"]
        self.assertEqual(stored["_log_payload"], "metadata_only")
        self.assertNotIn("someone@example.com", str(stored))

    def test_verbosity_none_stores_nothing(self) -> None:
        with patch.dict(os.environ, {"EXECUTION_LOG_VERBOSITY": "NONE"}):
            payload = _enqueue(input_data={"customer_email": "someone@example.com"})

        self.assertEqual(payload["input_data"], {})

    def test_errors_only_does_not_blank_the_entry(self) -> None:
        # ERRORS_ONLY drops payloads for anything that is not a failure, and a
        # DLQ entry is by definition a failure — so it must still be described.
        with patch.dict(os.environ, {"EXECUTION_LOG_VERBOSITY": "ERRORS_ONLY"}):
            payload = _enqueue(input_data={"order_id": 7})

        self.assertEqual(payload["input_data"]["_log_payload"], "metadata_only")
        self.assertEqual(payload["input_data"]["keys"], ["order_id"])

    def test_oversized_input_is_capped_so_the_insert_survives(self) -> None:
        with patch.dict(os.environ, {"EXECUTION_LOG_VERBOSITY": "FULL"}):
            payload = _enqueue(input_data={"blob": "x" * (MAX_DLQ_PAYLOAD_CHARS + 5_000)})

        stored = payload["input_data"]
        self.assertEqual(stored["_dlq_payload"], "oversized")
        self.assertGreater(stored["encoded_chars"], MAX_DLQ_PAYLOAD_CHARS)
        # The replacement itself must be small, or the cap achieves nothing.
        self.assertLess(len(str(stored)), 2_000)

    def test_payload_within_the_cap_is_untouched(self) -> None:
        with patch.dict(os.environ, {"EXECUTION_LOG_VERBOSITY": "FULL"}):
            payload = _enqueue(input_data={"blob": "x" * 100})

        self.assertEqual(payload["input_data"], {"blob": "x" * 100})


class TestSerializeNodeConfig(unittest.TestCase):
    """node.config is always a plain dataclass, so the old
    `model_dump() if hasattr(...) else {}` probe never matched and every entry
    was written with an empty config.
    """

    def test_dataclass_config_is_serialized(self) -> None:
        config = HttpConnectionConfig(method="POST", url="https://api.example.com/hook")
        serialized = _serialize_node_config(config)

        self.assertNotEqual(serialized, {})
        self.assertEqual(serialized["method"], "POST")
        self.assertEqual(serialized["url"], "https://api.example.com/hook")

    def test_nested_dataclasses_are_serialized_too(self) -> None:
        config = StepConfig(logic_type="loop", retry=RetryConfig(4, "linear", 2.0, False))
        serialized = _serialize_node_config(config)

        self.assertEqual(serialized["logic_type"], "loop")
        self.assertEqual(serialized["retry"]["max_attempts"], 4)

    def test_a_config_built_by_the_real_parser_is_serialized(self) -> None:
        # The production shape: whatever _parse_node_config hands back must
        # survive, since that is the only kind of config the executor ever sees.
        schema = parse_schema(
            {
                "version": "1.0",
                "program_id": "p",
                "program_name": "P",
                "nodes": [
                    {
                        "id": "a1",
                        "type": "agent",
                        "config": {
                            "model": "gpt-4o-mini",
                            "api_key_ref": "cred-1",
                            "system_prompt": "Summarise the input.",
                        },
                    }
                ],
                "edges": [],
            }
        )
        serialized = _serialize_node_config(schema.nodes[0].config)

        self.assertNotEqual(serialized, {})
        self.assertEqual(serialized["model"], "gpt-4o-mini")
        self.assertEqual(serialized["system_prompt"], "Summarise the input.")

    def test_pydantic_style_config_still_uses_model_dump(self) -> None:
        config = SimpleNamespace(model_dump=lambda: {"from": "model_dump"})
        self.assertEqual(_serialize_node_config(config), {"from": "model_dump"})

    def test_plain_dict_config_is_passed_through(self) -> None:
        self.assertEqual(_serialize_node_config({"a": 1}), {"a": 1})

    def test_unconvertible_config_degrades_instead_of_raising(self) -> None:
        # Runs on the failure path — it must never be the thing that breaks it.
        class Exploding:
            def model_dump(self):
                raise RuntimeError("nope")

        self.assertEqual(_serialize_node_config(Exploding()), {})
        self.assertEqual(_serialize_node_config(object()), {})
        self.assertEqual(_serialize_node_config(None), {})


class TestEnqueueNeverMasksTheRealError(unittest.TestCase):
    """A bookkeeping failure must not become the error the user sees."""

    def _call(self, dlq: Mock) -> bool:
        executor = SimpleNamespace(program_id="prog-1", run_id="run-1", db=Mock())
        node = SimpleNamespace(id="loop-emails", type="step", config=StepConfig(logic_type="loop"))
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

    def test_the_real_node_config_reaches_the_queue(self) -> None:
        # The bug this covers: node.config is a dataclass, the enqueue probed for
        # a pydantic model_dump(), and so every entry was written with {} — the
        # column exists to describe the failing node, and it was always blank.
        dlq = Mock()
        dlq.enqueue = AsyncMock(return_value="entry-1")
        self.assertTrue(self._call(dlq))

        node_config = dlq.enqueue.call_args.kwargs["node_config"]
        self.assertNotEqual(node_config, {})
        self.assertEqual(node_config["logic_type"], "loop")


class TestEnqueueReusesTheRunsClient(unittest.TestCase):
    """The queue used to build a brand-new Supabase client per entry even though
    the executor's own client was right there at the call site."""

    def test_no_new_client_is_created(self) -> None:
        client, table = _fake_supabase()
        executor = SimpleNamespace(program_id="prog-1", run_id="run-1", db=client)
        node = SimpleNamespace(id="n1", type="connection", config=HttpConnectionConfig(url="https://x.example"))
        retry_result = SimpleNamespace(
            attempt_count=2,
            final_outcome=SimpleNamespace(value="exhausted"),
            total_duration=0.4,
        )
        retry_policy = SimpleNamespace(
            max_attempts=2,
            backoff_type=SimpleNamespace(value="none"),
            backoff_base_seconds=0,
            fail_program_on_exhaust=False,
            timeout_per_attempt_seconds=30,
            timeout_total_seconds=300,
        )

        async def run() -> bool:
            with patch("engine.dead_letter.get_db", side_effect=AssertionError("built a second client")):
                return await ProgramExecutor._enqueue_dead_letter(
                    executor, node, {"a": 1}, ValueError("boom"), retry_result, retry_policy
                )

        self.assertTrue(asyncio.run(run()))
        # Written through the executor's own client, end to end.
        client.table.assert_called_once_with("dead_letter_entries")
        self.assertEqual(table.insert.call_args[0][0]["node_config"]["url"], "https://x.example")


if __name__ == "__main__":
    unittest.main()
