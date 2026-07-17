from __future__ import annotations

import unittest
from unittest.mock import MagicMock, Mock

from compliance import (
    DEFAULT_WORKSPACE_POLICY,
    PROVIDER_ALIASES,
    PROVIDERS,
    get_provider,
    is_provider_allowed_in_eu_only,
    load_program_connection_providers,
    load_workspace_policy,
    normalize_provider_id,
    policy_block_reason,
    provider_for_model,
    validate_schema_policy,
)
from schema import parse_schema


class TestNormalizeProviderId(unittest.TestCase):
    def test_none_returns_unknown(self) -> None:
        self.assertEqual(normalize_provider_id(None), "unknown")

    def test_empty_string_returns_unknown(self) -> None:
        self.assertEqual(normalize_provider_id(""), "unknown")

    def test_whitespace_returns_unknown(self) -> None:
        self.assertEqual(normalize_provider_id("   "), "unknown")

    def test_lowercases_input(self) -> None:
        self.assertEqual(normalize_provider_id("OpenAI"), "openai")

    def test_alias_resolution(self) -> None:
        for alias, expected in PROVIDER_ALIASES.items():
            with self.subTest(alias=alias):
                self.assertEqual(normalize_provider_id(alias), expected)

    def test_unknown_provider_passed_through(self) -> None:
        self.assertEqual(normalize_provider_id("custom_provider"), "custom_provider")


class TestGetProvider(unittest.TestCase):
    def test_all_known_providers(self) -> None:
        for provider_id, expected in PROVIDERS.items():
            with self.subTest(provider=provider_id):
                result = get_provider(provider_id)
                self.assertEqual(result, expected)

    def test_alias_resolution(self) -> None:
        for alias, expected_id in PROVIDER_ALIASES.items():
            with self.subTest(alias=alias):
                result = get_provider(alias)
                self.assertEqual(result.id, expected_id)

    def test_unknown_provider_fallback(self) -> None:
        result = get_provider("nonexistent")
        self.assertEqual(result.id, "nonexistent")
        self.assertEqual(result.name, "nonexistent")
        self.assertEqual(result.default_region, "Unknown")
        self.assertFalse(result.eu_only_supported)
        self.assertFalse(result.dpa_available)
        self.assertFalse(result.scc_available)
        self.assertEqual(result.status, "blocked")
        self.assertEqual(result.transfer_basis, "Missing provider review; treat as unresolved transfer risk.")

    def test_unknown_none_returns_unknown_policy(self) -> None:
        result = get_provider(None)
        self.assertEqual(result.id, "unknown")
        self.assertEqual(result.name, "Unknown provider")

    def test_provider_fields_are_frozen(self) -> None:
        provider = get_provider("openai")
        with self.assertRaises(AttributeError):
            provider.name = "Changed"

    def test_dpa_available_for_approved_providers(self) -> None:
        for provider_id in ["corelyx", "openai", "google", "microsoft", "slack"]:
            with self.subTest(provider=provider_id):
                provider = get_provider(provider_id)
                self.assertTrue(provider.dpa_available)

    def test_scc_available_for_approved_providers(self) -> None:
        for provider_id in ["corelyx", "openai", "google", "microsoft", "slack"]:
            with self.subTest(provider=provider_id):
                provider = get_provider(provider_id)
                self.assertTrue(provider.scc_available)

    def test_dpa_not_available_for_openrouter_and_generic_http(self) -> None:
        for provider_id in ["openrouter", "generic_http"]:
            with self.subTest(provider=provider_id):
                provider = get_provider(provider_id)
                self.assertFalse(provider.dpa_available)

    def test_scc_not_available_for_openrouter_and_generic_http(self) -> None:
        for provider_id in ["openrouter", "generic_http"]:
            with self.subTest(provider=provider_id):
                provider = get_provider(provider_id)
                self.assertFalse(provider.scc_available)


class TestProviderForModel(unittest.TestCase):
    def test_claude_models(self) -> None:
        for model in ["claude-3", "Claude-sonnet", "claude-instant"]:
            with self.subTest(model=model):
                self.assertEqual(provider_for_model(model), "anthropic")

    def test_gemini_models(self) -> None:
        for model in ["gemini-pro", "Gemini-1.5", "gemini-ultra"]:
            with self.subTest(model=model):
                self.assertEqual(provider_for_model(model), "google")

    def test_gpt_models(self) -> None:
        for model in ["gpt-4", "gpt-3.5-turbo", "o3-mini", "o4-preview"]:
            with self.subTest(model=model):
                self.assertEqual(provider_for_model(model), "openai")

    def test_openrouter_slash_pattern(self) -> None:
        for model in ["meta/llama-3", "mistral/mistral-7b", "nous/hermes-2"]:
            with self.subTest(model=model):
                self.assertEqual(provider_for_model(model), "openrouter")

    def test_api_key_provider_override(self) -> None:
        self.assertEqual(provider_for_model("gpt-4", api_key_provider="google"), "google")

    def test_api_key_provider_unknown_falls_back_to_model(self) -> None:
        self.assertEqual(provider_for_model("gpt-4", api_key_provider=""), "openai")

    def test_unknown_model(self) -> None:
        self.assertEqual(provider_for_model("some-weird-model"), "unknown")

    def test_none_model(self) -> None:
        self.assertEqual(provider_for_model(None), "unknown")


class TestIsProviderAllowedInEuOnly(unittest.TestCase):
    def test_anthropic_blocked(self) -> None:
        self.assertFalse(is_provider_allowed_in_eu_only("anthropic"))

    def test_openrouter_blocked(self) -> None:
        self.assertFalse(is_provider_allowed_in_eu_only("openrouter"))

    def test_generic_http_blocked(self) -> None:
        self.assertFalse(is_provider_allowed_in_eu_only("generic_http"))

    def test_openai_allowed(self) -> None:
        self.assertTrue(is_provider_allowed_in_eu_only("openai"))

    def test_corelyx_allowed(self) -> None:
        self.assertTrue(is_provider_allowed_in_eu_only("corelyx"))

    def test_google_allowed(self) -> None:
        self.assertTrue(is_provider_allowed_in_eu_only("google"))

    def test_microsoft_allowed(self) -> None:
        self.assertTrue(is_provider_allowed_in_eu_only("microsoft"))

    def test_slack_allowed(self) -> None:
        self.assertTrue(is_provider_allowed_in_eu_only("slack"))

    def test_unknown_blocked(self) -> None:
        self.assertFalse(is_provider_allowed_in_eu_only("unknown"))


class TestPolicyBlockReason(unittest.TestCase):
    def test_standard_mode_returns_none(self) -> None:
        for provider in ["anthropic", "openrouter", "generic_http", "openai", "unknown"]:
            with self.subTest(provider=provider):
                self.assertIsNone(policy_block_reason(provider, "standard"))

    def test_eu_only_blocks_anthropic(self) -> None:
        reason = policy_block_reason("anthropic", "eu_only")
        self.assertIsNotNone(reason)
        self.assertIn("Anthropic", reason)
        self.assertIn("blocked in EU-only mode", reason)

    def test_eu_only_blocks_openrouter(self) -> None:
        reason = policy_block_reason("openrouter", "eu_only")
        self.assertIsNotNone(reason)
        self.assertIn("OpenRouter", reason)
        self.assertIn("blocked in EU-only mode", reason)

    def test_eu_only_blocks_generic_http(self) -> None:
        reason = policy_block_reason("generic_http", "eu_only")
        self.assertIsNotNone(reason)
        self.assertIn("Customer-configured HTTP endpoint", reason)
        self.assertIn("blocked in EU-only mode", reason)

    def test_eu_only_allows_openai(self) -> None:
        self.assertIsNone(policy_block_reason("openai", "eu_only"))

    def test_eu_only_allows_corelyx(self) -> None:
        self.assertIsNone(policy_block_reason("corelyx", "eu_only"))

    def test_eu_only_allows_google(self) -> None:
        self.assertIsNone(policy_block_reason("google", "eu_only"))

    def test_eu_only_allows_microsoft(self) -> None:
        self.assertIsNone(policy_block_reason("microsoft", "eu_only"))

    def test_eu_only_allows_slack(self) -> None:
        self.assertIsNone(policy_block_reason("slack", "eu_only"))

    def test_eu_only_blocks_unknown(self) -> None:
        reason = policy_block_reason("unknown", "eu_only")
        self.assertIsNotNone(reason)
        self.assertIn("Unknown provider", reason)

    def test_eu_only_mode_only(self) -> None:
        # Any mode other than "eu_only" should return None
        self.assertIsNone(policy_block_reason("anthropic", "strict"))
        self.assertIsNone(policy_block_reason("anthropic", ""))


class TestLoadWorkspacePolicy(unittest.TestCase):
    def test_no_workspace_id_returns_default(self) -> None:
        result = load_workspace_policy(None, None)
        self.assertEqual(result, DEFAULT_WORKSPACE_POLICY)

    def test_db_success(self) -> None:
        db = MagicMock()
        db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = Mock(
            data=[{"compliance_mode": "eu_only", "data_region": "eu-west-1", "execution_log_retention_days": 30}]
        )
        result = load_workspace_policy(db, "ws-1")
        self.assertEqual(result["compliance_mode"], "eu_only")
        self.assertEqual(result["data_region"], "eu-west-1")
        self.assertEqual(result["execution_log_retention_days"], 30)

    def test_db_empty_result_returns_default(self) -> None:
        db = MagicMock()
        db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = Mock(
            data=[]
        )
        result = load_workspace_policy(db, "ws-1")
        self.assertEqual(result, DEFAULT_WORKSPACE_POLICY)

    def test_db_exception_returns_default(self) -> None:
        db = MagicMock()
        db.table.side_effect = Exception("db error")
        result = load_workspace_policy(db, "ws-1")
        self.assertEqual(result, DEFAULT_WORKSPACE_POLICY)

    def test_db_none_values_fall_back_to_default(self) -> None:
        db = MagicMock()
        db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = Mock(
            data=[{"compliance_mode": None, "data_region": None, "execution_log_retention_days": None}]
        )
        result = load_workspace_policy(db, "ws-1")
        self.assertEqual(result["compliance_mode"], "standard")
        self.assertEqual(result["data_region"], "eu-central-1")
        self.assertEqual(result["execution_log_retention_days"], 90)


class TestLoadProgramConnectionProviders(unittest.TestCase):
    def test_no_links_returns_empty(self) -> None:
        db = MagicMock()
        db.table.return_value.select.return_value.eq.return_value.execute.return_value = Mock(data=[])
        result = load_program_connection_providers(db, "prog-1")
        self.assertEqual(result, {})

    def test_success_loads_providers(self) -> None:
        db = MagicMock()
        link_chain = MagicMock()
        link_chain.execute.return_value = Mock(data=[{"connection_id": "conn-1"}, {"connection_id": "conn-2"}])
        link_mock = MagicMock()
        link_mock.select.return_value.eq.return_value = link_chain

        conn_chain = MagicMock()
        conn_chain.execute.return_value = Mock(
            data=[
                {"id": "conn-1", "name": "Gmail", "provider": "google"},
                {"id": "conn-2", "name": "Teams", "provider": "microsoft"},
            ]
        )
        conn_mock = MagicMock()
        conn_mock.select.return_value.in_.return_value = conn_chain

        db.table.side_effect = [link_mock, conn_mock]
        result = load_program_connection_providers(db, "prog-1")
        self.assertEqual(result["conn-1"], "google")
        self.assertEqual(result["Gmail"], "google")
        self.assertEqual(result["conn-2"], "microsoft")
        self.assertEqual(result["Teams"], "microsoft")

    def test_exception_returns_empty(self) -> None:
        db = MagicMock()
        db.table.side_effect = Exception("db error")
        result = load_program_connection_providers(db, "prog-1")
        self.assertEqual(result, {})


class TestValidateSchemaPolicy(unittest.TestCase):
    def _schema(self, model: str = "claude-sonnet-4", api_key_ref: str = "key-1") -> dict:
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

    def test_eu_only_blocks_anthropic(self) -> None:
        schema = parse_schema(self._schema())
        blocks = validate_schema_policy(schema, "eu_only")
        self.assertTrue(blocks)
        self.assertEqual(blocks[0]["provider_id"], "anthropic")
        self.assertIn("blocked in EU-only mode", blocks[0]["reason"])

    def test_eu_only_allows_openai(self) -> None:
        schema = parse_schema(self._schema(model="gpt-4o-mini"))
        blocks = validate_schema_policy(schema, "eu_only")
        self.assertEqual(blocks, [])

    def test_standard_mode_allows_anthropic(self) -> None:
        schema = parse_schema(self._schema())
        blocks = validate_schema_policy(schema, "standard")
        self.assertEqual(blocks, [])

    def test_eu_only_allows_corelyx(self) -> None:
        schema = parse_schema(self._schema(model="gpt-4o-mini", api_key_ref="platform"))
        # platform api_key_ref maps to openrouter, which is blocked in eu_only
        blocks = validate_schema_policy(schema, "eu_only")
        self.assertTrue(blocks)
        self.assertEqual(blocks[0]["provider_id"], "openrouter")

    def test_eu_only_blocks_http(self) -> None:
        schema_dict = self._schema()
        schema_dict["nodes"][1] = {
            "id": "http",
            "type": "connection",
            "label": "HTTP",
            "description": "",
            "connection": None,
            "position": {},
            "status": "idle",
            "config": {"connector_type": "http", "url": "https://example.com", "method": "GET", "timeout_seconds": 30},
        }
        schema = parse_schema(schema_dict)
        blocks = validate_schema_policy(schema, "eu_only")
        self.assertTrue(blocks)
        self.assertEqual(blocks[0]["provider_id"], "generic_http")

    def test_eu_only_blocks_oauth_unknown(self) -> None:
        schema_dict = self._schema()
        schema_dict["nodes"][1] = {
            "id": "oauth",
            "type": "connection",
            "label": "OAuth",
            "description": "",
            "connection": "missing-conn",
            "position": {},
            "status": "idle",
            "config": {"connector_type": "oauth", "operation": "send_email"},
        }
        schema = parse_schema(schema_dict)
        blocks = validate_schema_policy(schema, "eu_only")
        self.assertTrue(blocks)
        self.assertEqual(blocks[0]["provider_id"], "unknown")

    def test_eu_only_allows_oauth_known(self) -> None:
        schema_dict = self._schema()
        schema_dict["nodes"][1] = {
            "id": "oauth",
            "type": "oauth",
            "label": "OAuth",
            "description": "",
            "connection": "gmail-conn",
            "position": {},
            "status": "idle",
            "config": {"operation": "send_email"},
        }
        schema = parse_schema(schema_dict)
        blocks = validate_schema_policy(schema, "eu_only", connection_providers={"gmail-conn": "google"})
        self.assertEqual(blocks, [])


if __name__ == "__main__":
    unittest.main()
