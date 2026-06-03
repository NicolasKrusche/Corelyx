"""
Run limits and resource protection.
Prevents runaway runs from consuming excessive resources.
"""
from __future__ import annotations

import os
from typing import Optional


class RunLimits:
    """
    Resource limits for workflow execution.
    
    Prevents:
    - Infinite loops
    - Excessive node execution
    - Runaway LLM costs
    - Memory exhaustion
    """
    
    def __init__(self):
        # Node execution limits
        self.max_nodes_per_run = self._int_env("MAX_NODES_PER_RUN", 100)
        self.max_nodes_per_run_paid = self._int_env("MAX_NODES_PER_RUN_PAID", 500)
        
        # LLM token limits
        self.max_llm_tokens_per_run = self._int_env("MAX_LLM_TOKENS_PER_RUN", 100_000)
        self.max_llm_tokens_per_run_paid = self._int_env(
            "MAX_LLM_TOKENS_PER_RUN_PAID", 1_000_000
        )
        
        # LLM call limits
        self.max_llm_calls_per_run = self._int_env("MAX_LLM_CALLS_PER_RUN", 50)
        self.max_llm_calls_per_run_paid = self._int_env(
            "MAX_LLM_CALLS_PER_RUN_PAID", 200
        )
        
        # Cost limits (USD)
        self.max_cost_per_run = self._float_env("MAX_COST_PER_RUN", 5.0)
        self.max_cost_per_run_paid = self._float_env("MAX_COST_PER_RUN_PAID", 50.0)
        
        # Execution time (seconds)
        self.max_execution_time = self._int_env("MAX_EXECUTION_TIME", 600)  # 10 min
        self.max_execution_time_paid = self._int_env(
            "MAX_EXECUTION_TIME_PAID", 1800  # 30 min
        )
        
        # Connector limits
        self.max_connector_calls_per_run = self._int_env(
            "MAX_CONNECTOR_CALLS_PER_RUN", 100
        )
        self.max_connector_calls_per_run_paid = self._int_env(
            "MAX_CONNECTOR_CALLS_PER_RUN_PAID", 500
        )
    
    @staticmethod
    def _int_env(name: str, default: int) -> int:
        """Read integer from environment with fallback."""
        try:
            return int(os.environ.get(name, default))
        except (ValueError, TypeError):
            return default
    
    @staticmethod
    def _float_env(name: str, default: float) -> float:
        """Read float from environment with fallback."""
        try:
            return float(os.environ.get(name, default))
        except (ValueError, TypeError):
            return default
    
    def get_limits(self, is_paid_plan: bool = False) -> dict:
        """Get limits for a user based on their plan (legacy boolean form)."""
        return self.get_limits_for_plan("paid" if is_paid_plan else "free")

    def get_limits_for_plan(self, plan: str) -> dict:
        """Get resource limits for a plan tier.

        ``"unlimited"`` (admin or unlimited-tier accounts) returns ``None`` for
        every limit, which the limiter treats as "no cap" — matching the
        unlimited platform-credit behaviour. ``"paid"`` returns the higher
        paid ceilings; anything else falls back to the free-tier ceilings.
        """
        if plan == "unlimited":
            return {
                "max_nodes": None,
                "max_llm_tokens": None,
                "max_llm_calls": None,
                "max_cost": None,
                "max_execution_time": None,
                "max_connector_calls": None,
            }
        if plan == "paid":
            return {
                "max_nodes": self.max_nodes_per_run_paid,
                "max_llm_tokens": self.max_llm_tokens_per_run_paid,
                "max_llm_calls": self.max_llm_calls_per_run_paid,
                "max_cost": self.max_cost_per_run_paid,
                "max_execution_time": self.max_execution_time_paid,
                "max_connector_calls": self.max_connector_calls_per_run_paid,
            }
        return {
            "max_nodes": self.max_nodes_per_run,
            "max_llm_tokens": self.max_llm_tokens_per_run,
            "max_llm_calls": self.max_llm_calls_per_run,
            "max_cost": self.max_cost_per_run,
            "max_execution_time": self.max_execution_time,
            "max_connector_calls": self.max_connector_calls_per_run,
        }


class RunLimiter:
    """
    Tracks resource usage during a run and enforces limits.
    
    Raises RunLimitExceeded when any limit is breached.
    """
    
    def __init__(self, limits: dict, run_id: str):
        self.limits = limits
        self.run_id = run_id
        
        # Counters
        self.node_count = 0
        self.llm_tokens = 0
        self.llm_calls = 0
        self.estimated_cost = 0.0
        self.connector_calls = 0
        self.start_time: Optional[float] = None
    
    def start(self) -> None:
        """Mark run start time."""
        import time
        self.start_time = time.time()
    
    def check_node_limit(self) -> None:
        """Check and increment node execution count."""
        self.node_count += 1
        limit = self.limits.get("max_nodes")
        if limit is not None and self.node_count > limit:
            raise RunLimitExceeded(
                f"Run exceeded maximum node executions ({limit}). "
                "This may indicate an infinite loop."
            )

    def check_llm_tokens(self, tokens: int) -> None:
        """Check and increment LLM token count."""
        self.llm_tokens += tokens
        limit = self.limits.get("max_llm_tokens")
        if limit is not None and self.llm_tokens > limit:
            raise RunLimitExceeded(
                f"Run exceeded maximum LLM tokens ({limit:,})."
            )

    def check_llm_call(self) -> None:
        """Check and increment LLM call count."""
        self.llm_calls += 1
        limit = self.limits.get("max_llm_calls")
        if limit is not None and self.llm_calls > limit:
            raise RunLimitExceeded(
                f"Run exceeded maximum LLM calls ({limit})."
            )

    def check_cost(self, additional_cost: float) -> None:
        """Check and increment estimated cost."""
        self.estimated_cost += additional_cost
        limit = self.limits.get("max_cost")
        if limit is not None and self.estimated_cost > limit:
            raise RunLimitExceeded(
                f"Run exceeded maximum cost (${limit:.2f})."
            )

    def check_connector_call(self) -> None:
        """Check and increment connector call count."""
        self.connector_calls += 1
        limit = self.limits.get("max_connector_calls")
        if limit is not None and self.connector_calls > limit:
            raise RunLimitExceeded(
                f"Run exceeded maximum connector calls ({limit})."
            )

    def check_execution_time(self) -> None:
        """Check if execution time exceeded."""
        import time
        if self.start_time is None:
            return
        limit = self.limits.get("max_execution_time")
        if limit is None:
            return
        elapsed = time.time() - self.start_time
        if elapsed > limit:
            raise RunLimitExceeded(
                f"Run exceeded maximum execution time ({limit}s)."
            )
    
    def get_usage(self) -> dict:
        """Get current usage statistics."""
        import time
        elapsed = time.time() - self.start_time if self.start_time else 0
        
        return {
            "node_count": self.node_count,
            "llm_tokens": self.llm_tokens,
            "llm_calls": self.llm_calls,
            "estimated_cost_usd": round(self.estimated_cost, 4),
            "connector_calls": self.connector_calls,
            "execution_time_seconds": round(elapsed, 2),
        }


class RunLimitExceeded(Exception):
    """Raised when a run exceeds resource limits."""
    
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


# Global limits instance
_run_limits: Optional[RunLimits] = None


def get_run_limits() -> RunLimits:
    """Get the global run limits configuration."""
    global _run_limits
    if _run_limits is None:
        _run_limits = RunLimits()
    return _run_limits
