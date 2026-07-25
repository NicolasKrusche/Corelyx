"""
Circuit breaker pattern for external service calls.
Prevents cascading failures when services are down.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Optional, TypeVar

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
        failure_predicate: Optional[Callable[[BaseException], bool]] = None,
    ):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max_calls = half_open_max_calls
        self.expected_exception = expected_exception
        # Optional classifier: return True only for exceptions that should trip
        # the circuit (e.g. transport/5xx failures). Lets callers exclude
        # per-tenant config/limit errors that are not a shared-service outage.
        # When None, any `expected_exception` counts (legacy behaviour).
        self._failure_predicate = failure_predicate

        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._last_failure_time: float = 0
        self._half_open_calls = 0

    @property
    def state(self) -> CircuitState:
        return self._state

    def to_dict(self) -> dict[str, Any]:
        """Snapshot for the admin dashboard — real state, not the counts a caller tracked separately."""
        return {
            "name": self.name,
            "state": self._state.value.upper(),
            "failure_count": self._failure_count,
            "success_count": self._success_count,
            "last_failure_at": (
                datetime.fromtimestamp(self._last_failure_time, tz=timezone.utc).isoformat()
                if self._last_failure_time
                else None
            ),
        }

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
        except Exception as exc:
            if self._counts_as_failure(exc):
                self.record_failure()
            raise
        else:
            self.record_success()
            return result

    def _counts_as_failure(self, exc: BaseException) -> bool:
        """Whether `exc` should count against the circuit's failure budget."""
        if self._failure_predicate is not None:
            return bool(self._failure_predicate(exc))
        return isinstance(exc, self.expected_exception)


class CircuitOpenError(Exception):
    """Raised when circuit breaker is open."""

    pass


# Global circuit breaker registry
_circuit_breakers: dict[str, CircuitBreaker] = {}


def get_circuit_breaker(
    name: str,
    *,
    failure_predicate: Optional[Callable[[BaseException], bool]] = None,
) -> CircuitBreaker:
    """Get or create a circuit breaker by name.

    `failure_predicate` is applied only when the circuit is first created;
    subsequent lookups return the existing instance unchanged.
    """
    if name not in _circuit_breakers:
        _circuit_breakers[name] = CircuitBreaker(name, failure_predicate=failure_predicate)
    return _circuit_breakers[name]


def reset_all_circuits() -> None:
    """Reset all circuit breakers (useful for testing)."""
    _circuit_breakers.clear()


def list_known_circuits() -> list["CircuitBreaker"]:
    """The pre-defined circuits, eagerly instantiated so an admin dashboard
    sees a clean CLOSED baseline for a circuit that's never tripped, instead
    of it being absent from the response."""
    return [get_llm_circuit(), get_oauth_token_circuit(), get_vault_circuit()]


# Pre-defined circuit breakers for known services
LLM_CIRCUIT = "llm_proxy"
OAUTH_TOKEN_CIRCUIT = "oauth_token"
VAULT_CIRCUIT = "vault"


def get_llm_circuit(
    key: Optional[str] = None,
    *,
    failure_predicate: Optional[Callable[[BaseException], bool]] = None,
) -> CircuitBreaker:
    """Circuit breaker for LLM calls.

    `key` (e.g. the credential ref/provider) scopes the circuit so one tenant's
    dead key or exhausted quota can't open a circuit shared with every other
    tenant. Passing no key returns the un-scoped baseline used by the admin
    dashboard.
    """
    name = f"{LLM_CIRCUIT}:{key}" if key else LLM_CIRCUIT
    return get_circuit_breaker(name, failure_predicate=failure_predicate)


def get_oauth_token_circuit(
    key: Optional[str] = None,
    *,
    failure_predicate: Optional[Callable[[BaseException], bool]] = None,
) -> CircuitBreaker:
    """Circuit breaker for OAuth token refresh, scoped per `key` (connection)."""
    name = f"{OAUTH_TOKEN_CIRCUIT}:{key}" if key else OAUTH_TOKEN_CIRCUIT
    return get_circuit_breaker(name, failure_predicate=failure_predicate)


def get_vault_circuit() -> CircuitBreaker:
    """Get the circuit breaker for Vault API calls."""
    return get_circuit_breaker(VAULT_CIRCUIT)
