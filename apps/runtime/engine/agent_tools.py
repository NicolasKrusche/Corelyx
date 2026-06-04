"""Tool specs for agent_task tool-loops.

Mirrors apps/web/lib/genesis/agent-tools.ts. The web side is the security
authority (it authorizes + executes each call); this module only provides the
OpenAI-style function schemas the runtime hands to the LLM so it can emit valid
tool calls. Keep the ids in sync with the TypeScript registry.
"""
from __future__ import annotations

from typing import Any

# id -> (description, parameters JSON schema)
_AGENT_TOOL_SPECS: dict[str, dict[str, Any]] = {
    "corelyx.list_programs": {
        "description": "List the user's workflows and agents in this workspace.",
        "parameters": {
            "type": "object",
            "properties": {
                "program_type": {"type": "string", "enum": ["workflow", "agent"]},
                "is_active": {"type": "boolean"},
                "name_contains": {"type": "string"},
                "limit": {"type": "integer"},
            },
        },
    },
    "corelyx.get_program": {
        "description": "Fetch one program's schema, metadata, and status by id.",
        "parameters": {
            "type": "object",
            "properties": {"program_id": {"type": "string"}},
            "required": ["program_id"],
        },
    },
    "corelyx.list_runs": {
        "description": "List execution runs, optionally filtered by program/status/date.",
        "parameters": {
            "type": "object",
            "properties": {
                "program_id": {"type": "string"},
                "status": {"type": "string"},
                "since": {"type": "string"},
                "until": {"type": "string"},
                "limit": {"type": "integer"},
            },
        },
    },
    "corelyx.get_run": {
        "description": "Fetch one run's status, per-node results, and errors by run id.",
        "parameters": {
            "type": "object",
            "properties": {"run_id": {"type": "string"}},
            "required": ["run_id"],
        },
    },
    "corelyx.list_connections": {
        "description": "List connected apps with provider, validity, and token expiry.",
        "parameters": {"type": "object", "properties": {}},
    },
    "corelyx.get_account_stats": {
        "description": "Summary of program counts, run statuses, and connection health.",
        "parameters": {"type": "object", "properties": {}},
    },
    "corelyx.trigger_program": {
        "description": "Manually trigger an existing workflow to run.",
        "parameters": {
            "type": "object",
            "properties": {"program_id": {"type": "string"}},
            "required": ["program_id"],
        },
    },
    "corelyx.set_program_active": {
        "description": "Activate or deactivate a workflow by id.",
        "parameters": {
            "type": "object",
            "properties": {
                "program_id": {"type": "string"},
                "is_active": {"type": "boolean"},
            },
            "required": ["program_id", "is_active"],
        },
    },
    "corelyx.create_workflow": {
        "description": "Create a new workflow from a complete program schema object.",
        "parameters": {
            "type": "object",
            "properties": {"schema": {"type": "object"}},
            "required": ["schema"],
        },
    },
    "corelyx.update_program": {
        "description": "Replace an existing program's schema with an updated one.",
        "parameters": {
            "type": "object",
            "properties": {
                "program_id": {"type": "string"},
                "schema": {"type": "object"},
            },
            "required": ["program_id", "schema"],
        },
    },
}


def is_known_agent_tool(tool_id: str) -> bool:
    return tool_id in _AGENT_TOOL_SPECS


def build_openai_tools(allowed_ids: list[str]) -> list[dict[str, Any]]:
    """Build the OpenAI `tools` array for the allow-listed tool ids.

    Unknown ids (e.g. connector operations not yet wired into the loop) are
    skipped so the model is never offered a tool the runtime can't service.
    """
    tools: list[dict[str, Any]] = []
    for tool_id in allowed_ids:
        spec = _AGENT_TOOL_SPECS.get(tool_id)
        if not spec:
            continue
        tools.append(
            {
                "type": "function",
                "function": {
                    "name": tool_id.replace(".", "__"),  # OpenAI names disallow dots
                    "description": spec["description"],
                    "parameters": spec["parameters"],
                },
            }
        )
    return tools


def build_anthropic_tools(allowed_ids: list[str]) -> list[dict[str, Any]]:
    """Build the Anthropic `tools` array for the allow-listed tool ids.

    Anthropic tool names must match ^[a-zA-Z0-9_-]{1,64}$ — same dot→__ encoding
    as the OpenAI variant, decoded back with tool_name_to_id.
    """
    tools: list[dict[str, Any]] = []
    for tool_id in allowed_ids:
        spec = _AGENT_TOOL_SPECS.get(tool_id)
        if not spec:
            continue
        tools.append(
            {
                "name": tool_id.replace(".", "__"),
                "description": spec["description"],
                "input_schema": spec["parameters"],
            }
        )
    return tools


def tool_name_to_id(name: str) -> str:
    """Inverse of the dot→__ encoding used in build_openai_tools."""
    return name.replace("__", ".")
