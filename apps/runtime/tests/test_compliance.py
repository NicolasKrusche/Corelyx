from compliance import (
    is_provider_allowed_in_eu_only,
    policy_block_reason,
    validate_schema_policy,
)
from schema import parse_schema


def _schema(model: str = "claude-sonnet-4", api_key_ref: str = "key-1") -> dict:
    return {
        "version": "1.0",
        "program_id": "prog",
        "program_name": "Compliance",
        "execution_mode": "autonomous",
        "nodes": [
            {
                "id": "trigger",
                "type": "trigger",
                "label": "Manual trigger",
                "description": "",
                "connection": None,
                "position": {},
                "status": "idle",
                "config": {"trigger_type": "manual"},
            },
            {
                "id": "agent",
                "type": "agent",
                "label": "Agent",
                "description": "",
                "connection": None,
                "position": {},
                "status": "idle",
                "config": {
                    "model": model,
                    "api_key_ref": api_key_ref,
                    "system_prompt": "Summarize",
                    "requires_approval": False,
                    "approval_timeout_hours": 1,
                    "retry": {
                        "max_attempts": 1,
                        "backoff": "none",
                        "backoff_base_seconds": 0,
                        "fail_program_on_exhaust": False,
                    },
                    "tools": [],
                },
            },
        ],
        "edges": [{"id": "e1", "from": "trigger", "to": "agent"}],
    }


def test_eu_only_blocks_anthropic_runtime_policy():
    schema = parse_schema(_schema())

    blocks = validate_schema_policy(schema, "eu_only")

    assert blocks
    assert blocks[0]["provider_id"] == "anthropic"
    assert "blocked in EU-only mode" in blocks[0]["reason"]


def test_eu_only_allows_reviewed_openai_provider_entry():
    schema = parse_schema(_schema(model="gpt-4o-mini"))

    blocks = validate_schema_policy(schema, "eu_only")

    assert blocks == []
    assert is_provider_allowed_in_eu_only("openai") is True


def test_standard_mode_still_blocks_missing_dpa_entries():
    assert policy_block_reason("generic_http", "standard") == (
        "Customer-configured HTTP endpoint is missing a completed DPA entry."
    )
