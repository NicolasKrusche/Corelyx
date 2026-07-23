"""Connector Health Monitor — periodic health checks with auto-retry and exponential backoff.

Runs health checks against connector upstream APIs, stores events in
the ``connector_health_events`` Supabase table, and tracks retry state
with exponential backoff (base 1 s, max 60 s, 5 retries).

Usage::

    from connectors.health_monitor import ConnectorHealthMonitor

    monitor = ConnectorHealthMonitor(supabase_url=..., supabase_key=...)
    report = await monitor.check_all(workspace_id="...")
    single  = await monitor.check_connector("gmail", workspace_id="...", access_token="...")

Credentials are NEVER logged or returned to callers — only metadata and status.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any

import httpx
from supabase import Client, create_client

from .sdk.base import BaseConnector, IConnector
from .sdk.types import HealthCheckResult
from . import get_connector

logger = logging.getLogger(__name__)

# ─── Constants ──────────────────────────────────────────────────────────────

BACKOFF_BASE_SECONDS = 1.0
BACKOFF_MAX_SECONDS = 60.0
MAX_RETRIES = 5

HEALTH_CHECK_TIMEOUT = 15.0  # seconds per individual check


# ─── Types ──────────────────────────────────────────────────────────────────

class CheckType(str, Enum):
    """Types of health checks that can be performed."""
    CONNECTION_TEST = "connection_test"
    AUTH_VALIDITY = "auth_validity"
    RATE_LIMIT_STATUS = "rate_limit_status"


class HealthStatus(str, Enum):
    """Overall status of a connector health check."""
    HEALTHY = "healthy"
    WARNING = "warning"
    CRITICAL = "critical"


@dataclass
class HealthCheckEvent:
    """A single health check event to be stored in the database."""
    connector_name: str
    workspace_id: str | None
    check_type: CheckType
    status: HealthStatus
    error_message: str | None = None
    latency_ms: float | None = None
    retry_count: int = 0
    next_retry_at: datetime | None = None
    checked_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class ConnectorHealthSummary:
    """Aggregated health status for a single connector."""
    connector_name: str
    status: HealthStatus
    status_icon: str  # 🟢 🟡 🔴
    last_checked_at: datetime | None = None
    error_message: str | None = None
    retry_count: int = 0
    next_retry_at: datetime | None = None
    latency_ms: float | None = None
    check_type: CheckType = CheckType.CONNECTION_TEST


@dataclass
class HealthReport:
    """Full health report for all connectors in a workspace."""
    connectors: list[ConnectorHealthSummary]
    total: int = 0
    healthy: int = 0
    warning: int = 0
    critical: int = 0
    needs_attention: list[str] = field(default_factory=list)


# ─── Backoff calculator ─────────────────────────────────────────────────────

def compute_backoff(retry_count: int) -> float:
    """Compute exponential backoff delay in seconds.

    Formula: min(BASE * 2^retry_count, MAX)
    """
    delay = BACKOFF_BASE_SECONDS * (2 ** retry_count)
    return min(delay, BACKOFF_MAX_SECONDS)


def compute_next_retry_at(retry_count: int) -> datetime:
    """Compute the UTC timestamp when the next retry should occur."""
    delay = compute_backoff(retry_count)
    return datetime.now(timezone.utc) + timedelta(seconds=delay)


# ─── Health Monitor ─────────────────────────────────────────────────────────

class ConnectorHealthMonitor:
    """Monitors connector health with automatic retry and exponential backoff.

    This class is designed to be used server-side only. It stores health
    events in Supabase and never exposes credentials to callers.

    Args:
        supabase_url: Supabase project URL.
        supabase_key: Supabase service-role key (bypasses RLS for writes).
    """

    def __init__(self, supabase_url: str, supabase_key: str) -> None:
        self._supabase: Client = create_client(supabase_url, supabase_key)
        self._http_client = httpx.AsyncClient(timeout=HEALTH_CHECK_TIMEOUT)

    async def close(self) -> None:
        """Clean up HTTP client resources."""
        await self._http_client.aclose()

    # ── Single connector check ───────────────────────────────────────────

    async def check_connector(
        self,
        connector_name: str,
        workspace_id: str | None = None,
        access_token: str = "",
        check_type: CheckType = CheckType.CONNECTION_TEST,
    ) -> ConnectorHealthSummary:
        """Run a health check on a single connector and store the result.

        Args:
            connector_name: Provider slug (e.g. "gmail", "slack").
            workspace_id: Workspace the connector belongs to.
            access_token: Valid access token for the connector (server-side only).
            check_type: Type of health check to perform.

        Returns:
            Summary of the health check result.
        """
        connector = get_connector(connector_name)
        if connector is None:
            return ConnectorHealthSummary(
                connector_name=connector_name,
                status=HealthStatus.CRITICAL,
                status_icon="🔴",
                error_message=f"Connector '{connector_name}' not found",
                check_type=check_type,
            )

        start = time.monotonic()
        result = await self._run_check(connector, access_token, check_type)
        latency_ms = (time.monotonic() - start) * 1000

        status = HealthStatus.HEALTHY if result.healthy else HealthStatus.CRITICAL
        status_icon = "🟢" if result.healthy else "🔴"

        # Determine retry state
        retry_count = 0
        next_retry_at: datetime | None = None

        if not result.healthy:
            # Look up previous retry count from most recent event for this connector
            retry_count = await self._get_latest_retry_count(connector_name, workspace_id)
            if retry_count < MAX_RETRIES:
                next_retry_at = compute_next_retry_at(retry_count)
                retry_count += 1
                status = HealthStatus.WARNING
                status_icon = "🟡"
            else:
                # Max retries exceeded — keep critical
                pass

        event = HealthCheckEvent(
            connector_name=connector_name,
            workspace_id=workspace_id,
            check_type=check_type,
            status=status,
            error_message=result.message if not result.healthy else None,
            latency_ms=latency_ms,
            retry_count=retry_count,
            next_retry_at=next_retry_at,
        )

        await self._store_event(event)

        return ConnectorHealthSummary(
            connector_name=connector_name,
            status=status,
            status_icon=status_icon,
            last_checked_at=event.checked_at,
            error_message=event.error_message,
            retry_count=retry_count,
            next_retry_at=next_retry_at,
            latency_ms=round(latency_ms, 2),
            check_type=check_type,
        )

    # ── Batch check ──────────────────────────────────────────────────────

    async def check_all(
        self,
        workspace_id: str,
        connector_names: list[str] | None = None,
    ) -> HealthReport:
        """Run health checks on all (or specified) connectors for a workspace.

        Args:
            workspace_id: Workspace to check connectors for.
            connector_names: Optional list of specific connectors to check.
                If None, checks all known connectors.

        Returns:
            Full health report with per-connector status and summary counts.
        """
        if connector_names is None:
            connector_names = list(get_connector.__module__ and self._discover_connectors())
            # Fallback: use the REGISTRY from __init__.py
            from . import REGISTRY
            connector_names = list(REGISTRY.keys())

        summaries: list[ConnectorHealthSummary] = []

        for name in connector_names:
            try:
                summary = await self.check_connector(
                    connector_name=name,
                    workspace_id=workspace_id,
                )
                summaries.append(summary)
            except Exception as exc:
                logger.error("Health check failed for %s: %s", name, exc)
                summaries.append(ConnectorHealthSummary(
                    connector_name=name,
                    status=HealthStatus.CRITICAL,
                    status_icon="🔴",
                    error_message=str(exc)[:200],
                ))

        return self._build_report(summaries)

    # ── Get stored health status ─────────────────────────────────────────

    async def get_health_status(
        self,
        workspace_id: str,
    ) -> HealthReport:
        """Retrieve the latest health status for all connectors from the database.

        Does NOT run new checks — reads the most recent events stored by
        previous ``check_connector`` / ``check_all`` calls.

        Args:
            workspace_id: Workspace to read status for.

        Returns:
            Health report built from stored events.
        """
        try:
            # Fetch the most recent event per connector for this workspace
            result = self._supabase.table("connector_health_events") \
                .select("connector_name, status, error_message, retry_count, "
                        "next_retry_at, checked_at, latency_ms, check_type") \
                .eq("workspace_id", workspace_id) \
                .order("checked_at", desc=True) \
                .limit(500) \
                .execute()

            if not result.data:
                return HealthReport(connectors=[])

            # Deduplicate: keep only the most recent event per connector
            seen: dict[str, dict[str, Any]] = {}
            for row in result.data:
                name = row["connector_name"]
                if name not in seen:
                    seen[name] = row

            summaries = []
            for name, row in seen.items():
                status = HealthStatus(row["status"])
                summaries.append(ConnectorHealthSummary(
                    connector_name=name,
                    status=status,
                    status_icon="🟢" if status == HealthStatus.HEALTHY
                        else "🟡" if status == HealthStatus.WARNING
                        else "🔴",
                    last_checked_at=datetime.fromisoformat(row["checked_at"])
                        if row.get("checked_at") else None,
                    error_message=row.get("error_message"),
                    retry_count=row.get("retry_count", 0),
                    next_retry_at=datetime.fromisoformat(row["next_retry_at"])
                        if row.get("next_retry_at") else None,
                    latency_ms=row.get("latency_ms"),
                    check_type=CheckType(row["check_type"]),
                ))

            return self._build_report(summaries)

        except Exception as exc:
            logger.error("Failed to read health status: %s", exc)
            return HealthReport(connectors=[])

    # ── Retry scheduling ─────────────────────────────────────────────────

    async def get_pending_retries(
        self,
        workspace_id: str,
    ) -> list[ConnectorHealthSummary]:
        """Get connectors that have a pending retry scheduled.

        Args:
            workspace_id: Workspace to check for pending retries.

        Returns:
            List of connectors with pending retries (next_retry_at in the future).
        """
        now = datetime.now(timezone.utc).isoformat()
        try:
            result = self._supabase.table("connector_health_events") \
                .select("connector_name, status, error_message, retry_count, "
                        "next_retry_at, checked_at, latency_ms, check_type") \
                .eq("workspace_id", workspace_id) \
                .not_.is_("next_retry_at", "null") \
                .gte("next_retry_at", now) \
                .order("next_retry_at", ascending=True) \
                .limit(50) \
                .execute()

            if not result.data:
                return []

            # Deduplicate: keep only the most recent event per connector
            seen: dict[str, dict[str, Any]] = {}
            for row in result.data:
                name = row["connector_name"]
                if name not in seen:
                    seen[name] = row

            return [
                ConnectorHealthSummary(
                    connector_name=name,
                    status=HealthStatus(row["status"]),
                    status_icon="🟡",
                    last_checked_at=datetime.fromisoformat(row["checked_at"])
                        if row.get("checked_at") else None,
                    error_message=row.get("error_message"),
                    retry_count=row.get("retry_count", 0),
                    next_retry_at=datetime.fromisoformat(row["next_retry_at"])
                        if row.get("next_retry_at") else None,
                    latency_ms=row.get("latency_ms"),
                    check_type=CheckType(row["check_type"]),
                )
                for name, row in seen.items()
            ]

        except Exception as exc:
            logger.error("Failed to read pending retries: %s", exc)
            return []

    # ── Private helpers ──────────────────────────────────────────────────

    async def _run_check(
        self,
        connector: IConnector,
        access_token: str,
        check_type: CheckType,
    ) -> HealthCheckResult:
        """Execute the appropriate health check based on check_type."""
        if check_type == CheckType.CONNECTION_TEST:
            # Use the connector's built-in health_check if available (BaseConnector)
            if isinstance(connector, BaseConnector):
                return await connector.health_check(access_token)
            # Fallback: basic connectivity check
            return await self._basic_connectivity_check(connector)

        elif check_type == CheckType.AUTH_VALIDITY:
            return await self._auth_validity_check(connector, access_token)

        elif check_type == CheckType.RATE_LIMIT_STATUS:
            return await self._rate_limit_check(connector, access_token)

        # Default to connection test
        if isinstance(connector, BaseConnector):
            return await connector.health_check(access_token)
        return await self._basic_connectivity_check(connector)

    async def _basic_connectivity_check(
        self,
        connector: IConnector,
    ) -> HealthCheckResult:
        """Basic HTTP connectivity check to the connector's base URL."""
        base_url = getattr(connector, "base_url", "")
        if not base_url:
            return HealthCheckResult(
                healthy=True,
                provider=connector.provider,
                message="No base URL configured; skipping connectivity check",
            )

        start = time.monotonic()
        try:
            response = await self._http_client.get(base_url)
            latency = (time.monotonic() - start) * 1000
            return HealthCheckResult(
                healthy=response.status_code < 500,
                provider=connector.provider,
                message=f"HTTP {response.status_code}",
                latency_ms=latency,
            )
        except Exception as exc:
            latency = (time.monotonic() - start) * 1000
            return HealthCheckResult(
                healthy=False,
                provider=connector.provider,
                message=str(exc)[:200],
                latency_ms=latency,
            )

    async def _auth_validity_check(
        self,
        connector: IConnector,
        access_token: str,
    ) -> HealthCheckResult:
        """Check if the provided access token is still valid."""
        if not access_token:
            return HealthCheckResult(
                healthy=False,
                provider=connector.provider,
                message="No access token provided for auth validity check",
            )

        base_url = getattr(connector, "base_url", "")
        if not base_url:
            return HealthCheckResult(
                healthy=True,
                provider=connector.provider,
                message="No base URL; cannot validate auth",
            )

        start = time.monotonic()
        try:
            response = await self._http_client.get(
                base_url,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            latency = (time.monotonic() - start) * 1000

            if response.status_code == 401:
                return HealthCheckResult(
                    healthy=False,
                    provider=connector.provider,
                    message="Access token is invalid or expired",
                    latency_ms=latency,
                )
            if response.status_code == 403:
                return HealthCheckResult(
                    healthy=False,
                    provider=connector.provider,
                    message="Access token lacks required permissions",
                    latency_ms=latency,
                )

            return HealthCheckResult(
                healthy=response.status_code < 400,
                provider=connector.provider,
                message=f"Auth check: HTTP {response.status_code}",
                latency_ms=latency,
            )
        except Exception as exc:
            latency = (time.monotonic() - start) * 1000
            return HealthCheckResult(
                healthy=False,
                provider=connector.provider,
                message=f"Auth check failed: {str(exc)[:150]}",
                latency_ms=latency,
            )

    async def _rate_limit_check(
        self,
        connector: IConnector,
        access_token: str,
    ) -> HealthCheckResult:
        """Check rate limit status by examining response headers."""
        base_url = getattr(connector, "base_url", "")
        if not base_url:
            return HealthCheckResult(
                healthy=True,
                provider=connector.provider,
                message="No base URL; cannot check rate limits",
            )

        start = time.monotonic()
        try:
            response = await self._http_client.get(
                base_url,
                headers={"Authorization": f"Bearer {access_token}"} if access_token else {},
            )
            latency = (time.monotonic() - start) * 1000

            # Check common rate-limit headers
            remaining = response.headers.get("x-ratelimit-remaining")
            limit = response.headers.get("x-ratelimit-limit")
            reset = response.headers.get("x-ratelimit-reset")

            details: dict[str, Any] = {}
            if remaining is not None:
                details["remaining"] = remaining
            if limit is not None:
                details["limit"] = limit
            if reset is not None:
                details["reset"] = reset

            # If rate limited (429), it's critical
            if response.status_code == 429:
                return HealthCheckResult(
                    healthy=False,
                    provider=connector.provider,
                    message="Rate limit exceeded (HTTP 429)",
                    latency_ms=latency,
                    details=details,
                )

            # If remaining is low, flag as warning
            if remaining is not None:
                try:
                    remaining_int = int(remaining)
                    if remaining_int == 0:
                        return HealthCheckResult(
                            healthy=False,
                            provider=connector.provider,
                            message="Rate limit exhausted (0 remaining)",
                            latency_ms=latency,
                            details=details,
                        )
                    if limit is not None:
                        limit_int = int(limit)
                        if limit_int > 0 and remaining_int / limit_int < 0.1:
                            return HealthCheckResult(
                                healthy=True,
                                provider=connector.provider,
                                message=f"Rate limit low: {remaining}/{limit} remaining",
                                latency_ms=latency,
                                details=details,
                            )
                except (ValueError, TypeError):
                    pass

            return HealthCheckResult(
                healthy=response.status_code < 500,
                provider=connector.provider,
                message=f"Rate limit check: HTTP {response.status_code}",
                latency_ms=latency,
                details=details,
            )
        except Exception as exc:
            latency = (time.monotonic() - start) * 1000
            return HealthCheckResult(
                healthy=False,
                provider=connector.provider,
                message=f"Rate limit check failed: {str(exc)[:150]}",
                latency_ms=latency,
            )

    async def _store_event(self, event: HealthCheckEvent) -> None:
        """Store a health check event in the database."""
        try:
            row = {
                "connector_name": event.connector_name,
                "workspace_id": event.workspace_id,
                "check_type": event.check_type.value,
                "status": event.status.value,
                "error_message": event.error_message,
                "latency_ms": event.latency_ms,
                "retry_count": event.retry_count,
                "next_retry_at": event.next_retry_at.isoformat() if event.next_retry_at else None,
                "checked_at": event.checked_at.isoformat(),
            }
            self._supabase.table("connector_health_events").insert(row).execute()
        except Exception as exc:
            logger.error(
                "Failed to store health event for %s: %s",
                event.connector_name,
                exc,
            )

    async def _get_latest_retry_count(
        self,
        connector_name: str,
        workspace_id: str | None,
    ) -> int:
        """Get the retry count from the most recent event for a connector."""
        try:
            query = self._supabase.table("connector_health_events") \
                .select("retry_count") \
                .eq("connector_name", connector_name) \
                .order("checked_at", desc=True) \
                .limit(1)

            if workspace_id:
                query = query.eq("workspace_id", workspace_id)

            result = query.execute()
            if result.data:
                return result.data[0].get("retry_count", 0)
        except Exception:
            pass
        return 0

    @staticmethod
    def _build_report(summaries: list[ConnectorHealthSummary]) -> HealthReport:
        """Build a HealthReport from a list of summaries."""
        healthy = sum(1 for s in summaries if s.status == HealthStatus.HEALTHY)
        warning = sum(1 for s in summaries if s.status == HealthStatus.WARNING)
        critical = sum(1 for s in summaries if s.status == HealthStatus.CRITICAL)
        needs_attention = [
            s.connector_name for s in summaries
            if s.status in (HealthStatus.WARNING, HealthStatus.CRITICAL)
        ]

        return HealthReport(
            connectors=summaries,
            total=len(summaries),
            healthy=healthy,
            warning=warning,
            critical=critical,
            needs_attention=needs_attention,
        )

    @staticmethod
    def _discover_connectors() -> list[str]:
        """Discover available connector names from the registry."""
        from . import REGISTRY
        return list(REGISTRY.keys())
