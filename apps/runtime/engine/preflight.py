"""Pre-Flight Validation with Fix Suggestions — runtime-side module.

Extends the pre-flight validation to include LLM-generated fix suggestions
when validation errors are detected. The web app calls this via the existing
preflight API route, and the runtime returns enriched responses with
fix_suggestions when appropriate.

This module is used by the runtime engine to provide fix suggestions during
preflight validation. It does NOT expose secrets — all credential lookups
happen through the established token/Vault helpers.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Literal, Optional


@dataclass
class JsonPatchOp:
    """RFC 6902 JSON Patch operation."""

    op: Literal["add", "remove", "replace", "move", "copy", "test"]
    path: str
    value: Any = None
    from_: Optional[str] = field(default=None, metadata={"alias": "from"})

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {"op": self.op, "path": self.path}
        if self.value is not None:
            d["value"] = self.value
        if self.from_ is not None:
            d["from"] = self.from_
        return d


@dataclass
class FixSuggestion:
    """A single AI-generated fix suggestion for a validation error."""

    description: str
    patch: list[JsonPatchOp]
    confidence: float
    addresses_errors: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "description": self.description,
            "patch": [op.to_dict() for op in self.patch],
            "confidence": self.confidence,
            "addresses_errors": self.addresses_errors,
        }


@dataclass
class ValidationError:
    """A validation error from pre-flight checks."""

    code: str
    severity: Literal["blocking", "critical"]
    node_id: Optional[str]
    edge_id: Optional[str]
    message: str
    fix_suggestion: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "severity": self.severity,
            "node_id": self.node_id,
            "edge_id": self.edge_id,
            "message": self.message,
            "fix_suggestion": self.fix_suggestion,
        }


@dataclass
class PreFlightResult:
    """Result of pre-flight validation, optionally including fix suggestions."""

    valid: bool
    errors: list[ValidationError]
    warnings: list[dict[str, Any]]
    node_states: dict[str, str]
    fix_suggestions: list[FixSuggestion] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "valid": self.valid,
            "errors": [e.to_dict() for e in self.errors],
            "warnings": self.warnings,
            "node_states": self.node_states,
        }
        if self.fix_suggestions:
            result["fix_suggestions"] = [s.to_dict() for s in self.fix_suggestions]
        return result


# ─── Valid node & trigger types ──────────────────────────────────────────────

VALID_NODE_TYPES = frozenset({
    "agent", "connection", "http", "transform", "filter",
    "branch", "loop", "delay", "note", "webhook", "cron",
    "file_watch", "event",
})

VALID_TRIGGER_TYPES = frozenset({
    "webhook", "cron", "file_watch", "event", "manual",
})


def run_preflight(program: dict[str, Any]) -> PreFlightResult:
    """Validate a program schema and return structured errors.

    Checks performed:
    1. Required top-level fields exist (nodes, edges).
    2. Each node has a valid type, id, and config.
    3. Edges reference nodes that exist in the graph.
    4. Trigger configuration is present and valid (if applicable).
    5. Agent nodes have required config fields (model, api_key_ref).

    Returns a PreFlightResult with errors and deterministic fix suggestions
    generated for known error patterns.
    """
    errors: list[ValidationError] = []
    error_counter = 0

    def _err(
        code: str,
        severity: Literal["blocking", "critical"],
        message: str,
        node_id: str | None = None,
        edge_id: str | None = None,
        fix_suggestion: str = "",
    ) -> None:
        nonlocal error_counter
        error_counter += 1
        errors.append(ValidationError(
            code=code,
            severity=severity,
            node_id=node_id,
            edge_id=edge_id,
            message=message,
            fix_suggestion=fix_suggestion,
        ))

    # ── 1. Top-level required fields ──────────────────────────────────────

    if not isinstance(program, dict):
        _err("PRE_001", "blocking", "Program must be a JSON object.")
        return PreFlightResult(valid=False, errors=errors, warnings=[], node_states={})

    nodes = program.get("nodes")
    if not isinstance(nodes, list) or len(nodes) == 0:
        _err("PRE_001", "blocking", "Program must have a non-empty 'nodes' array.")
        return PreFlightResult(valid=False, errors=errors, warnings=[], node_states={})

    edges = program.get("edges")
    if edges is None:
        # edges are optional — default to empty
        program["edges"] = []
        edges = []
    elif not isinstance(edges, list):
        _err("PRE_001", "blocking", "'edges' must be an array if provided.")
        return PreFlightResult(valid=False, errors=errors, warnings=[], node_states={})

    # ── 2. Validate nodes ─────────────────────────────────────────────────

    node_ids: set[str] = set()
    node_states: dict[str, str] = {}

    for i, node in enumerate(nodes):
        if not isinstance(node, dict):
            _err("PRE_002", "blocking", f"Node at index {i} is not a JSON object.")
            continue

        node_id = node.get("id", "")
        node_type = node.get("type", "")
        node_label = node.get("label", node_id or f"node[{i}]")

        # Check id
        if not node_id:
            _err("PRE_002", "blocking", f"Node at index {i} is missing 'id'.",
                 fix_suggestion="Add a unique 'id' field to the node.")
            continue

        if node_id in node_ids:
            _err("PRE_002", "blocking", f"Duplicate node id: '{node_id}'.",
                 node_id=node_id,
                 fix_suggestion="Assign a unique id to this node.")
        node_ids.add(node_id)

        # Check type
        if not node_type:
            _err("PRE_003", "critical", f"Node '{node_label}' is missing 'type'.",
                 node_id=node_id,
                 fix_suggestion="Set 'type' to a valid node type (e.g. 'agent', 'connection').")
            node_states[node_id] = "error"
            continue

        if node_type not in VALID_NODE_TYPES:
            _err("PRE_003", "critical",
                 f"Node '{node_label}' has invalid type '{node_type}'. "
                 f"Valid types: {', '.join(sorted(VALID_NODE_TYPES))}.",
                 node_id=node_id,
                 fix_suggestion="Change 'type' to a valid node type.")
            node_states[node_id] = "error"
            continue

        # Check config exists
        config = node.get("config")
        if config is None:
            _err("PRE_003", "critical", f"Node '{node_label}' is missing 'config'.",
                 node_id=node_id,
                 fix_suggestion="Add a 'config' object appropriate for this node type.")
            node_states[node_id] = "error"
            continue

        if not isinstance(config, dict):
            _err("PRE_003", "critical", f"Node '{node_label}' 'config' must be an object.",
                 node_id=node_id)
            node_states[node_id] = "error"
            continue

        # Check agent-specific config
        if node_type == "agent":
            model = config.get("model")
            api_key_ref = config.get("api_key_ref")

            if model == "__USER_ASSIGNED__":
                _err("PRE_004", "critical",
                     f"Agent node '{node_label}' has unassigned model.",
                     node_id=node_id,
                     fix_suggestion="Set 'model' to a valid model ID (e.g. 'openai/gpt-4o-mini').")
                node_states[node_id] = "error"
                continue

            if api_key_ref == "__USER_ASSIGNED__":
                _err("PRE_004", "critical",
                     f"Agent node '{node_label}' has unassigned API key.",
                     node_id=node_id,
                     fix_suggestion="Set 'api_key_ref' to 'platform' or a valid key ID.")
                node_states[node_id] = "error"
                continue

        node_states[node_id] = "valid"

    # ── 3. Validate edges ─────────────────────────────────────────────────

    for i, edge in enumerate(edges):
        if not isinstance(edge, dict):
            _err("PRE_005", "critical", f"Edge at index {i} is not a JSON object.")
            continue

        edge_id = edge.get("id", f"edge[{i}]")
        source = edge.get("source", edge.get("from", ""))
        target = edge.get("target", edge.get("to", ""))

        if not source:
            _err("PRE_005", "critical", f"Edge '{edge_id}' is missing 'source'.",
                 edge_id=edge_id,
                 fix_suggestion="Set 'source' to the id of the source node.")
            continue

        if not target:
            _err("PRE_005", "critical", f"Edge '{edge_id}' is missing 'target'.",
                 edge_id=edge_id,
                 fix_suggestion="Set 'target' to the id of the target node.")
            continue

        if source not in node_ids:
            _err("PRE_005", "critical",
                 f"Edge '{edge_id}' references non-existent source node '{source}'.",
                 edge_id=edge_id,
                 fix_suggestion="Remove this edge or update 'source' to reference an existing node.")

        if target not in node_ids:
            _err("PRE_005", "critical",
                 f"Edge '{edge_id}' references non-existent target node '{target}'.",
                 edge_id=edge_id,
                 fix_suggestion="Remove this edge or update 'target' to reference an existing node.")

    # ── 4. Validate trigger configuration (if present) ────────────────────

    trigger = program.get("trigger")
    if trigger is not None:
        if not isinstance(trigger, dict):
            _err("PRE_006", "critical", "'trigger' must be an object if provided.")
        else:
            trigger_type = trigger.get("type", "")
            if not trigger_type:
                _err("PRE_006", "critical", "Trigger is missing 'type'.",
                     fix_suggestion="Set 'type' to a valid trigger type (e.g. 'webhook', 'cron').")
            elif trigger_type not in VALID_TRIGGER_TYPES:
                _err("PRE_006", "critical",
                     f"Invalid trigger type '{trigger_type}'. "
                     f"Valid types: {', '.join(sorted(VALID_TRIGGER_TYPES))}.",
                     fix_suggestion="Change 'type' to a valid trigger type.")

            # Cron triggers need a schedule
            if trigger_type == "cron":
                schedule = trigger.get("schedule")
                if not schedule:
                    _err("PRE_006", "critical", "Cron trigger is missing 'schedule'.",
                         fix_suggestion="Add a 'schedule' field with a cron expression.")

    # ── 5. Generate deterministic fix suggestions ─────────────────────────

    fix_suggestions = generate_fix_suggestions_from_errors(errors, program)

    valid = len(errors) == 0
    return PreFlightResult(
        valid=valid,
        errors=errors,
        warnings=[],
        node_states=node_states,
        fix_suggestions=fix_suggestions,
    )


def generate_fix_suggestions_from_errors(
    errors: list[ValidationError],
    schema: dict[str, Any],
) -> list[FixSuggestion]:
    """Generate deterministic fix suggestions for known error patterns.

    This is a rule-based fallback that handles common validation errors
    without requiring an LLM call. The LLM-based suggestions are generated
    separately by the web app's genesis/fixit.ts module and sent alongside
    the preflight response.

    This function handles:
    - Sentinel value errors (__USER_ASSIGNED__ model/api_key_ref)
    - Missing connection reference edges
    - Broken graph links (edges pointing to non-existent nodes)

    Returns a list of fix suggestions that can be applied as JSON patches.
    """
    suggestions: list[FixSuggestion] = []
    addressed_codes: set[str] = set()

    nodes = schema.get("nodes", [])
    edges = schema.get("edges", [])

    # Build lookup maps
    node_ids = {n.get("id") for n in nodes if isinstance(n, dict)}
    agent_nodes = [n for n in nodes if isinstance(n, dict) and n.get("type") == "agent"]

    # Fix 1: Sentinel model/api_key_ref values on agent nodes
    for node in agent_nodes:
        node_id = node.get("id", "")
        config = node.get("config", {})
        if not isinstance(config, dict):
            continue

        model = config.get("model")
        api_key_ref = config.get("api_key_ref")
        label = node.get("label", node_id)

        patches = []
        addressed = []

        if model == "__USER_ASSIGNED__":
            patches.append({
                "op": "replace",
                "path": f"/nodes/{_node_index(nodes, node_id)}/config/model",
                "value": "openai/gpt-4o-mini",
            })
            addressed.append("PRE_004")

        if api_key_ref == "__USER_ASSIGNED__":
            patches.append({
                "op": "replace",
                "path": f"/nodes/{_node_index(nodes, node_id)}/config/api_key_ref",
                "value": "platform",
            })
            addressed.append("PRE_004")

        if patches:
            what_parts = []
            if model == "__USER_ASSIGNED__":
                what_parts.append("model")
            if api_key_ref == "__USER_ASSIGNED__":
                what_parts.append("API key")
            what = " and ".join(what_parts)

            suggestions.append(FixSuggestion(
                description=f"Auto-assign default {what} for \"{label}\"",
                patch=[JsonPatchOp(**p) for p in patches],
                confidence=0.85,
                addresses_errors=addressed,
            ))
            addressed_codes.update(addressed)

    # Fix 2: Remove broken edges (edges pointing to non-existent nodes)
    broken_edge_indices: list[int] = []
    for i, edge in enumerate(edges):
        if not isinstance(edge, dict):
            continue
        source = edge.get("source", edge.get("from", ""))
        target = edge.get("target", edge.get("to", ""))
        edge_id = edge.get("id", "")

        if source not in node_ids or target not in node_ids:
            broken_edge_indices.append(i)
            if "PRE_005" not in addressed_codes:
                suggestions.append(FixSuggestion(
                    description="Remove edges pointing to non-existent nodes",
                    patch=[JsonPatchOp(
                        op="remove",
                        path=f"/edges/{i}",
                    ) for i in broken_edge_indices],
                    confidence=0.9,
                    addresses_errors=["PRE_005"],
                ))
                addressed_codes.add("PRE_005")

    return suggestions


def _node_index(nodes: list[dict[str, Any]], node_id: str) -> int:
    """Find the index of a node by ID in the nodes array."""
    for i, node in enumerate(nodes):
        if isinstance(node, dict) and node.get("id") == node_id:
            return i
    return -1


def apply_json_patch(
    schema: dict[str, Any],
    patch_ops: list[dict[str, Any]],
) -> dict[str, Any]:
    """Apply RFC 6902 JSON Patch operations to a schema dict.

    Implements a minimal subset of JSON Patch for the operations we generate:
    - replace: set a value at a JSON Pointer path
    - add: add a value at a path
    - remove: remove a value at a path

    Returns a new dict (does not mutate the input).
    """
    import copy

    result = copy.deepcopy(schema)

    for op in patch_ops:
        op_type = op.get("op")
        path = op.get("path", "")
        value = op.get("value")

        if not path.startswith("/"):
            continue

        parts = _parse_json_pointer(path)
        if not parts:
            continue

        if op_type == "replace":
            _set_at_path(result, parts, value)
        elif op_type == "add":
            _set_at_path(result, parts, value)
        elif op_type == "remove":
            _remove_at_path(result, parts)

    return result


def _parse_json_pointer(pointer: str) -> list[str]:
    """Parse a JSON Pointer (RFC 6901) into path segments."""
    if not pointer or pointer == "/":
        return []
    parts = pointer.split("/")
    # Remove empty first element from leading /
    return [p.replace("~1", "/").replace("~0", "~") for p in parts if p]


def _set_at_path(obj: Any, parts: list[str], value: Any) -> None:
    """Set a value at the given path in obj (mutates in place)."""
    current = obj
    for part in parts[:-1]:
        if isinstance(current, dict) and part in current:
            current = current[part]
        elif isinstance(current, list) and part.isdigit():
            idx = int(part)
            if 0 <= idx < len(current):
                current = current[idx]
            else:
                return
        else:
            return

    last = parts[-1]
    if isinstance(current, dict):
        current[last] = value
    elif isinstance(current, list) and last.isdigit():
        idx = int(last)
        if 0 <= idx <= len(current):
            current.insert(idx, value)


def _remove_at_path(obj: Any, parts: list[str]) -> None:
    """Remove a value at the given path in obj (mutates in place)."""
    current = obj
    for part in parts[:-1]:
        if isinstance(current, dict) and part in current:
            current = current[part]
        elif isinstance(current, list) and part.isdigit():
            idx = int(part)
            if 0 <= idx < len(current):
                current = current[idx]
            else:
                return
        else:
            return

    last = parts[-1]
    if isinstance(current, dict) and last in current:
        del current[last]
    elif isinstance(current, list) and last.isdigit():
        idx = int(last)
        if 0 <= idx < len(current):
            current.pop(idx)
