from __future__ import annotations

import os
import time
import unittest
from unittest.mock import patch

from engine.run_limits import (
    RunLimitExceeded,
    RunLimits,
    RunLimiter,
    get_run_limits,
)


class RunLimitsDefaultTests(unittest.TestCase):
    def test_default_free_limits(self) -> None:
        limits = RunLimits().get_limits_for_plan("free")
        self.assertEqual(limits["max_nodes"], 100)
        self.assertEqual(limits["max_llm_tokens"], 100_000)
        self.assertEqual(limits["max_llm_calls"], 50)
        self.assertEqual(limits["max_cost"], 5.0)
        self.assertEqual(limits["max_execution_time"], 600)
        self.assertEqual(limits["max_connector_calls"], 100)

    def test_default_paid_limits(self) -> None:
        limits = RunLimits().get_limits_for_plan("paid")
        self.assertEqual(limits["max_nodes"], 500)
        self.assertEqual(limits["max_llm_tokens"], 1_000_000)
        self.assertEqual(limits["max_llm_calls"], 200)
        self.assertEqual(limits["max_cost"], 50.0)
        self.assertEqual(limits["max_execution_time"], 1800)
        self.assertEqual(limits["max_connector_calls"], 500)


class RunLimitsEnvOverrideTests(unittest.TestCase):
    @patch.dict(os.environ, {"MAX_NODES_PER_RUN": "42"}, clear=False)
    def test_int_env_override(self) -> None:
        rl = RunLimits()
        self.assertEqual(rl.max_nodes_per_run, 42)

    @patch.dict(os.environ, {"MAX_COST_PER_RUN": "12.5"}, clear=False)
    def test_float_env_override(self) -> None:
        rl = RunLimits()
        self.assertEqual(rl.max_cost_per_run, 12.5)

    @patch.dict(os.environ, {"MAX_NODES_PER_RUN": "not_a_number"}, clear=False)
    def test_int_env_bad_value_fallback(self) -> None:
        rl = RunLimits()
        self.assertEqual(rl.max_nodes_per_run, 100)

    @patch.dict(os.environ, {"MAX_COST_PER_RUN": "bad"}, clear=False)
    def test_float_env_bad_value_fallback(self) -> None:
        rl = RunLimits()
        self.assertEqual(rl.max_cost_per_run, 5.0)


class GetRunLimitsTests(unittest.TestCase):
    def test_singleton(self) -> None:
        a = get_run_limits()
        b = get_run_limits()
        self.assertIs(a, b)


class GetLimitsForPlanTests(unittest.TestCase):
    def test_free_plan(self) -> None:
        limits = get_run_limits().get_limits_for_plan("free")
        self.assertEqual(limits["max_nodes"], 100)

    def test_paid_plan(self) -> None:
        limits = get_run_limits().get_limits_for_plan("paid")
        self.assertEqual(limits["max_nodes"], 500)

    def test_unlimited_plan(self) -> None:
        limits = get_run_limits().get_limits_for_plan("unlimited")
        for key in limits:
            self.assertIsNone(limits[key])

    def test_unknown_plan_defaults_to_free(self) -> None:
        limits = get_run_limits().get_limits_for_plan("enterprise")
        self.assertEqual(limits["max_nodes"], 100)


class RunLimiterNodeLimitTests(unittest.TestCase):
    def test_check_node_limit_at_boundary(self) -> None:
        limiter = RunLimiter({"max_nodes": 2}, "run-1")
        limiter.check_node_limit()  # 1
        limiter.check_node_limit()  # 2
        with self.assertRaises(RunLimitExceeded):
            limiter.check_node_limit()  # 3

    def test_check_node_limit_no_limit(self) -> None:
        limiter = RunLimiter({"max_nodes": None}, "run-2")
        for _ in range(1000):
            limiter.check_node_limit()
        self.assertEqual(limiter.node_count, 1000)


class RunLimiterTokenLimitTests(unittest.TestCase):
    def test_check_llm_tokens_at_boundary(self) -> None:
        limiter = RunLimiter({"max_llm_tokens": 100}, "run-1")
        limiter.check_llm_tokens(50)
        limiter.check_llm_tokens(50)
        with self.assertRaises(RunLimitExceeded):
            limiter.check_llm_tokens(1)

    def test_check_llm_tokens_no_limit(self) -> None:
        limiter = RunLimiter({"max_llm_tokens": None}, "run-2")
        limiter.check_llm_tokens(1_000_000)
        self.assertEqual(limiter.llm_tokens, 1_000_000)


class RunLimiterCallLimitTests(unittest.TestCase):
    def test_check_llm_call_at_boundary(self) -> None:
        limiter = RunLimiter({"max_llm_calls": 1}, "run-1")
        limiter.check_llm_call()
        with self.assertRaises(RunLimitExceeded):
            limiter.check_llm_call()


class RunLimiterCostLimitTests(unittest.TestCase):
    def test_check_cost_at_boundary(self) -> None:
        limiter = RunLimiter({"max_cost": 1.0}, "run-1")
        limiter.check_cost(0.5)
        limiter.check_cost(0.5)
        with self.assertRaises(RunLimitExceeded):
            limiter.check_cost(0.01)

    def test_check_cost_no_limit(self) -> None:
        limiter = RunLimiter({"max_cost": None}, "run-2")
        limiter.check_cost(9999.0)
        self.assertEqual(limiter.estimated_cost, 9999.0)


class RunLimiterConnectorLimitTests(unittest.TestCase):
    def test_check_connector_call_at_boundary(self) -> None:
        limiter = RunLimiter({"max_connector_calls": 1}, "run-1")
        limiter.check_connector_call()
        with self.assertRaises(RunLimitExceeded):
            limiter.check_connector_call()


class RunLimiterExecutionTimeTests(unittest.TestCase):
    def test_check_execution_time_before_start(self) -> None:
        limiter = RunLimiter({"max_execution_time": 1}, "run-1")
        # start_time is None, should return without error.
        limiter.check_execution_time()

    def test_check_execution_time_exceeded(self) -> None:
        limiter = RunLimiter({"max_execution_time": 0}, "run-1")
        limiter.start()
        time.sleep(0.01)
        with self.assertRaises(RunLimitExceeded):
            limiter.check_execution_time()

    def test_check_execution_time_no_limit(self) -> None:
        limiter = RunLimiter({"max_execution_time": None}, "run-2")
        limiter.start()
        time.sleep(0.01)
        limiter.check_execution_time()


class RunLimiterUsageTests(unittest.TestCase):
    def test_get_usage(self) -> None:
        limiter = RunLimiter(
            {
                "max_nodes": 10,
                "max_llm_tokens": 1000,
                "max_llm_calls": 5,
                "max_cost": 10.0,
                "max_execution_time": 600,
                "max_connector_calls": 20,
            },
            "run-usage",
        )
        limiter.start()
        time.sleep(0.05)
        limiter.check_node_limit()
        limiter.check_llm_tokens(100)
        limiter.check_llm_call()
        limiter.check_cost(1.5)
        limiter.check_connector_call()

        usage = limiter.get_usage()
        self.assertEqual(usage["node_count"], 1)
        self.assertEqual(usage["llm_tokens"], 100)
        self.assertEqual(usage["llm_calls"], 1)
        self.assertEqual(usage["estimated_cost_usd"], 1.5)
        self.assertEqual(usage["connector_calls"], 1)
        self.assertGreaterEqual(usage["execution_time_seconds"], 0.04)


class RunLimitExceededTests(unittest.TestCase):
    def test_message_attribute(self) -> None:
        exc = RunLimitExceeded("Too many nodes")
        self.assertEqual(exc.message, "Too many nodes")
        self.assertEqual(str(exc), "Too many nodes")


class RunLimiterIntegrationTests(unittest.TestCase):
    def test_multiple_limits_respected(self) -> None:
        limits = {
            "max_nodes": 3,
            "max_llm_tokens": 50,
            "max_llm_calls": 2,
            "max_cost": 1.0,
            "max_execution_time": 10,
            "max_connector_calls": 1,
        }
        limiter = RunLimiter(limits, "run-int")
        limiter.start()
        limiter.check_node_limit()
        limiter.check_llm_tokens(10)
        limiter.check_llm_call()
        limiter.check_cost(0.1)
        limiter.check_connector_call()

        with self.assertRaises(RunLimitExceeded):
            limiter.check_connector_call()

    def test_legacy_boolean_api(self) -> None:
        rl = get_run_limits()
        self.assertEqual(rl.get_limits(True), rl.get_limits_for_plan("paid"))
        self.assertEqual(rl.get_limits(False), rl.get_limits_for_plan("free"))


if __name__ == "__main__":
    unittest.main()
