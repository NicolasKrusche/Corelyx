"""BaseConnector — enhanced base class for native connectors.

Extends the existing ``IConnector`` ABC with practical helpers that
most connectors need:

- Auth provider composition (OAuth, API key, bearer)
- Operation schema definitions
- HTTP client with retry and auth injection
- Default status-code error handling
- Optional health checks

This class is **opt-in**: existing connectors that only inherit from
``IConnector`` continue to work without changes. Migrating to
``BaseConnector`` is recommended for new connectors and can be done
incrementally.

Usage::

    from connectors.sdk.base import BaseConnector
    from connectors.sdk.auth import BearerAuthProvider
    from connectors.sdk.types import OperationSchema, FieldSchema, FieldKind

    class MyConnector(BaseConnector):
        provider = "myservice"
        base_url = "https://api.myservice.com/v1"
        default_headers = {"Accept": "application/json"}

        _operation_schemas = [
            OperationSchema(
                name="list_items",
                description="List all items",
                input_fields=[
                    FieldSchema(name="limit", kind=FieldKind.INTEGER, default=10),
                ],
                output_fields=[
                    FieldSchema(name="items", kind=FieldKind.ARRAY),
                ],
            ),
        ]

        async def execute(self, operation, params, access_token):
            # Use self._http_client(access_token) for auto-auth + retry
            async with self._http_client(access_token) as http:
                response = await http.get("/items", params={"limit": params.get("limit", 10)})
                self._raise_for_status(response, operation)
                return {"items": response.json().get("items", [])}
"""

from __future__ import annotations

import time
from typing import Any

import structlog
import httpx

from ..base import ConnectorError, IConnector
from .auth import AuthProvider, BearerAuthProvider
from .http import HttpClient
from .types import HealthCheckResult, OperationSchema

log = structlog.get_logger("connectors.sdk")


class BaseConnector(IConnector):
    """Enhanced base class for connectors.

    Subclasses should set ``provider``, ``supported_operations``, and
    optionally ``base_url`` and ``default_headers``.

    The ``execute()`` method must still be overridden — BaseConnector does
    not change the calling convention. It simply provides helpers that
    reduce boilerplate.
    """

    # Subclasses override these ──────────────────────────────────────────
    base_url: str = ""
    default_headers: dict[str, str] = {}

    # Optional: rich operation schemas for introspection / SDK tooling
    _operation_schemas: list[OperationSchema] = []

    # ── Schema helpers ─────────────────────────────────────────────────
    @property
    def operation_schemas(self) -> list[OperationSchema]:
        """Return operation schemas for this connector.

        Subclasses can either set ``_operation_schemas`` directly or
        override this property for dynamic schemas.
        """
        return list(self._operation_schemas)

    def get_operation_schema(self, name: str) -> OperationSchema | None:
        """Look up a single operation schema by name."""
        for schema in self._operation_schemas:
            if schema.name == name:
                return schema
        return None

    def schema_to_dict(self) -> dict[str, Any]:
        """Return full schema info as a JSON-serializable dict."""
        return {
            "provider": self.provider,
            "operations": [s.to_dict() for s in self._operation_schemas],
        }

    # ── HTTP helpers ───────────────────────────────────────────────────
    def _http_client(
        self,
        access_token: str,
        *,
        auth: AuthProvider | None = None,
        base_url: str | None = None,
        default_headers: dict[str, str] | None = None,
        timeout: float = 30.0,
        max_attempts: int = 5,
    ) -> HttpClient:
        """Create an ``HttpClient`` pre-configured for this connector.

        The caller should use it as an async context manager::

            async with self._http_client(access_token) as http:
                r = await http.get("/endpoint")
        """
        return HttpClient(
            base_url=base_url or self.base_url,
            auth=auth or BearerAuthProvider(access_token),
            default_headers=default_headers if default_headers is not None else self.default_headers,
            timeout=timeout,
            max_attempts=max_attempts,
        )

    # ── Error helpers ──────────────────────────────────────────────────

    def _raise_for_status(
        self,
        response: httpx.Response,
        operation: str,
        *,
        error_prefix: str | None = None,
    ) -> None:
        """Raise ``ConnectorError`` for HTTP error responses.

        Subclasses can override for provider-specific error formatting.

        Args:
            response: The httpx response to check.
            operation: The operation name (for error messages).
            error_prefix: Optional prefix for error code (e.g. "GMAIL").
                Defaults to ``self.provider.upper()``.
        """
        prefix = (error_prefix or self.provider.upper()).upper()

        if response.status_code == 401:
            raise ConnectorError(
                "TOKEN_EXPIRED",
                f"{self.provider.title()} {operation} failed: "
                "OAuth access token is invalid or expired",
            )
        if response.status_code == 403:
            raise ConnectorError(
                "FORBIDDEN",
                f"{self.provider.title()} {operation} failed "
                f"({response.status_code}): {response.text[:300]}",
            )
        if response.status_code == 404:
            raise ConnectorError(
                "NOT_FOUND",
                f"{self.provider.title()} {operation} failed: resource not found",
            )
        if response.status_code == 429:
            raise ConnectorError(
                "RATE_LIMITED",
                f"{self.provider.title()} {operation} failed: rate limit exceeded",
            )
        if response.status_code >= 400:
            raise ConnectorError(
                f"{prefix}_API_ERROR",
                f"{self.provider.title()} {operation} failed "
                f"({response.status_code}): {response.text[:300]}",
            )

    def _raise_for_json_status(
        self,
        response: httpx.Response,
        operation: str,
        *,
        ok_field: str = "ok",
        error_field: str = "error",
    ) -> dict[str, Any]:
        """Check HTTP status AND a JSON ``ok`` field (Slack-style APIs).

        Raises ``ConnectorError`` on HTTP errors or when the JSON body
        indicates failure.

        Returns:
            The parsed JSON body on success.
        """
        self._raise_for_status(response, operation)
        data = response.json()
        if not data.get(ok_field):
            raise ConnectorError(
                f"{self.provider.upper()}_API_ERROR",
                f"{self.provider.title()} {operation} error: "
                f"{data.get(error_field, 'unknown')}",
            )
        return data

    # ── Health check ───────────────────────────────────────────────────

    async def health_check(self, access_token: str = "") -> HealthCheckResult:
        """Check if the connector's upstream API is reachable.

        The default implementation does a lightweight GET to the base URL
        (or ``/health`` if ``base_url`` is set). Subclasses should override
        for provider-specific health checks.
        """
        if not self.base_url:
            return HealthCheckResult(
                healthy=True,
                provider=self.provider,
                message="No base URL configured; skipping connectivity check",
            )

        start = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                auth_header = {}
                if access_token:
                    auth_header["Authorization"] = f"Bearer {access_token}"
                r = await client.get(
                    self.base_url,
                    headers={**self.default_headers, **auth_header},
                )
                latency = (time.monotonic() - start) * 1000
                log.info(
                    "connector.health_check",
                    provider=self.provider,
                    status_code=r.status_code,
                    latency_ms=round(latency, 1),
                )
                return HealthCheckResult(
                    healthy=r.status_code < 500,
                    provider=self.provider,
                    message=f"HTTP {r.status_code}",
                    latency_ms=latency,
                )
        except Exception as exc:
            latency = (time.monotonic() - start) * 1000
            log.warning(
                "connector.health_check.failed",
                provider=self.provider,
                error=str(exc)[:200],
                latency_ms=round(latency, 1),
            )
            return HealthCheckResult(
                healthy=False,
                provider=self.provider,
                message=str(exc)[:200],
                latency_ms=latency,
            )

    # ── Connector info ─────────────────────────────────────────────────

    def info(self) -> dict[str, Any]:
        """Return a summary dict useful for logging, debugging, or API responses."""
        return {
            "provider": self.provider,
            "class_name": type(self).__name__,
            "operations": list(self.supported_operations),
            "base_url": self.base_url,
            "schema_operations": len(self._operation_schemas),
        }
