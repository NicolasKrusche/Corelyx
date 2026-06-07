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
    "corelyx.report_to_user": {
        "description": (
            "Relay findings back to the user in a rich report window. Use this to "
            "present results (e.g. why last week's runs failed) before finishing. "
            "Format the body as GitHub-flavored markdown — headings, bold, bullet "
            "lists, and tables all render. Optionally pass data.metrics for "
            "graphical stat cards. Safe to call in dry runs."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Short report heading."},
                "body": {
                    "type": "string",
                    "description": (
                        "The report content as GitHub-flavored markdown. Use ## headings, "
                        "**bold**, bullet/numbered lists, and | pipe | tables | for readability."
                    ),
                },
                "data": {
                    "type": "object",
                    "description": "Optional structured extras rendered graphically.",
                    "properties": {
                        "metrics": {
                            "type": "array",
                            "description": "Headline stat cards shown above the body.",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "label": {"type": "string"},
                                    "value": {"type": ["string", "number"]},
                                    "tone": {"type": "string", "enum": ["default", "good", "warn", "bad"]},
                                },
                                "required": ["label", "value"],
                            },
                        }
                    },
                },
            },
            "required": ["body"],
        },
    },
    "corelyx.call_connector": {
        "description": (
            "Call one operation on one of the user's connected apps directly "
            "(e.g. send a Slack message, create a HubSpot note, list Gmail "
            "threads). Use this to ACT on apps dynamically while reasoning — "
            "decide per item what to do, then do it. Discover available "
            "connections with corelyx.list_connections first. `connection` is the "
            "connection name (or provider:alias) exactly as listed; `operation` "
            "must be a supported operation for that provider; `params` are the "
            "operation arguments. Read operations (get_/list_/search_/…) run even "
            "in dry-run; write operations are simulated in dry-run."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "connection": {
                    "type": "string",
                    "description": "Connection name or provider:alias as listed by corelyx.list_connections.",
                },
                "operation": {
                    "type": "string",
                    "description": "A supported operation name for that provider's connector.",
                },
                "params": {
                    "type": "object",
                    "description": "Operation arguments.",
                },
            },
            "required": ["connection", "operation"],
        },
    },
    "corelyx.ask_user": {
        "description": (
            "Pause and ask the user a question when you are blocked, need a "
            "decision, or need missing information — then continue with their "
            "answer. Use this instead of guessing on anything consequential "
            "(which record, whether to send, ambiguous criteria). The run waits "
            "for the reply. Keep the question short and specific. Safe in dry runs."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "question": {
                    "type": "string",
                    "description": "The question to ask the user. Be specific and self-contained.",
                },
            },
            "required": ["question"],
        },
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


# Tools every agent_task gets regardless of its configured `tools` array.
# Mirrors ALWAYS_AVAILABLE_AGENT_TOOL_IDS in apps/web/lib/genesis/agent-tools.ts.
ALWAYS_AVAILABLE_AGENT_TOOL_IDS = ["corelyx.report_to_user", "corelyx.ask_user"]


def with_always_available_tools(allowed_ids: list[str]) -> list[str]:
    """Append the always-available tool ids (e.g. report_to_user), de-duped."""
    out = list(allowed_ids)
    for tid in ALWAYS_AVAILABLE_AGENT_TOOL_IDS:
        if tid not in out:
            out.append(tid)
    return out


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
