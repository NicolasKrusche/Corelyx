"""Plausible connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.plausible.com/v1"


class PlausibleConnector(IConnector):
    """
    Plausible connector for: get_stats, query_breakdown.

    API Base: plausible
    """

    provider = "plausible"
    supported_operations = ["get_stats", "query_breakdown"]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Plausible operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "get_stats":
                    return await self._get_stats(client, headers, params)
                case "query_breakdown":
                    return await self._query_breakdown(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Plausible does not support '{operation}'",
                    )

    async def _get_stats(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute get_stats operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/get_stats",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()

    async def _query_breakdown(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute query_breakdown operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/query_breakdown",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()
