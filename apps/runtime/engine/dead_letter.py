"""
Dead-letter queue: the runtime's write path for nodes that exhaust their retries.

Reading, retriggering and purging entries are NOT here — they live in the web
app (apps/web/app/api/programs/[id]/dead-letter/route.ts), which is what the
product actually calls. Retriggering delegates to the replay-from-node route;
the admin_retrigger_dead_letter RPC it used to call named two columns that do
not exist and was dropped in migration 20260807120000.
This module used to carry its own list/get/retrigger/purge/resolve/get_stats
alongside them, written against asyncpg (`db.execute("… $1, $2", …)`) while
get_db() returns a Supabase client. None of them could ever have run, and
nothing imported them — so they were removed rather than ported, leaving one
implementation of each operation instead of a working one and a broken one.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from db import apply_execution_log_policy, get_db, redact_secrets, summarize_payload_metadata

logger = logging.getLogger(__name__)

# A dead-letter row is the only durable record a failed-open node leaves behind,
# so an insert that fails loses the failure entirely. Oversized JSON is the way
# that happens in practice (PostgREST/httpx choke on huge bodies — the same
# hazard the node-log path sidesteps by stripping whole-state keys before
# writing, see engine/executor.py::_execute_node). Anything past this cap is
# stored as a bounded metadata summary instead of risking the write.
MAX_DLQ_PAYLOAD_CHARS = 64_000


def _bounded_payload(value: Any) -> Any:
    """Cap a JSONB payload so an oversized input can never fail the insert."""
    try:
        encoded = json.dumps(value, default=str)
    except Exception:
        return {"_dlq_payload": "unserializable", "type": type(value).__name__}
    if len(encoded) <= MAX_DLQ_PAYLOAD_CHARS:
        return value
    return {
        "_dlq_payload": "oversized",
        "encoded_chars": len(encoded),
        "summary": summarize_payload_metadata(value),
    }


class DeadLetterQueue:
    """Records failed node executions in the dead_letter_entries table."""

    def __init__(self, db_pool=None):
        self.db_pool = db_pool

    async def _get_db(self):
        """Get database connection.

        Callers that already hold a Supabase client should pass it in — building
        a fresh one per enqueue costs a client construction on the failure path
        for no benefit.
        """
        if self.db_pool:
            return self.db_pool
        return get_db()

    async def enqueue(
        self,
        program_id: str,
        run_id: str,
        node_id: str,
        node_type: str,
        node_config: dict,
        input_data: dict,
        error: Exception,
        attempt_count: int,
        retry_policy: dict,
        metadata: Optional[dict] = None,
    ) -> str:
        """
        Enqueue a failed node execution to the dead letter queue.

        Returns:
            The ID of the created dead letter entry.
        """
        import uuid

        entry_id = str(uuid.uuid4())
        error_type = type(error).__name__
        error_message = str(error)

        db = await self._get_db()

        # Same treatment every other execution-log payload gets
        # (db.update_node_execution): redact secret-bearing fields and honour
        # EXECUTION_LOG_VERBOSITY. This used to write the node's raw input
        # verbatim, so a DLQ entry could persist tokens that the node_executions
        # row for the very same failure had redacted. status="failed" is
        # intrinsic — an entry only ever describes a failure — which keeps the
        # input visible under ERRORS_ONLY.
        safe_input = _bounded_payload(apply_execution_log_policy(input_data or {}, status="failed") or {})
        # Config is workflow definition rather than user data, so it is NOT
        # verbosity-gated: describing the failing node is the column's whole
        # purpose (apps/web/lib/errors/error-analysis.ts feeds it to the failure
        # analyser). It can still carry credentials — HttpConnectionConfig has
        # auth_value, and its headers list can hold a bearer token — so it is
        # redacted.
        safe_config = _bounded_payload(redact_secrets(node_config or {}))

        # get_db() hands back a Supabase client, not an asyncpg pool — go
        # through PostgREST and let the table defaults fill created_at /
        # updated_at. JSONB columns take dicts directly; pre-serializing them
        # would store a JSON string instead of an object.
        db.table("dead_letter_entries").insert(
            {
                "id": entry_id,
                "program_id": program_id,
                "run_id": run_id,
                "node_id": node_id,
                "node_type": node_type,
                "node_config": safe_config,
                "input_data": safe_input,
                "error_message": error_message,
                "error_type": error_type,
                "attempt_count": attempt_count,
                "retry_policy": retry_policy or {},
                "status": "pending",
                "metadata": metadata or {},
            }
        ).execute()

        logger.info(
            "dead_letter_enqueued",
            extra={
                "entry_id": entry_id,
                "program_id": program_id,
                "run_id": run_id,
                "node_id": node_id,
                "error_type": error_type,
                "error_message": error_message[:200],
                "attempt_count": attempt_count,
            },
        )

        return entry_id


async def get_dead_letter_queue(db_pool=None) -> DeadLetterQueue:
    """Factory function to get a DeadLetterQueue instance."""
    return DeadLetterQueue(db_pool)
