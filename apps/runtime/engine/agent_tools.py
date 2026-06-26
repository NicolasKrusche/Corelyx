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
        "description": (
            "Fetch one program's schema, metadata, and status. Identify it by "
            "program_id (a UUID) or by name — pass name when you only know the "
            "program's title (e.g. the user named it in their answer)."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "program_id": {"type": "string", "description": "The program's UUID."},
                "name": {"type": "string", "description": "The program's name (exact or partial)."},
            },
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
        "description": (
            "List connected apps with provider, validity (is_valid), and last "
            "validation time (last_validated_at). Token expiry is not tracked on "
            "the connection record — treat is_valid=false as a broken/expired "
            "connection."
        ),
        "parameters": {"type": "object", "properties": {}},
    },
    "corelyx.get_account_stats": {
        "description": "Summary of program counts (total and currently active/live), run statuses, and connection health.",
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
                "outcome": {
                    "type": "string",
                    "enum": ["success", "partial", "failed"],
                    "description": "Your verified self-assessment of whether the objective was achieved.",
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
    "corelyx.search_knowledge": {
        "description": (
            "Search the workspace's knowledge base (docs, playbooks, brand voice, "
            "customer notes the user added) for context relevant to your task. Call "
            "this before drafting or deciding so your output reflects the user's "
            "world instead of being generic. Returns the most relevant snippets."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "What to look up."},
                "limit": {"type": "integer", "description": "Max snippets (default 3)."},
            },
            "required": ["query"],
        },
    },
    "corelyx.web_fetch": {
        "description": (
            "Fetch the contents of a public web page or API URL (HTTP GET) and "
            "return its text. Use to read pages, docs, or APIs that aren't a "
            "connected app. HTML is reduced to text; output is truncated. Only "
            "public http/https URLs are allowed (internal/private addresses are "
            "blocked). Read-only and safe in dry runs."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "A public http(s) URL to fetch."},
            },
            "required": ["url"],
        },
    },
    "corelyx.web_search": {
        "description": (
            "Search the web and get back ranked results (title, url, snippet) so "
            "you can DISCOVER pages when you don't already have a URL (e.g. \"top "
            "competitors for X\", \"official pricing page of Y\"). Then read the "
            "best results with corelyx.web_fetch. Read-only, safe in dry runs."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "What to search for."},
                "max_results": {"type": "integer", "description": "Max results (default 5, max 10)."},
            },
            "required": ["query"],
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
    "corelyx.file": {
        "description": (
            "Read, write, list, search, move, copy, or delete files on the user's "
            "paired desktop device, inside folders they have granted. Use to act on "
            "local files dynamically while reasoning — read one, decide, then "
            "write/rename/file it. Read operations run even in dry-run; writes are "
            "simulated in dry-run and refused if the user restricted this agent to "
            "read-only. File contents you read are redacted before you see them, and "
            "every change is snapshotted so the user can roll it back."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "operation": {
                    "type": "string",
                    "enum": [
                        "read", "write", "append", "list", "stat",
                        "move", "copy", "delete", "mkdir", "search",
                    ],
                    "description": "The file operation to perform.",
                },
                "path": {
                    "type": "string",
                    "description": "Absolute path inside a granted folder (the file or folder to act on).",
                },
                "content": {
                    "type": "string",
                    "description": "Text to write (for write/append).",
                },
                "dest": {
                    "type": "string",
                    "description": "Destination path inside a granted folder (for move/copy).",
                },
                "pattern": {
                    "type": "string",
                    "description": "Name substring to match under the folder (for search).",
                },
                "recursive": {
                    "type": "boolean",
                    "description": "For delete: remove a non-empty directory tree.",
                },
            },
            "required": ["operation", "path"],
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
    "corelyx.read_agent_report": {
        "description": (
            "Read the latest report(s) of an agent you are directly related to — "
            "one you SPAWNED, or the parent that spawned you (or a re-run of the "
            "same agent). Use it to pick up a sub-agent's findings and build on "
            "them. Identify the agent by program_id or name. Read-only."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "program_id": {"type": "string", "description": "The agent's UUID."},
                "name": {"type": "string", "description": "The agent's name (exact or partial)."},
            },
        },
    },
    "corelyx.reference_agent": {
        "description": (
            "Record a peer cross-check link to another agent and pull back its "
            "latest report excerpt — e.g. have a fact-check agent verify your "
            "draft. Identify the agent by program_id or name; optional note. "
            "Read-only."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "program_id": {"type": "string", "description": "The peer agent's UUID."},
                "name": {"type": "string", "description": "The peer agent's name."},
                "note": {"type": "string", "description": "Why you're cross-checking (optional)."},
            },
        },
    },
    "corelyx.flag_critical": {
        "description": (
            "Escalate a message that shows a credible signal of harm (threat to "
            "life, violence, self-harm, abuse, poisoning/contamination/tampering, "
            "crime in progress, urgent legal/time-critical emergency) INSTEAD of "
            "triaging it away. It lands in the user's 'Flagged for review' inbox "
            "and alerts them. Use it the moment you spot such content — a false "
            "alarm is fine. Read-only, safe in dry runs."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "subject": {"type": "string", "description": "Short title of the flagged message."},
                "reason": {"type": "string", "description": "Why it's critical."},
                "snippet": {"type": "string", "description": "The relevant excerpt (optional)."},
                "categories": {"type": "array", "items": {"type": "string"}, "description": "Harm categories (optional)."},
                "source_ref": {"type": "string", "description": "Provider message id, if known (optional)."},
            },
            "required": ["reason"],
        },
    },
    "corelyx.spawn_agent": {
        "description": (
            "Spawn a child agent to own a distinct sub-task. It is created as a "
            "DRAFT in the user's Agents list and does NOT run automatically — the "
            "user reviews and approves each spawned agent first. Use sparingly "
            "(at most a few per run)."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Short name for the child agent."},
                "objective": {"type": "string", "description": "The child agent's goal."},
                "reason": {"type": "string", "description": "Why you're delegating this (optional)."},
            },
            "required": ["objective"],
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
