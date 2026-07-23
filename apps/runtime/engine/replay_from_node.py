"""Partial replay: re-execute a workflow from a specific node onward.

Takes the original program schema, a starting node, edited input data,
and pre-computed upstream outputs from the original run. Reconstructs
the execution graph, pre-seeds state for all upstream nodes, and lets
the normal ProgramExecutor topological walk handle the rest.
"""

from __future__ import annotations

import json
import time
from typing import Any, Optional

from schema import ProgramSchema, SchemaNode
from engine.executor import (
    EXECUTABLE_NODE_TYPES,
    ExecutionError,
    ProgramExecutor,
)
from engine.streaming import EventStream
from db import (
    get_db,
    update_node_execution,
    update_run,
)


def compute_upstream_nodes(
    schema: ProgramSchema,
    target_node_id: str,
) -> set[str]:
    """Return all node IDs that are ancestors of target_node_id in the graph.

    Walks backwards through edges from target_node_id to find every node
    that must complete before target_node_id can execute.
    """
    # Build reverse adjacency: for each node, which nodes have edges TO it
    incoming: dict[str, list[str]] = {}
    for edge in schema.edges:
        incoming.setdefault(edge.to, []).append(edge.from_node)

    visited: set[str] = set()
    stack = [target_node_id]
    while stack:
        current = stack.pop()
        for predecessor in incoming.get(current, []):
            if predecessor not in visited:
                visited.add(predecessor)
                stack.append(predecessor)
    return visited


def compute_execution_order(
    schema: ProgramSchema,
    start_node_id: str,
) -> list[str]:
    """Return the topological order of nodes starting from start_node_id.

    Uses BFS from the start node following outgoing edges.
    """
    edges_from: dict[str, list] = {}
    for edge in schema.edges:
        edges_from.setdefault(edge.from_node, []).append(edge)

    order: list[str] = []
    visited: set[str] = set()
    queue = [start_node_id]

    while queue:
        node_id = queue.pop(0)
        if node_id in visited:
            continue
        visited.add(node_id)
        order.append(node_id)
        for edge in edges_from.get(node_id, []):
            if edge.to not in visited:
                queue.append(edge.to)

    return order


async def replay_from_node(
    schema: ProgramSchema,
    run_id: str,
    program_id: str,
    user_id: str,
    start_node_id: str,
    start_input: dict[str, Any],
    upstream_outputs: dict[str, dict[str, Any]],
    original_run_id: str,
    connection_name_to_id: dict[str, str] | None = None,
    workspace_id: str | None = None,
    workspace_policy: dict[str, Any] | None = None,
    dry_run: bool = False,
) -> None:
    """Execute a program starting from *start_node_id* with *start_input*.

    Parameters
    ----------
    schema:
        The full program schema (same as a normal execute).
    run_id:
        The new run's ID (already inserted by the caller).
    start_node_id:
        The node at which to begin (re-)execution.
    start_input:
        Edited input payload for start_node_id.
    upstream_outputs:
        Pre-computed ``{node_id: output_payload}`` for every node that
        precedes start_node_id in the graph.  The caller fetches these
        from the original run's ``node_executions`` rows.
    original_run_id:
        The run being replayed (for provenance / logging only).
    """
    from engine.main import _run_program  # local to avoid circular import

    # Build the executor the normal way
    executor = ProgramExecutor(
        schema,
        run_id,
        program_id,
        user_id,
        connection_name_to_id=connection_name_to_id or {},
        dry_run=dry_run,
        workspace_id=workspace_id,
    )

    # Pre-seed state so _resolve_input / _execute_node see upstream outputs
    # but DON'T call execute() — we drive the walk ourselves.
    db = get_db()

    # 1. Compute which nodes are upstream of start_node_id
    upstream_ids = compute_upstream_nodes(schema, start_node_id)

    # 2. Verify the start node exists and is executable
    start_node = next((n for n in schema.nodes if n.id == start_node_id), None)
    if start_node is None:
        raise ExecutionError(
            "REPLAY_NODE_NOT_FOUND",
            f"Node '{start_node_id}' does not exist in the program schema.",
            start_node_id,
        )
    if start_node.type not in EXECUTABLE_NODE_TYPES:
        raise ExecutionError(
            "REPLAY_NODE_NOT_EXECUTABLE",
            f"Node '{start_node_id}' (type={start_node.type}) cannot be replayed.",
            start_node_id,
        )

    # 3. Create node_execution rows for all executable nodes (idempotent)
    for node in schema.nodes:
        if node.type in EXECUTABLE_NODE_TYPES:
            from db import create_node_execution
            await create_node_execution(db, run_id, node.id)

    # 4. Mark upstream nodes as completed using original outputs
    for node_id in upstream_ids:
        output = upstream_outputs.get(node_id, {})
        if not output:
            output = {"__skipped__": True}
        await update_node_execution(
            db,
            run_id,
            node_id,
            status="completed",
            started_at="now()",
            completed_at="now()",
            output_payload=output,
        )

    # 5. Build state dict
    trigger_node = next((n for n in schema.nodes if n.type == "trigger"), None)
    state: dict[str, Any] = {n.id: None for n in schema.nodes}

    # Trigger node gets the original trigger payload
    if trigger_node:
        state[trigger_node.id] = upstream_outputs.get(trigger_node.id, {})

    # Upstream nodes get their original outputs
    for node_id in upstream_ids:
        state[node_id] = upstream_outputs.get(node_id, {})

    # The start node gets the edited input
    state[start_node_id] = start_input

    # 6. Set up edges_from for topological walk
    edges_from: dict[str, list] = {}
    for edge in schema.edges:
        edges_from.setdefault(edge.from_node, []).append(edge)

    # 7. BFS walk from start_node_id
    visited: set[str] = set(upstream_ids)
    queue: list[str] = [start_node_id]
    failures: list[Exception] = []

    while queue:
        current_id = queue.pop(0)
        outgoing = edges_from.get(current_id, [])

        for edge in outgoing:
            target_node = executor.node_map.get(edge.to)
            if not target_node or edge.to in visited:
                continue

            input_data = executor._resolve_input(edge.to, state)
            try:
                output = await executor._execute_node(target_node, input_data)
                state[edge.to] = output
                visited.add(edge.to)
                queue.append(edge.to)
            except ExecutionError as exc:
                failures.append(exc)
                visited.add(edge.to)
                # Mark the failed node
                await update_node_execution(
                    db,
                    run_id,
                    edge.to,
                    status="failed",
                    completed_at="now()",
                    error_message=str(exc.message) if hasattr(exc, "message") else str(exc),
                )
                state[edge.to] = {"__node_error__": str(exc)}
                # Stop on failure — don't continue downstream
                break
        else:
            continue
        # Break from outer while loop on failure
        break

    return failures
