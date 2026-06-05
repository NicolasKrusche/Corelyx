"""Comprehensive tests for engine.circuit_breaker."""
from __future__ import annotations

import asyncio
import time
import unittest
from unittest.mock import AsyncMock, patch

from engine.circuit_breaker import (
    CircuitBreaker,
    CircuitOpenError,
    CircuitState,
    get_llm_circuit,
    get_oauth_token_circuit,
    get_vault_circuit,
    get_circuit_breaker,
    reset_all_circuits,
)


class TestCircuitBreakerInit(unittest.TestCase):
    def test_init_default_values(self):
        cb = CircuitBreaker("svc")
        self.assertEqual(cb.name, "svc")
        self.assertEqual(cb.failure_threshold, 5)
        self.assertEqual(cb.recovery_timeout, 60.0)
        self.assertEqual(cb.half_open_max_calls, 3)
        self.assertEqual(cb.expected_exception, Exception)

    def test_init_custom_values(self):
        cb = CircuitBreaker(
            "svc",
            failure_threshold=10,
            recovery_timeout=120.0,
            half_open_max_calls=5,
            expected_exception=ValueError,
        )
        self.assertEqual(cb.failure_threshold, 10)
        self.assertEqual(cb.recovery_timeout, 120.0)
        self.assertEqual(cb.half_open_max_calls, 5)
        self.assertEqual(cb.expected_exception, ValueError)

    def test_initial_state_is_closed(self):
        cb = CircuitBreaker("svc")
        self.assertEqual(cb.state, CircuitState.CLOSED)
        self.assertTrue(cb.can_execute())


class TestCircuitBreakerSuccess(unittest.TestCase):
    async def _run(self, cb, func):
        return await cb.call(func)

    def test_successful_call_records_success(self):
        cb = CircuitBreaker("svc")
        mock = AsyncMock(return_value="ok")
        result = asyncio.run(self._run(cb, mock))
        self.assertEqual(result, "ok")
        self.assertEqual(cb._failure_count, 0)
        self.assertEqual(cb.state, CircuitState.CLOSED)
        mock.assert_awaited_once()

    def test_record_success_decrements_failure_count_in_closed_state(self):
        cb = CircuitBreaker("svc")
        cb._failure_count = 2
        cb.record_success()
        self.assertEqual(cb._failure_count, 1)
        cb.record_success()
        self.assertEqual(cb._failure_count, 0)
        cb.record_success()
        self.assertEqual(cb._failure_count, 0)

    def test_call_passes_through_args_and_kwargs(self):
        cb = CircuitBreaker("svc")
        mock = AsyncMock(return_value="result")
        result = asyncio.run(cb.call(mock, "arg1", key="val"))
        self.assertEqual(result, "result")
        mock.assert_awaited_once_with("arg1", key="val")


class TestCircuitBreakerFailure(unittest.TestCase):
    def test_single_failure_does_not_open(self):
        cb = CircuitBreaker("svc", failure_threshold=3)
        mock = AsyncMock(side_effect=RuntimeError("boom"))
        with self.assertRaises(RuntimeError):
            asyncio.run(cb.call(mock))
        self.assertEqual(cb._failure_count, 1)
        self.assertEqual(cb.state, CircuitState.CLOSED)

    def test_failure_threshold_opens_circuit(self):
        cb = CircuitBreaker("svc", failure_threshold=2)
        mock = AsyncMock(side_effect=RuntimeError("boom"))
        for _ in range(2):
            with self.assertRaises(RuntimeError):
                asyncio.run(cb.call(mock))
        self.assertEqual(cb.state, CircuitState.OPEN)

    def test_open_circuit_rejects_calls(self):
        cb = CircuitBreaker("svc", failure_threshold=1)
        mock = AsyncMock(side_effect=RuntimeError("boom"))
        with self.assertRaises(RuntimeError):
            asyncio.run(cb.call(mock))
        self.assertFalse(cb.can_execute())
        with self.assertRaises(CircuitOpenError):
            asyncio.run(cb.call(mock))

    def test_open_circuit_raises_circuit_open_error(self):
        cb = CircuitBreaker("svc", failure_threshold=1)
        cb._state = CircuitState.OPEN
        cb._last_failure_time = time.time()
        mock = AsyncMock(return_value="ok")
        with self.assertRaises(CircuitOpenError) as ctx:
            asyncio.run(cb.call(mock))
        self.assertIn("OPEN", str(ctx.exception))

    def test_expected_exception_filtering(self):
        cb = CircuitBreaker("svc", failure_threshold=1, expected_exception=ValueError)
        mock = AsyncMock(side_effect=RuntimeError("boom"))
        with self.assertRaises(RuntimeError):
            asyncio.run(cb.call(mock))
        self.assertEqual(cb._failure_count, 0)

    def test_unexpected_exception_not_recorded_as_failure(self):
        cb = CircuitBreaker("svc", failure_threshold=1, expected_exception=ValueError)
        mock = AsyncMock(side_effect=RuntimeError("boom"))
        with self.assertRaises(RuntimeError):
            asyncio.run(cb.call(mock))
        self.assertEqual(cb.state, CircuitState.CLOSED)


class TestCircuitBreakerStateTransitions(unittest.TestCase):
    def test_half_open_allows_limited_calls(self):
        cb = CircuitBreaker("svc", failure_threshold=1, half_open_max_calls=2)
        cb._state = CircuitState.OPEN
        cb._last_failure_time = time.time() - cb.recovery_timeout - 1
        self.assertTrue(cb.can_execute())
        self.assertEqual(cb.state, CircuitState.HALF_OPEN)
        cb._half_open_calls = 1
        self.assertTrue(cb.can_execute())
        cb._half_open_calls = 2
        self.assertFalse(cb.can_execute())

    def test_half_open_success_closes_circuit(self):
        cb = CircuitBreaker("svc", failure_threshold=1, half_open_max_calls=1)
        cb._state = CircuitState.HALF_OPEN
        cb.record_success()
        self.assertEqual(cb.state, CircuitState.CLOSED)

    def test_half_open_failure_reopens_circuit(self):
        cb = CircuitBreaker("svc", failure_threshold=1, half_open_max_calls=3)
        cb._state = CircuitState.HALF_OPEN
        cb.record_failure()
        self.assertEqual(cb.state, CircuitState.OPEN)

    def test_open_circuit_transitions_to_half_open_after_timeout(self):
        cb = CircuitBreaker("svc", recovery_timeout=1)
        cb._state = CircuitState.OPEN
        cb._last_failure_time = time.time() - 2
        self.assertTrue(cb.can_execute())
        self.assertEqual(cb.state, CircuitState.HALF_OPEN)

    def test_half_open_multiple_successes_close(self):
        cb = CircuitBreaker("svc", half_open_max_calls=3)
        cb._state = CircuitState.HALF_OPEN
        for _ in range(3):
            cb.record_success()
        self.assertEqual(cb.state, CircuitState.CLOSED)

    def test_half_open_single_failure_opens(self):
        cb = CircuitBreaker("svc", half_open_max_calls=3)
        cb._state = CircuitState.HALF_OPEN
        cb.record_failure()
        self.assertEqual(cb.state, CircuitState.OPEN)

    def test_close_resets_counters(self):
        cb = CircuitBreaker("svc")
        cb._failure_count = 5
        cb._success_count = 2
        cb._half_open_calls = 1
        cb._last_failure_time = time.time()
        cb._close_circuit()
        self.assertEqual(cb._failure_count, 0)
        self.assertEqual(cb._success_count, 0)
        self.assertEqual(cb._half_open_calls, 0)
        self.assertEqual(cb._last_failure_time, 0)

    def test_open_resets_half_open_and_success_counters(self):
        cb = CircuitBreaker("svc")
        cb._success_count = 2
        cb._half_open_calls = 1
        cb._open_circuit()
        self.assertEqual(cb._success_count, 0)
        self.assertEqual(cb._half_open_calls, 0)


class TestCircuitBreakerCall(unittest.TestCase):
    def test_call_increments_half_open_calls(self):
        cb = CircuitBreaker("svc", failure_threshold=1, recovery_timeout=0, half_open_max_calls=3)
        cb._state = CircuitState.OPEN
        cb._last_failure_time = time.time() - 1
        mock = AsyncMock(return_value="ok")
        asyncio.run(cb.call(mock))
        self.assertEqual(cb._half_open_calls, 1)

    def test_call_does_not_increment_half_open_in_closed(self):
        cb = CircuitBreaker("svc")
        mock = AsyncMock(return_value="ok")
        asyncio.run(cb.call(mock))
        self.assertEqual(cb._half_open_calls, 0)


class TestGlobalCircuits(unittest.TestCase):
    def setUp(self):
        reset_all_circuits()

    def tearDown(self):
        reset_all_circuits()

    def test_get_llm_circuit_returns_same_instance(self):
        c1 = get_llm_circuit()
        c2 = get_llm_circuit()
        self.assertIs(c1, c2)
        self.assertEqual(c1.name, "llm_proxy")

    def test_get_oauth_token_circuit_returns_same_instance(self):
        c1 = get_oauth_token_circuit()
        c2 = get_oauth_token_circuit()
        self.assertIs(c1, c2)
        self.assertEqual(c1.name, "oauth_token")

    def test_get_vault_circuit_returns_same_instance(self):
        c1 = get_vault_circuit()
        c2 = get_vault_circuit()
        self.assertIs(c1, c2)
        self.assertEqual(c1.name, "vault")

    def test_reset_all_circuits_clears_registry(self):
        c1 = get_llm_circuit()
        reset_all_circuits()
        c2 = get_llm_circuit()
        self.assertIsNot(c1, c2)

    def test_get_circuit_breaker_creates_named_instance(self):
        cb = get_circuit_breaker("my_service")
        self.assertEqual(cb.name, "my_service")


class TestCircuitBreakerAsyncEdgeCases(unittest.TestCase):
    def test_half_open_success_below_threshold_stays_half_open(self):
        cb = CircuitBreaker("svc", half_open_max_calls=3)
        cb._state = CircuitState.HALF_OPEN
        cb.record_success()
        self.assertEqual(cb.state, CircuitState.HALF_OPEN)
        cb.record_success()
        self.assertEqual(cb.state, CircuitState.HALF_OPEN)
        cb.record_success()
        self.assertEqual(cb.state, CircuitState.CLOSED)

    def test_success_in_closed_reduces_failure_count(self):
        cb = CircuitBreaker("svc", failure_threshold=5)
        cb._failure_count = 3
        cb.record_success()
        self.assertEqual(cb._failure_count, 2)
        cb.record_success()
        self.assertEqual(cb._failure_count, 1)
        cb.record_success()
        self.assertEqual(cb._failure_count, 0)
        cb.record_success()
        self.assertEqual(cb._failure_count, 0)

    def test_can_execute_returns_false_when_half_open_max_calls_reached(self):
        cb = CircuitBreaker("svc", half_open_max_calls=2)
        cb._state = CircuitState.HALF_OPEN
        cb._half_open_calls = 2
        self.assertFalse(cb.can_execute())

    def test_record_failure_sets_last_failure_time(self):
        cb = CircuitBreaker("svc")
        before = time.time()
        cb.record_failure()
        after = time.time()
        self.assertTrue(before <= cb._last_failure_time <= after)

    def test_async_call_with_expected_exception(self):
        cb = CircuitBreaker("svc", failure_threshold=1, expected_exception=ValueError)
        mock = AsyncMock(side_effect=ValueError("bad"))
        with self.assertRaises(ValueError):
            asyncio.run(cb.call(mock))
        self.assertEqual(cb._failure_count, 1)
        self.assertEqual(cb.state, CircuitState.OPEN)


if __name__ == "__main__":
    unittest.main()
