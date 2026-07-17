"""PostHog connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.posthog.com/v1"


class PosthogConnector(IConnector):
    """
    PostHog connector for: get_feature_flags, query_events.

    API Base: posthog
    """

    provider = "posthog"
    supported_operations = ["get_feature_flags", "query_events"]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a PostHog operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "get_feature_flags":
                    return await self._get_feature_flags(client, headers, params)
                case "query_events":
                    return await self._query_events(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"PostHog does not support '{operation}'",
                    )

    async def _get_feature_flags(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute get_feature_flags operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/get_feature_flags",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()

    async def _query_events(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute query_events operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/query_events",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()
