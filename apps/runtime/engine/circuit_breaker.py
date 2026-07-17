"""
Circuit breaker pattern for external service calls.
Prevents cascading failures when services are down.
"""

from __future__ import annotations

import time
from enum import Enum
from typing import Any, Callable, TypeVar

T = TypeVar("T")


class CircuitState(Enum):
    CLOSED = "closed"  # Normal operation
    OPEN = "open"  # Failing, reject calls
    HALF_OPEN = "half_open"  # Testing if recovered


class CircuitBreaker:
    """
    Circuit breaker for external service calls.

    - CLOSED: Normal operation, calls pass through
    - OPEN: Service failing, calls immediately rejected
    - HALF_OPEN: Testing if service recovered

    Config:
        failure_threshold: Number of failures before opening
        recovery_timeout: Seconds before attempting recovery
        half_open_max_calls: Number of test calls in half-open state
    """

    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout: float = 60.0,
        half_open_max_calls: int = 3,
        expected_exception: type[Exception] = Exception,
    ):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max_calls = half_open_max_calls
        self.expected_exception = expected_exception

        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._last_failure_time: float = 0
        self._half_open_calls = 0

    @property
    def state(self) -> CircuitState:
        return self._state

    def can_execute(self) -> bool:
        """Check if a call should be allowed through."""
        if self._state == CircuitState.CLOSED:
            return True

        if self._state == CircuitState.OPEN:
            if time.time() - self._last_failure_time >= self.recovery_timeout:
                self._state = CircuitState.HALF_OPEN
                self._half_open_calls = 0
                print(f"[circuit:{self.name}] Transitioning to HALF_OPEN")
                return True
            return False

        # HALF_OPEN
        if self._half_open_calls < self.half_open_max_calls:
            return True
        return False

    def record_success(self) -> None:
        """Record a successful call."""
        if self._state == CircuitState.HALF_OPEN:
            self._success_count += 1
            if self._success_count >= self.half_open_max_calls:
                self._close_circuit()
        else:
            self._failure_count = max(0, self._failure_count - 1)

    def record_failure(self) -> None:
        """Record a failed call."""
        self._failure_count += 1
        self._last_failure_time = time.time()

        if self._state == CircuitState.HALF_OPEN:
            self._open_circuit()
        elif self._failure_count >= self.failure_threshold:
            self._open_circuit()

    def _open_circuit(self) -> None:
        """Open the circuit - reject calls."""
        if self._state != CircuitState.OPEN:
            print(
                f"[circuit:{self.name}] OPEN - too many failures ({self._failure_count})",
                flush=True,
            )
        self._state = CircuitState.OPEN
        self._half_open_calls = 0
        self._success_count = 0

    def _close_circuit(self) -> None:
        """Close the circuit - normal operation."""
        print(f"[circuit:{self.name}] CLOSED - service recovered", flush=True)
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._half_open_calls = 0
        self._last_failure_time = 0

    async def call(self, func: Callable[..., T], *args: Any, **kwargs: Any) -> T:
        """
        Execute a function with circuit breaker protection.

        Raises CircuitOpenError if circuit is open.
        """
        if not self.can_execute():
            raise CircuitOpenError(f"Circuit '{self.name}' is OPEN - service temporarily unavailable")

        if self._state == CircuitState.HALF_OPEN:
            self._half_open_calls += 1

        try:
            result = await func(*args, **kwargs)
            self.record_success()
            return result
        except self.expected_exception:
            self.record_failure()
            raise


class CircuitOpenError(Exception):
    """Raised when circuit breaker is open."""

    pass


# Global circuit breaker registry
_circuit_breakers: dict[str, CircuitBreaker] = {}


def get_circuit_breaker(name: str) -> CircuitBreaker:
    """Get or create a circuit breaker by name."""
    if name not in _circuit_breakers:
        _circuit_breakers[name] = CircuitBreaker(name)
    return _circuit_breakers[name]


def reset_all_circuits() -> None:
    """Reset all circuit breakers (useful for testing)."""
    _circuit_breakers.clear()


# Pre-defined circuit breakers for known services
LLM_CIRCUIT = "llm_proxy"
OAUTH_TOKEN_CIRCUIT = "oauth_token"
VAULT_CIRCUIT = "vault"


def get_llm_circuit() -> CircuitBreaker:
    """Get the circuit breaker for LLM calls."""
    return get_circuit_breaker(LLM_CIRCUIT)


def get_oauth_token_circuit() -> CircuitBreaker:
    """Get the circuit breaker for OAuth token refresh."""
    return get_circuit_breaker(OAUTH_TOKEN_CIRCUIT)


def get_vault_circuit() -> CircuitBreaker:
    """Get the circuit breaker for Vault API calls."""
    return get_circuit_breaker(VAULT_CIRCUIT)
