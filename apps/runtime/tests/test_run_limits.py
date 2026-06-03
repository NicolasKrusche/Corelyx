from __future__ import annotations

import unittest

from engine.run_limits import RunLimiter, RunLimitExceeded, get_run_limits
from db import get_user_run_plan


class RunLimitsTierTests(unittest.TestCase):
    def test_unlimited_plan_has_no_caps(self):
        limits = get_run_limits().get_limits_for_plan("unlimited")
        limiter = RunLimiter(limits, "run-1")
        limiter.start()
        # Far beyond any free/paid ceiling — must not raise.
        limiter.check_llm_tokens(5_000_000)
        for _ in range(1000):
            limiter.check_llm_call()
            limiter.check_node_limit()
            limiter.check_connector_call()
        limiter.check_cost(10_000.0)
        limiter.check_execution_time()
        self.assertEqual(limiter.llm_tokens, 5_000_000)

    def test_free_plan_enforces_token_cap(self):
        limits = get_run_limits().get_limits_for_plan("free")
        limiter = RunLimiter(limits, "run-2")
        limiter.start()
        with self.assertRaises(RunLimitExceeded):
            limiter.check_llm_tokens(100_001)

    def test_paid_plan_allows_more_tokens_than_free(self):
        limits = get_run_limits().get_limits_for_plan("paid")
        limiter = RunLimiter(limits, "run-3")
        limiter.start()
        # Over the free cap but under the paid cap — must not raise.
        limiter.check_llm_tokens(200_000)
        self.assertEqual(limiter.llm_tokens, 200_000)

    def test_legacy_boolean_get_limits_still_works(self):
        rl = get_run_limits()
        self.assertEqual(rl.get_limits(True), rl.get_limits_for_plan("paid"))
        self.assertEqual(rl.get_limits(False), rl.get_limits_for_plan("free"))


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, rows):
        self._rows = rows

    def select(self, _cols):
        return self

    def eq(self, _col, _val):
        return self

    def limit(self, _n):
        return self

    def execute(self):
        return _Result(self._rows)


class _FakeClient:
    def __init__(self, rows):
        self._rows = rows

    def table(self, _name):
        return _Query(self._rows)


class GetUserRunPlanTests(unittest.TestCase):
    def test_admin_is_unlimited(self):
        db = _FakeClient([{"tier": "free", "is_admin": True}])
        self.assertEqual(get_user_run_plan(db, "u1"), "unlimited")

    def test_unlimited_tier_is_unlimited(self):
        db = _FakeClient([{"tier": "unlimited", "is_admin": False}])
        self.assertEqual(get_user_run_plan(db, "u1"), "unlimited")

    def test_paid_tiers(self):
        for tier in ("plus", "pro", "builder"):
            db = _FakeClient([{"tier": tier, "is_admin": False}])
            self.assertEqual(get_user_run_plan(db, "u1"), "paid")

    def test_free_tier_and_missing_profile(self):
        self.assertEqual(get_user_run_plan(_FakeClient([{"tier": "free", "is_admin": False}]), "u1"), "free")
        self.assertEqual(get_user_run_plan(_FakeClient([]), "u1"), "free")

    def test_empty_user_id_is_free(self):
        self.assertEqual(get_user_run_plan(_FakeClient([]), ""), "free")


if __name__ == "__main__":
    unittest.main()
