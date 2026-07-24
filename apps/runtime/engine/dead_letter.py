"""
Dead Letter Queue for Corelyx Runtime Engine.

Provides enqueue, list, retrigger, and purge operations for failed node executions.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Optional

from db import get_db
from schema import ProgramSchema

logger = logging.getLogger(__name__)


@dataclass
class DeadLetterEntry:
    """Represents a dead letter queue entry."""

    id: str
    program_id: str
    run_id: str
    node_id: str
    node_type: str
    node_config: dict
    input_data: dict
    error_message: str
    error_type: str
    attempt_count: int
    retry_policy: dict
    created_at: datetime
    updated_at: datetime
    retried_at: Optional[datetime] = None
    retry_count: int = 0
    last_error: Optional[str] = None
    status: str = "pending"  # pending, retried, resolved, purged
    metadata: dict = field(default_factory=dict)


class DeadLetterQueue:
    """
    Dead Letter Queue for failed node executions.

    Provides operations to enqueue failed executions, list entries,
    retrigger failed nodes, and purge old entries.
    """

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
        now = datetime.utcnow()

        db = await self._get_db()

        query = """
            INSERT INTO dead_letter_entries (
                id, program_id, run_id, node_id, node_type, node_config,
                input_data, error_message, error_type, attempt_count,
                retry_policy, created_at, updated_at, status, metadata
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
            )
            RETURNING id
        """

        await db.execute(
            query,
            entry_id,
            program_id,
            run_id,
            node_id,
            node_type,
            json.dumps(node_config),
            json.dumps(input_data),
            error_message,
            error_type,
            attempt_count,
            json.dumps(retry_policy),
            now,
            now,
            "pending",
            json.dumps(metadata or {}),
        )

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

    async def list(
        self,
        program_id: Optional[str] = None,
        run_id: Optional[str] = None,
        node_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[DeadLetterEntry]:
        """
        List dead letter entries with optional filters.

        Args:
            program_id: Filter by program ID.
            run_id: Filter by run ID.
            node_id: Filter by node ID.
            status: Filter by status (pending, retried, resolved, purged).
            limit: Maximum number of entries to return.
            offset: Offset for pagination.

        Returns:
            List of DeadLetterEntry objects.
        """
        db = await self._get_db()

        conditions = []
        params = []
        param_idx = 1

        if program_id:
            conditions.append(f"program_id = ${param_idx}")
            params.append(program_id)
            param_idx += 1

        if run_id:
            conditions.append(f"run_id = ${param_idx}")
            params.append(run_id)
            param_idx += 1

        if node_id:
            conditions.append(f"node_id = ${param_idx}")
            params.append(node_id)
            param_idx += 1

        if status:
            conditions.append(f"status = ${param_idx}")
            params.append(status)
            param_idx += 1

        where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""

        query = f"""
            SELECT id, program_id, run_id, node_id, node_type, node_config,
                   input_data, error_message, error_type, attempt_count,
                   retry_policy, created_at, updated_at, retried_at,
                   retry_count, last_error, status, metadata
            FROM dead_letter_entries
            {where_clause}
            ORDER BY created_at DESC
            LIMIT ${param_idx} OFFSET ${param_idx + 1}
        """

        params.extend([limit, offset])

        rows = await db.fetch(query, *params)

        return [self._row_to_entry(row) for row in rows]

    async def get(self, entry_id: str) -> Optional[DeadLetterEntry]:
        """Get a single dead letter entry by ID."""
        db = await self._get_db()

        row = await db.fetchrow(
            """
            SELECT id, program_id, run_id, node_id, node_type, node_config,
                   input_data, error_message, error_type, attempt_count,
                   retry_policy, created_at, updated_at, retried_at,
                   retry_count, last_error, status, metadata
            FROM dead_letter_entries
            WHERE id = $1
            """,
            entry_id,
        )

        if not row:
            return None

        return self._row_to_entry(row)

    async def retrigger(self, entry_id: str, run_id: Optional[str] = None) -> DeadLetterEntry:
        """
        Retrigger a failed node execution by creating a new run.

        Args:
            entry_id: ID of the dead letter entry to retrigger.
            run_id: Optional new run ID to associate with the retrigger.
                   If not provided, a new run will be created.

        Returns:
            Updated DeadLetterEntry with status 'retried'.
        """
        import uuid

        db = await self._get_db()

        entry = await self.get(entry_id)
        if not entry:
            raise ValueError(f"Dead letter entry {entry_id} not found")

        if entry.status == "retried":
            logger.warning(
                "dead_letter_already_retried",
                extra={"entry_id": entry_id},
            )

        # Get the program schema
        program = await db.fetchrow(
            "SELECT schema FROM programs WHERE id = $1", entry.program_id
        )
        if not program:
            raise ValueError(f"Program {entry.program_id} not found")

        program_schema = ProgramSchema(**program["schema"])

        # Find the node in the program
        node = next((n for n in program_schema.nodes if n.id == entry.node_id), None)
        if not node:
            raise ValueError(f"Node {entry.node_id} not found in program {entry.program_id}")

        # Create a new run or use provided run_id
        new_run_id = run_id or str(uuid.uuid4())
        now = datetime.utcnow()

        # Create node execution record for the new run
        await db.execute(
            """
            INSERT INTO node_executions (id, run_id, node_id, status, input_data, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            """,
            str(uuid.uuid4()),
            new_run_id,
            entry.node_id,
            "pending",
            entry.input_data,
            now,
        )

        # Update dead letter entry
        await db.execute(
            """
            UPDATE dead_letter_entries
            SET status = 'retried', retried_at = $1, retry_count = retry_count + 1,
                updated_at = $1
            WHERE id = $2
            """,
            now,
            entry_id,
        )

        # Update run status if new run
        if not run_id:
            await db.execute(
                """
                INSERT INTO runs (id, program_id, status, created_at, trigger_type)
                VALUES ($1, $2, $3, $4, $5)
                """,
                new_run_id,
                entry.program_id,
                "running",
                now,
                "retrigger",
            )

        logger.info(
            "dead_letter_retriggered",
            extra={
                "entry_id": entry_id,
                "new_run_id": new_run_id,
                "node_id": entry.node_id,
            },
        )

        # Return updated entry
        entry = await self.get(entry_id)
        if entry is None:
            raise ValueError(f"Dead letter entry {entry_id} not found after retrigger")
        return entry

    async def purge(self, entry_id: str) -> bool:
        """
        Purge (soft delete) a dead letter entry.

        Args:
            entry_id: ID of the entry to purge.

        Returns:
            True if entry was purged, False if not found.
        """
        db = await self._get_db()

        result = await db.execute(
            """
            UPDATE dead_letter_entries
            SET status = 'purged', updated_at = $1
            WHERE id = $2 AND status != 'purged'
            """,
            datetime.utcnow(),
            entry_id,
        )

        purged = result == "UPDATE 1"

        if purged:
            logger.info("dead_letter_purged", extra={"entry_id": entry_id})
        else:
            logger.warning("dead_letter_purge_not_found", extra={"entry_id": entry_id})

        return purged

    async def purge_old(self, older_than_days: int = 30) -> int:
        """
        Purge all entries older than specified days.

        Args:
            older_than_days: Entries older than this many days will be purged.

        Returns:
            Number of entries purged.
        """
        db = await self._get_db()

        result = await db.execute(
            """
            UPDATE dead_letter_entries
            SET status = 'purged', updated_at = $1
            WHERE created_at < $2 AND status != 'purged'
            """,
            datetime.utcnow(),
            datetime.utcnow() - timedelta(days=older_than_days),
        )

        count = int(result.split()[-1]) if result.startswith("UPDATE") else 0

        logger.info("dead_letter_purge_old", extra={"count": count, "older_than_days": older_than_days})

        return count

    async def resolve(self, entry_id: str, resolution_note: str = "") -> bool:
        """
        Mark a dead letter entry as resolved (manually handled).

        Args:
            entry_id: ID of the entry to resolve.
            resolution_note: Optional note about the resolution.

        Returns:
            True if entry was resolved, False if not found.
        """
        db = await self._get_db()

        result = await db.execute(
            """
            UPDATE dead_letter_entries
            SET status = 'resolved', updated_at = $1,
                metadata = jsonb_set(COALESCE(metadata, '{}'), '{resolution_note}', $2)
            WHERE id = $3 AND status != 'resolved'
            """,
            datetime.utcnow(),
            json.dumps(resolution_note),
            entry_id,
        )

        resolved = result == "UPDATE 1"

        if resolved:
            logger.info("dead_letter_resolved", extra={"entry_id": entry_id, "resolution_note": resolution_note})

        return resolved

    async def get_stats(self, program_id: Optional[str] = None) -> dict:
        """
        Get statistics about dead letter queue.

        Args:
            program_id: Optional program ID to filter stats.

        Returns:
            Dictionary with stats.
        """
        db = await self._get_db()

        where = "WHERE program_id = $1" if program_id else ""
        params = [program_id] if program_id else []

        query = f"""
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COUNT(*) FILTER (WHERE status = 'retried') as retried,
                COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
                COUNT(*) FILTER (WHERE status = 'purged') as purged,
                MAX(created_at) as oldest_entry,
                MIN(created_at) as newest_entry
            FROM dead_letter_entries
            {where}
        """

        row = await db.fetchrow(query, *params)

        return {
            "total": row["total"],
            "pending": row["pending"],
            "retried": row["retried"],
            "resolved": row["resolved"],
            "purged": row["purged"],
            "oldest_entry": row["oldest_entry"].isoformat() if row["oldest_entry"] else None,
            "newest_entry": row["newest_entry"].isoformat() if row["newest_entry"] else None,
        }

    def _row_to_entry(self, row: dict) -> DeadLetterEntry:
        """Convert database row to DeadLetterEntry."""
        return DeadLetterEntry(
            id=row["id"],
            program_id=row["program_id"],
            run_id=row["run_id"],
            node_id=row["node_id"],
            node_type=row["node_type"],
            node_config=json.loads(row["node_config"]) if row["node_config"] else {},
            input_data=json.loads(row["input_data"]) if row["input_data"] else {},
            error_message=row["error_message"],
            error_type=row["error_type"],
            attempt_count=row["attempt_count"],
            retry_policy=json.loads(row["retry_policy"]) if row["retry_policy"] else {},
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            retried_at=row["retried_at"],
            retry_count=row["retry_count"],
            last_error=row["last_error"],
            status=row["status"],
            metadata=json.loads(row["metadata"]) if row["metadata"] else {},
        )


async def get_dead_letter_queue(db_pool=None) -> DeadLetterQueue:
    """Factory function to get a DeadLetterQueue instance."""
    return DeadLetterQueue(db_pool)