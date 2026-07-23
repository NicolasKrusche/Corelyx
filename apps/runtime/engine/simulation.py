"""Simulation Engine for dry-run execution of workflows against mock data."""

from __future__ import annotations

import asyncio
import dataclasses
import json
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from mocks.connector_mocks import get_mock_response, get_supported_operations
from schema import ProgramSchema, SchemaNode
from engine.safe_expressions import evaluate_condition, evaluate_expression, SafeExpressionError


def _config_to_dict(config: Any) -> dict[str, Any]:
    """Convert a config object (dataclass or dict) to a plain dict."""
    if config is None:
        return {}
    if isinstance(config, dict):
        return config
    if dataclasses.is_dataclass(config) and not isinstance(config, type):
        return dataclasses.asdict(config)
    return {}


@dataclass
class NodeSimulationState:
    """State of a node during simulation."""

    node_id: str
    status: str = "pending"  # pending, running, completed, failed, skipped
    input_data: dict[str, Any] = field(default_factory=dict)
    output_data: dict[str, Any] = field(default_factory=dict)
    error_message: str | None = None
    started_at: str | None = None
    completed_at: str | None = None
    duration_ms: float = 0.0
    estimated_cost_usd: float = 0.0
    estimated_tokens: int = 0
    is_mock: bool = True


@dataclass
class SimulationResult:
    """Result of a full workflow simulation."""

    program_id: str
    simulation_id: str
    status: str  # completed, failed, partial
    started_at: str
    completed_at: str | None
    total_duration_ms: float
    nodes: dict[str, NodeSimulationState]
    edges_traversed: list[dict[str, Any]]
    errors: list[str]
    total_estimated_cost_usd: float
    total_estimated_tokens: int


class SimulationEngine:
    """Executes a workflow graph against mock connector responses."""

    def __init__(self, schema: ProgramSchema, trigger_payload: dict[str, Any] | None = None):
        self.schema = schema
        self.trigger_payload = trigger_payload or {}
        self.nodes_by_id = {node.id: node for node in schema.nodes}
        self.edges = schema.edges
        self.node_states: dict[str, NodeSimulationState] = {}
        self.edges_traversed: list[dict[str, Any]] = []
        self.errors: list[str] = []
        self.start_time = time.time()

    def _get_trigger_node(self) -> SchemaNode | None:
        """Find the trigger node in the schema."""
        for node in self.schema.nodes:
            if node.type == "trigger":
                return node
        return None

    def _get_node_dependencies(self, node_id: str) -> list[str]:
        """Get list of node IDs that must complete before this node can run."""
        deps = []
        for edge in self.edges:
            if edge.to == node_id:
                deps.append(edge.from_node)
        return deps

    def _get_downstream_nodes(self, node_id: str) -> list[str]:
        """Get list of node IDs that depend on this node."""
        downstream = []
        for edge in self.edges:
            if edge.from_node == node_id:
                downstream.append(edge.to)
        return downstream

    def _resolve_input_mapping(self, node: SchemaNode, upstream_outputs: dict[str, dict[str, Any]]) -> dict[str, Any]:
        """Resolve input data for a node from upstream outputs and trigger payload."""
        input_data = {}

        # Add trigger payload for trigger node
        if node.type == "trigger":
            input_data = self.trigger_payload.copy()
        else:
            # Get edge mappings for this node
            has_explicit_mapping = False
            for edge in self.edges:
                if edge.to == node.id and edge.from_node in upstream_outputs:
                    source_output = upstream_outputs[edge.from_node]
                    mapping = edge.data_mapping or {}

                    if mapping:
                        has_explicit_mapping = True
                        # Apply explicit data flow mapping
                        for target_key, source_expr in mapping.items():
                            try:
                                if isinstance(source_expr, str) and source_expr.startswith("{{") and source_expr.endswith("}}"):
                                    # Expression mapping
                                    expr = source_expr[2:-2].strip()
                                    input_data[target_key] = evaluate_expression(expr, source_output)
                                else:
                                    # Direct field mapping
                                    input_data[target_key] = source_output.get(source_expr)
                            except SafeExpressionError as e:
                                self.errors.append(f"Mapping error for edge {edge.id}: {e}")
                                input_data[target_key] = None
                    else:
                        # No explicit mapping — merge upstream output directly
                        input_data.update(source_output)

        # Add node config as potential input
        if node.config:
            input_data["_config"] = node.config

        return input_data

    def _simulate_connection_node(self, node: SchemaNode, input_data: dict[str, Any]) -> dict[str, Any]:
        """Simulate a connection node execution using mock data."""
        cfg = _config_to_dict(node.config)
        # Prefer the node-level connection field (the actual provider slug),
        # then fall back to config-level identifiers.
        provider = getattr(node, "connection", None) or cfg.get("provider") or cfg.get("connector_type")
        operation = cfg.get("operation") or cfg.get("method", "list")

        if provider == "http" or provider == "http_generic":
            provider = "http_generic"

        if not provider:
            return {"error": "No provider specified in connection config", "status": "failed"}

        # Get mock response
        mock_response = get_mock_response(provider, operation, cfg)

        return {
            "status_code": mock_response.get("status_code", 200),
            "data": mock_response.get("data", mock_response),
            "headers": mock_response.get("headers", {}),
            "is_mock": True,
        }

    def _simulate_agent_node(self, node: SchemaNode, input_data: dict[str, Any]) -> dict[str, Any]:
        """Simulate an agent node execution."""
        cfg = _config_to_dict(node.config)
        system_prompt = cfg.get("system_prompt", "")
        model = cfg.get("model", "gpt-4o-mini")

        # Mock agent response based on input
        input_text = json.dumps(input_data) if input_data else "No input"

        return {
            "response": f"[MOCK AGENT] Processed: {input_text[:100]}...",
            "model": model,
            "estimated_tokens": len(input_text) // 4 + 50,
            "estimated_cost_usd": 0.001,
            "is_mock": True,
        }

    def _simulate_step_node(self, node: SchemaNode, input_data: dict[str, Any]) -> dict[str, Any]:
        """Simulate a step node (transform, filter, branch, etc.)."""
        cfg = _config_to_dict(node.config)
        logic_type = cfg.get("logic_type", "transform")

        if logic_type == "transform":
            transformation = cfg.get("transformation", "")
            try:
                # Try to evaluate transformation as expression
                if transformation:
                    return {"result": evaluate_expression(transformation, input_data), "is_mock": True}
            except SafeExpressionError:
                pass
            return {"result": f"[MOCK TRANSFORM] Input keys: {list(input_data.keys())}", "is_mock": True}

        elif logic_type == "filter":
            condition = cfg.get("condition", "true")
            try:
                passed = evaluate_condition(condition, input_data)
                return {"passed": passed, "filtered_data": input_data if passed else None, "is_mock": True}
            except SafeExpressionError:
                return {"passed": True, "filtered_data": input_data, "is_mock": True}

        elif logic_type == "branch":
            conditions = cfg.get("conditions", [])
            default_branch = cfg.get("default_branch", "default")
            for cond in conditions:
                try:
                    if evaluate_condition(cond.get("condition", "false"), input_data):
                        return {"branch": cond.get("branch", "matched"), "data": input_data, "is_mock": True}
                except SafeExpressionError:
                    continue
            return {"branch": default_branch, "data": input_data, "is_mock": True}

        elif logic_type == "loop":
            over = cfg.get("over", "input.items")
            item_var = cfg.get("item_var", "item")
            # For simulation, just return mock iteration info
            items = input_data.get("items", [{"mock": "item1"}, {"mock": "item2"}])
            return {
                "iterations": len(items),
                "item_var": item_var,
                "sample_item": items[0] if items else {},
                "is_mock": True,
            }

        elif logic_type == "delay":
            seconds = cfg.get("seconds", 1)
            return {"delayed_seconds": seconds, "resumed_at": datetime.now().isoformat(), "is_mock": True}

        elif logic_type in ("format", "parse", "deduplicate", "sort"):
            return {f"{logic_type}d_data": input_data, "is_mock": True}

        return {"result": f"[MOCK STEP {logic_type.upper()}]", "is_mock": True}

    def _simulate_trigger_node(self, node: SchemaNode, input_data: dict[str, Any]) -> dict[str, Any]:
        """Simulate a trigger node."""
        cfg = _config_to_dict(node.config)
        trigger_type = cfg.get("trigger_type", "manual")

        if trigger_type == "webhook":
            return {"webhook_data": self.trigger_payload, "endpoint_id": cfg.get("endpoint_id"), "is_mock": True}
        elif trigger_type == "cron":
            return {"triggered_at": datetime.now().isoformat(), "cron_expression": cfg.get("expression"), "is_mock": True}
        elif trigger_type == "event":
            return {"event_source": cfg.get("source"), "event_type": cfg.get("event"), "payload": self.trigger_payload, "is_mock": True}
        elif trigger_type == "program_output":
            return {"source_program": cfg.get("source_program_id"), "output": self.trigger_payload, "is_mock": True}
        else:  # manual
            return {"triggered_manually": True, "payload": self.trigger_payload, "is_mock": True}

    async def _execute_node(self, node: SchemaNode, upstream_outputs: dict[str, dict[str, Any]]) -> NodeSimulationState:
        """Execute a single node in simulation mode."""
        state = NodeSimulationState(node_id=node.id)
        state.started_at = datetime.now().isoformat()
        state.status = "running"

        try:
            input_data = self._resolve_input_mapping(node, upstream_outputs)
            state.input_data = input_data

            # Route to appropriate simulator based on node type
            if node.type == "connection":
                output = self._simulate_connection_node(node, input_data)
            elif node.type == "agent" or node.type == "agent_task":
                output = self._simulate_agent_node(node, input_data)
            elif node.type == "step":
                output = self._simulate_step_node(node, input_data)
            elif node.type == "trigger":
                output = self._simulate_trigger_node(node, input_data)
            elif node.type == "note":
                note_cfg = _config_to_dict(node.config)
                output = {"note": note_cfg.get("content", ""), "is_mock": True}
            elif node.type == "group":
                group_cfg = _config_to_dict(node.config)
                output = {"group_id": node.id, "child_count": len(group_cfg.get("childIds", [])), "is_mock": True}
            else:
                output = {"error": f"Unknown node type: {node.type}", "is_mock": True}

            state.output_data = output
            state.status = "completed"

            # Estimate cost/tokens for mock
            if output.get("is_mock"):
                if node.type == "agent" or node.type == "agent_task":
                    state.estimated_tokens = output.get("estimated_tokens", 100)
                    state.estimated_cost_usd = output.get("estimated_cost_usd", 0.001)
                elif node.type == "connection":
                    state.estimated_cost_usd = 0.0

        except Exception as e:
            state.status = "failed"
            state.error_message = str(e)
            self.errors.append(f"Node {node.id}: {e}")

        state.completed_at = datetime.now().isoformat()
        state.duration_ms = 10.0  # Mock duration

        self.node_states[node.id] = state
        return state

    async def run_simulation(self) -> SimulationResult:
        """Run the full workflow simulation."""
        simulation_id = f"sim_{int(time.time() * 1000)}"
        started_at = datetime.now().isoformat()

        # Find trigger node
        trigger_node = self._get_trigger_node()
        if not trigger_node:
            self.errors.append("No trigger node found in schema")
            return SimulationResult(
                program_id=self.schema.program_id,
                simulation_id=simulation_id,
                status="failed",
                started_at=started_at,
                completed_at=datetime.now().isoformat(),
                total_duration_ms=0,
                nodes={},
                edges_traversed=[],
                errors=self.errors,
                total_estimated_cost_usd=0,
                total_estimated_tokens=0,
            )

        # Topological execution order (simple BFS from trigger)
        executed = set()
        queue = [trigger_node.id]

        while queue:
            node_id = queue.pop(0)
            if node_id in executed:
                continue

            node = self.nodes_by_id.get(node_id)
            if not node:
                continue

            # Check dependencies
            deps = self._get_node_dependencies(node_id)
            if not all(d in executed for d in deps):
                # Re-queue for later
                queue.append(node_id)
                continue

            # Execute node
            await self._execute_node(node, {nid: self.node_states[nid].output_data for nid in deps if nid in self.node_states})
            executed.add(node_id)

            # Add downstream to queue
            downstream = self._get_downstream_nodes(node_id)
            for d in downstream:
                if d not in executed:
                    queue.append(d)

            # Record edges traversed
            for edge in self.edges:
                if edge.from_node == node_id and edge.to in executed:
                    self.edges_traversed.append(
                        {
                            "edge_id": edge.id,
                            "source": edge.source,
                            "target": edge.target,
                            "type": edge.type,
                            "mapping": edge.mapping,
                        }
                    )

        completed_at = datetime.now().isoformat()
        total_duration = (time.time() - self.start_time) * 1000

        # Calculate totals
        total_cost = sum(s.estimated_cost_usd for s in self.node_states.values())
        total_tokens = sum(s.estimated_tokens for s in self.node_states.values())

        # Determine overall status
        failed_nodes = [s for s in self.node_states.values() if s.status == "failed"]
        if failed_nodes:
            status = "partial" if len(failed_nodes) < len(self.node_states) else "failed"
        else:
            status = "completed"

        return SimulationResult(
            program_id=self.schema.program_id,
            simulation_id=simulation_id,
            status=status,
            started_at=started_at,
            completed_at=completed_at,
            total_duration_ms=total_duration,
            nodes=self.node_states,
            edges_traversed=self.edges_traversed,
            errors=self.errors,
            total_estimated_cost_usd=round(total_cost, 6),
            total_estimated_tokens=total_tokens,
        )


async def run_program_simulation(
    schema: ProgramSchema,
    trigger_payload: dict[str, Any] | None = None,
) -> SimulationResult:
    """Convenience function to run a program simulation."""
    engine = SimulationEngine(schema, trigger_payload)
    return await engine.run_simulation()