"""
Dead-letter queue: the runtime's write path for nodes that exhaust their retries.

Reading, retriggering and purging entries are NOT here — they live in the web
app (apps/web/app/api/programs/[id]/dead-letter/route.ts, backed by the
admin_retrigger_dead_letter RPC), which is what the product actually calls.
This module used to carry its own list/get/retrigger/purge/resolve/get_stats
alongside them, written against asyncpg (`db.execute("… $1, $2", …)`) while
get_db() returns a Supabase client. None of them could ever have run, and
nothing imported them — so they were removed rather than ported, leaving one
implementation of each operation instead of a working one and a broken one.
"""

from __future__ import annotations

import logging
from typing import Optional

from db import get_db

logger = logging.getLogger(__name__)


class DeadLetterQueue:
    """Records failed node executions in the dead_letter_entries table."""

    def __init__(self, db_pool=None):
        self.db_pool = db_pool

    async def _get_db(self):
        """Get database connection."""
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
                "node_config": node_config or {},
                "input_data": input_data or {},
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
