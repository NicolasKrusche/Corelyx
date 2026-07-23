"""
Checkpointing support for runtime execution.

Provides state persistence after each node execution, enabling recovery
and resume from the last successful checkpoint.
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import Any

from db import get_db


@dataclass
class Checkpoint:
    """A checkpoint representing the state at a specific point in execution."""
    run_id: str
    checkpoint_id: str
    node_id: str
    state: dict[str, Any]
    visited_nodes: list[str]
    queue_nodes: list[str]
    created_at: float = field(default_factory=time.time)
    metadata: dict[str, Any] = field(default_factory=dict)


class CheckpointStore:
    """Manages checkpoint persistence to the database."""

    def __init__(self, run_id: str):
        self.run_id = run_id
        self.db = get_db()
        self._checkpoint_counter = 0

    async def save_checkpoint(
        self,
        node_id: str,
        state: dict[str, Any],
        visited_nodes: set[str],
        queue_nodes: list[str],
        metadata: dict[str, Any] | None = None,
    ) -> Checkpoint:
        """Save a checkpoint after node execution."""
        self._checkpoint_counter += 1
        checkpoint_id = f"{self.run_id}_cp_{self._checkpoint_counter}"

        checkpoint = Checkpoint(
            run_id=self.run_id,
            checkpoint_id=checkpoint_id,
            node_id=node_id,
            state=state,
            visited_nodes=list(visited_nodes),
            queue_nodes=queue_nodes,
            metadata=metadata or {},
        )

        try:
            # Store checkpoint in the runs table as a JSONB field
            # Using a dedicated checkpoint column or a separate table
            self.db.table("run_checkpoints").upsert(
                {
                    "run_id": self.run_id,
                    "checkpoint_id": checkpoint_id,
                    "node_id": node_id,
                    "state": state,
                    "visited_nodes": list(visited_nodes),
                    "queue_nodes": queue_nodes,
                    "metadata": metadata or {},
                    "created_at": "now()",
                }
            ).execute()
        except Exception as e:
            # If the table doesn't exist, try alternative storage
            print(f"[checkpoint] WARNING: Could not save checkpoint to DB: {e}")
            # Fallback: store in runs table as a metadata field
            try:
                self.db.table("runs").update(
                    {
                        "last_checkpoint": {
                            "checkpoint_id": checkpoint_id,
                            "node_id": node_id,
                            "visited_nodes": list(visited_nodes),
                            "queue_nodes": queue_nodes,
                        }
                    }
                ).eq("id", self.run_id).execute()
            except Exception as e2:
                print(f"[checkpoint] WARNING: Fallback checkpoint save also failed: {e2}")

        return checkpoint

    async def load_latest_checkpoint(self) -> Checkpoint | None:
        """Load the latest checkpoint for a run."""
        try:
            result = (
                self.db.table("run_checkpoints")
                .select("*")
                .eq("run_id", self.run_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if result.data:
                row = result.data[0]
                return Checkpoint(
                    run_id=row["run_id"],
                    checkpoint_id=row["checkpoint_id"],
                    node_id=row["node_id"],
                    state=row["state"],
                    visited_nodes=row["visited_nodes"],
                    queue_nodes=row["queue_nodes"],
                    created_at=row.get("created_at", time.time()),
                    metadata=row.get("metadata", {}),
                )
        except Exception as e:
            print(f"[checkpoint] WARNING: Could not load checkpoint from DB: {e}")

        # Fallback: check runs table for last_checkpoint
        try:
            result = (
                self.db.table("runs")
                .select("last_checkpoint")
                .eq("id", self.run_id)
                .single()
                .execute()
            )
            if result.data and result.data.get("last_checkpoint"):
                cp_data = result.data["last_checkpoint"]
                return Checkpoint(
                    run_id=self.run_id,
                    checkpoint_id=cp_data.get("checkpoint_id", ""),
                    node_id=cp_data.get("node_id", ""),
                    state={},
                    visited_nodes=cp_data.get("visited_nodes", []),
                    queue_nodes=cp_data.get("queue_nodes", []),
                )
        except Exception:
            pass

        return None

    async def clear_checkpoints(self) -> None:
        """Clear all checkpoints for a run."""
        try:
            self.db.table("run_checkpoints").delete().eq("run_id", self.run_id).execute()
        except Exception:
            pass


def should_checkpoint(node_type: str, output: dict[str, Any]) -> bool:
    """Determine if we should save a checkpoint after this node execution.
    
    Checkpoint after:
    - Every node execution (for recovery)
    - But skip for trigger nodes (they're fast and have no real state)
    - And skip for simple pass-through steps
    """
    if node_type == "trigger":
        return False
    # Checkpoint after most nodes for recovery capability
    return True
