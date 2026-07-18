"""Tests for #3 web_fetch and #4 capability scoping on agents."""

from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, Mock, patch

from engine.executor import ExecutionError, _strip_html_to_text
from tests.test_comprehensive_nodes_and_connections import _executor, _node, _program


def _agent_executor():
    node = _node("a1", "agent_task", {}, connection=None)
    ex = _executor(_program([node], []))
    ex._resolve_connection_id = Mock(return_value="conn-1")
    ex._provider_for_connection = Mock(return_value="slack")
    ex._fetch_oauth_token = AsyncMock(return_value="token")
    ex._enforce_provider_policy = AsyncMock()
    return ex


def _resp(status=200, text="hello", headers=None):
    r = Mock()
    r.status_code = status
    r.text = text
    r.headers = headers or {"content-type": "text/plain"}
    return r


# ─── #3 web_fetch ─────────────────────────────────────────────────────────────


class WebFetchTests(unittest.IsolatedAsyncioTestCase):
    async def test_requires_url(self):
        ex = _agent_executor()
        res = await ex._execute_agent_web_fetch({})
        self.assertFalse(res["ok"])
        self.assertIn("url", res["error"])

    async def test_blocks_private_address(self):
        ex = _agent_executor()
        # Real SSRF guard runs (no network) and rejects internal hosts.
        res = await ex._execute_agent_web_fetch({"url": "http://169.254.169.254/latest/meta-data"})
        self.assertFalse(res["ok"])

    async def test_blocks_non_http_scheme(self):
        ex = _agent_executor()
        res = await ex._execute_agent_web_fetch({"url": "file:///etc/passwd"})
        self.assertFalse(res["ok"])

    async def test_fetches_and_strips_html(self):
        ex = _agent_executor()
        client = Mock()
        client.request = AsyncMock(
            return_value=_resp(
                text="<html><head><style>x{}</style></head><body><h1>Hi</h1><p>There</p></body></html>",
                headers={"content-type": "text/html; charset=utf-8"},
            )
        )
        with (
            patch("engine.executor._validate_outbound_url", return_value=None),
            patch("engine.executor._get_llm_client", return_value=client),
        ):
            res = await ex._execute_agent_web_fetch({"url": "https://example.com"})
        self.assertTrue(res["ok"])
        self.assertNotIn("<", res["result"]["content"])
        self.assertIn("Hi", res["result"]["content"])
        self.assertNotIn("x{}", res["result"]["content"])  # style stripped

    async def test_follows_redirect_and_revalidates(self):
        ex = _agent_executor()
        client = Mock()
        client.request = AsyncMock(
            side_effect=[
                _resp(status=302, headers={"location": "https://example.com/final"}),
                _resp(status=200, text="done", headers={"content-type": "text/plain"}),
            ]
        )
        validate = Mock(return_value=None)
        with (
            patch("engine.executor._validate_outbound_url", validate),
            patch("engine.executor._get_llm_client", return_value=client),
        ):
            res = await ex._execute_agent_web_fetch({"url": "https://example.com"})
        self.assertTrue(res["ok"])
        self.assertEqual(res["result"]["content"], "done")
        self.assertEqual(validate.call_count, 2)  # both hops validated

    async def test_truncates_long_content(self):
        ex = _agent_executor()
        client = Mock()
        client.request = AsyncMock(return_value=_resp(text="A" * 50000))
        with (
            patch("engine.executor._validate_outbound_url", return_value=None),
            patch("engine.executor._get_llm_client", return_value=client),
        ):
            res = await ex._execute_agent_web_fetch({"url": "https://example.com"})
        self.assertTrue(res["result"]["truncated"])
        self.assertEqual(len(res["result"]["content"]), 20000)


class StripHtmlTests(unittest.TestCase):
    def test_collapses_and_unescapes(self):
        out = _strip_html_to_text("<p>Hello&amp;bye</p>\n\n\n<div>  x  </div>")
        self.assertIn("Hello&bye", out)
        self.assertNotIn("<p>", out)


# ─── #4 capability scoping ────────────────────────────────────────────────────


class CapabilityScopeTests(unittest.IsolatedAsyncioTestCase):
    async def test_read_only_blocks_write_connector_op(self):
        ex = _agent_executor()
        ex._agent_capabilities = {"allow_writes": False}
        res = await ex._execute_agent_connector_tool(
            {"connection": "slack:main", "operation": "send_message"}, "a1", "read_write"
        )
        self.assertFalse(res["ok"])
        self.assertIn("read-only", res["error"])

    async def test_read_only_allows_read_connector_op(self):
        ex = _agent_executor()
        ex._agent_capabilities = {"allow_writes": False}
        connector = Mock()
        connector.supported_operations = ["list_channels"]
        connector.execute = AsyncMock(return_value={"channels": []})
        with patch("engine.executor.get_connector", return_value=connector):
            res = await ex._execute_agent_connector_tool(
                {"connection": "slack:main", "operation": "list_channels"}, "a1", "read"
            )
        self.assertTrue(res["ok"])

    async def test_provider_allow_list_blocks_other_providers(self):
        ex = _agent_executor()
        ex._agent_capabilities = {"allow_writes": True, "allowed_providers": ["hubspot"]}
        connector = Mock()
        connector.supported_operations = ["list_channels"]
        with patch("engine.executor.get_connector", return_value=connector):
            res = await ex._execute_agent_connector_tool(
                {"connection": "slack:main", "operation": "list_channels"}, "a1", "read"
            )
        self.assertFalse(res["ok"])
        self.assertIn("allowed apps", res["error"])

    async def test_read_only_blocks_write_account_tool(self):
        ex = _agent_executor()
        ex._agent_capabilities = {"allow_writes": False}
        res = await ex._call_agent_tool("corelyx.trigger_program", {"program_id": "p1"}, "a1", "read_write")
        self.assertFalse(res["ok"])
        self.assertIn("read-only", res["error"])

    async def test_unrestricted_by_default(self):
        ex = _agent_executor()
        self.assertTrue(ex._agent_allows_writes())
        self.assertTrue(ex._agent_provider_allowed("anything"))


class CostCapTests(unittest.TestCase):
    def _usage(self, cost):
        # gpt-4o-mini unknown to pricing table in tests → use reported cost in usage.
        return {"usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2, "cost": cost}}

    def test_under_cap_ok(self):
        ex = _agent_executor()
        ex._limiter = Mock()
        ex._agent_capabilities = {"max_cost_usd": 1.0}
        ex._record_agent_llm_usage("a1", "m", self._usage(0.4))
        ex._record_agent_llm_usage("a1", "m", self._usage(0.4))  # total 0.8 < 1.0
        self.assertAlmostEqual(ex._agent_run_cost_usd, 0.8, places=4)

    def test_over_cap_raises(self):
        ex = _agent_executor()
        ex._limiter = Mock()
        ex._agent_capabilities = {"max_cost_usd": 1.0}
        ex._record_agent_llm_usage("a1", "m", self._usage(0.6))
        with self.assertRaises(ExecutionError) as ctx:
            ex._record_agent_llm_usage("a1", "m", self._usage(0.6))  # total 1.2 > 1.0
        self.assertEqual(ctx.exception.code, "AGENT_COST_CAP")

    def test_no_cap_never_raises(self):
        ex = _agent_executor()
        ex._limiter = Mock()
        ex._agent_capabilities = {}
        for _ in range(5):
            ex._record_agent_llm_usage("a1", "m", self._usage(100.0))  # no cap → fine


class AgentMarkupTests(unittest.TestCase):
    """Agent LLM calls on the platform key charge the same markup as workflow
    calls: ceil(cost * PLATFORM_MARKUP * CREDITS_PER_USD) credits."""

    def _usage(self, cost):
        return {"usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2, "cost": cost}}

    def test_platform_key_returns_marked_up_credits(self):
        ex = _agent_executor()
        ex._limiter = Mock()
        ex._agent_capabilities = {}
        ex._agent_billing_platform = True
        billed = ex._record_agent_llm_usage("a1", "m", self._usage(0.0123))
        # 0.0123 USD * 10 markup * 1000 credits/USD = 123 credits
        self.assertEqual(billed, 123)

    def test_byok_returns_zero_credits(self):
        ex = _agent_executor()
        ex._limiter = Mock()
        ex._agent_capabilities = {}
        ex._agent_billing_platform = False
        self.assertEqual(ex._record_agent_llm_usage("a1", "m", self._usage(0.0123)), 0)

    def test_free_model_returns_zero_credits(self):
        ex = _agent_executor()
        ex._limiter = Mock()
        ex._agent_capabilities = {}
        ex._agent_billing_platform = True
        self.assertEqual(
            ex._record_agent_llm_usage("a1", "openai/gpt-oss-120b", self._usage(0.0123)),
            0,
        )


class AgentModelAccessTests(unittest.TestCase):
    def test_free_tier_allows_only_the_free_platform_model(self):
        ex = _agent_executor()
        ex.model_access_tier = "free"
        ex._enforce_agent_model_access("platform", "openai/gpt-oss-120b", "a1")

        with self.assertRaises(ExecutionError) as ctx:
            ex._enforce_agent_model_access("platform", "openai/gpt-4o-mini", "a1")
        self.assertEqual(ctx.exception.code, "PLATFORM_MODEL_PLAN_REQUIRED")

    def test_free_tier_blocks_byok(self):
        ex = _agent_executor()
        ex.model_access_tier = "free"
        with self.assertRaises(ExecutionError) as ctx:
            ex._enforce_agent_model_access("saved-key", "openai/gpt-4o", "a1")
        self.assertEqual(ctx.exception.code, "BYOK_PLAN_REQUIRED")

    def test_solo_allows_byok_and_standard_platform_models(self):
        ex = _agent_executor()
        ex.model_access_tier = "plus"
        ex._enforce_agent_model_access("saved-key", "vendor/custom-model", "a1")
        ex._enforce_agent_model_access("platform", "openai/gpt-4o-mini", "a1")

        with self.assertRaises(ExecutionError) as ctx:
            ex._enforce_agent_model_access("platform", "openai/gpt-4o", "a1")
        self.assertEqual(ctx.exception.code, "PLATFORM_MODEL_PLAN_REQUIRED")

    def test_unlimited_tier_has_no_platform_model_ceiling(self):
        """Top plan and admins resolve to "unlimited", which carries no model
        ceiling anywhere else (run limits, credits, priority) — regression for
        the prod cron runs that failed with 'google/gemini-2.5-flash is not
        available ... on the Unlimited plan' after the gate shipped."""
        ex = _agent_executor()
        ex.model_access_tier = "unlimited"
        ex._enforce_agent_model_access("platform", "google/gemini-2.5-flash", "a1")
        ex._enforce_agent_model_access("platform", "vendor/any-future-model", "a1")
        ex._enforce_agent_model_access("saved-key", "vendor/custom-model", "a1")

    def test_metered_tiers_keep_the_catalog_ceiling(self):
        """Below "unlimited", platform-key models stay restricted to the
        catalog mirror — BYOK-only editor presets (e.g. gemini-2.5-flash) and
        premium upsell models are rejected with the plan-gate error."""
        for tier, model in (
            ("free", "google/gemini-2.5-flash"),
            ("plus", "google/gemini-2.5-flash"),
            ("plus", "anthropic/claude-sonnet-4.6"),
            ("builder", "google/gemini-2.5-flash"),
        ):
            with self.subTest(tier=tier, model=model):
                ex = _agent_executor()
                ex.model_access_tier = tier
                with self.assertRaises(ExecutionError) as ctx:
                    ex._enforce_agent_model_access("platform", model, "a1")
                self.assertEqual(ctx.exception.code, "PLATFORM_MODEL_PLAN_REQUIRED")


if __name__ == "__main__":
    unittest.main()
