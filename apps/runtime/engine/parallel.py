"""
Parallel execution support for runtime workflows.

Provides fan-out/fan-in execution for nodes that have no dependencies
between them, enabling concurrent execution using asyncio.
"""
from __future__ import annotations

import asyncio
from typing import Any, Callable, Awaitable

from schema import ProgramSchema, SchemaNode


class DependencyResolver:
    """Analyzes the workflow graph to identify parallelizable node groups."""

    def __init__(self, schema: ProgramSchema):
        self.schema = schema
        self.node_map = {n.id: n for n in schema.nodes}
        self.edges_from: dict[str, list] = {}
        self.edges_to: dict[str, list] = {}

        for edge in schema.edges:
            self.edges_from.setdefault(edge.from_node, []).append(edge)
            self.edges_to.setdefault(edge.to, []).append(edge)

    def get_in_degree(self, node_id: str) -> int:
        """Get the number of incoming edges for a node."""
        return len(self.edges_to.get(node_id, []))

    def get_successors(self, node_id: str) -> list[str]:
        """Get all direct successors of a node."""
        return [edge.to for edge in self.edges_from.get(node_id, [])]

    def get_predecessors(self, node_id: str) -> list[str]:
        """Get all direct predecessors of a node."""
        return [edge.from_node for edge in self.edges_to.get(node_id, [])]

    def find_parallel_groups(self, executed_nodes: set[str], current_state: dict[str, Any]) -> list[list[str]]:
        """Find groups of nodes that can be executed in parallel.
        
        A node is ready for execution if:
        1. It has not been executed yet
        2. All its predecessors have been executed
        3. Its input dependencies are satisfied
        
        Returns a list of groups, where each group contains nodes
        that can be executed concurrently.
        """
        ready_nodes = []

        for node in self.schema.nodes:
            if node.id in executed_nodes:
                continue
            if node.type not in {"agent", "agent_task", "step", "connection"}:
                continue

            # Check if all predecessors are executed
            predecessors = self.get_predecessors(node.id)
            if all(p in executed_nodes for p in predecessors):
                # Check if the node has all its input data available
                all_inputs_ready = True
                for pred_id in predecessors:
                    if pred_id not in current_state or current_state[pred_id] is None:
                        all_inputs_ready = False
                        break

                if all_inputs_ready:
                    ready_nodes.append(node.id)

        if not ready_nodes:
            return []

        # Group ready nodes by their execution level
        # Nodes at the same depth (distance from trigger) can run in parallel
        groups = self._group_by_depth(ready_nodes)
        return groups

    def _group_by_depth(self, node_ids: list[str]) -> list[list[str]]:
        """Group nodes by their depth in the DAG."""
        depth_map: dict[str, int] = {}

        def get_depth(node_id: str) -> int:
            if node_id in depth_map:
                return depth_map[node_id]
            predecessors = self.get_predecessors(node_id)
            if not predecessors:
                depth_map[node_id] = 0
                return 0
            max_pred_depth = max(get_depth(p) for p in predecessors)
            depth_map[node_id] = max_pred_depth + 1
            return depth_map[node_id]

        # Calculate depths for all ready nodes
        for node_id in node_ids:
            get_depth(node_id)

        # Group by depth
        depth_groups: dict[int, list[str]] = {}
        for node_id in node_ids:
            depth = depth_map.get(node_id, 0)
            depth_groups.setdefault(depth, []).append(node_id)

        return [group for group in depth_groups.values() if len(group) > 0]


class ParallelExecutor:
    """Executes nodes in parallel when possible."""

    def __init__(
        self,
        max_concurrent: int = 10,
    ):
        self.max_concurrent = max_concurrent
        self._semaphore = asyncio.Semaphore(max_concurrent)

    async def execute_parallel(
        self,
        node_ids: list[str],
        execute_fn: Callable[[str], Awaitable[dict[str, Any]]],
        on_node_complete: Callable[[str, dict[str, Any]], Awaitable[None]] | None = None,
        on_node_error: Callable[[str, Exception], Awaitable[None]] | None = None,
    ) -> dict[str, dict[str, Any]]:
        """Execute a group of nodes in parallel.
        
        Args:
            node_ids: List of node IDs to execute concurrently
            execute_fn: Async function that takes node_id and returns output
            on_node_complete: Optional callback when a node completes
            on_node_error: Optional callback when a node errors
            
        Returns:
            Dict mapping node_id to its output
        """
        results: dict[str, dict[str, Any]] = {}

        async def _exec_with_semaphore(node_id: str) -> tuple[str, dict[str, Any] | None, Exception | None]:
            async with self._semaphore:
                try:
                    output = await execute_fn(node_id)
                    if on_node_complete:
                        await on_node_complete(node_id, output)
                    return node_id, output, None
                except Exception as e:
                    if on_node_error:
                        await on_node_error(node_id, e)
                    return node_id, None, e

        # Execute all nodes concurrently
        tasks = [_exec_with_semaphore(nid) for nid in node_ids]
        completed = await asyncio.gather(*tasks, return_exceptions=False)

        errors = []
        for node_id, output, error in completed:
            if error:
                errors.append((node_id, error))
            elif output is not None:
                results[node_id] = output

        # If any node failed with a critical error, raise it
        if errors:
            # Return partial results but also raise the first error
            # The caller can decide whether to continue or abort
            raise ParallelExecutionError(
                f"Parallel execution failed for nodes: {[nid for nid, _ in errors]}",
                results=results,
                errors=errors,
            )

        return results


class ParallelExecutionError(Exception):
    """Error raised when parallel execution partially fails."""

    def __init__(
        self,
        message: str,
        results: dict[str, dict[str, Any]] | None = None,
        errors: list[tuple[str, Exception]] | None = None,
    ):
        super().__init__(message)
        self.results = results or {}
        self.errors = errors or []


def can_execute_in_parallel(
    node_a_id: str,
    node_b_id: str,
    schema: ProgramSchema,
) -> bool:
    """Check if two nodes can be executed in parallel.
    
    Two nodes can execute in parallel if:
    1. Neither is an ancestor of the other
    2. They don't share a direct dependency relationship
    """
    node_map = {n.id: n for n in schema.nodes}
    edges_from: dict[str, list] = {}
    for edge in schema.edges:
        edges_from.setdefault(edge.from_node, []).append(edge)

    def get_ancestors(node_id: str) -> set[str]:
        """Get all ancestors of a node."""
        ancestors = set()
        frontier = [node_id]
        while frontier:
            current = frontier.pop()
            for edge in schema.edges:
                if edge.to == current and edge.from_node not in ancestors:
                    ancestors.add(edge.from_node)
                    frontier.append(edge.from_node)
        return ancestors

    ancestors_a = get_ancestors(node_a_id)
    ancestors_b = get_ancestors(node_b_id)

    # Can't execute in parallel if one is an ancestor of the other
    if node_a_id in ancestors_b or node_b_id in ancestors_a:
        return False

    return True
