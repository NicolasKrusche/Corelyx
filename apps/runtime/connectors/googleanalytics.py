"""Google Analytics connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.googleanalytics.com/v1"


class GoogleanalyticsConnector(IConnector):
    """
    Google Analytics connector for: query_report, get_metrics.

    API Base: googleanalytics
    """

    provider = "googleanalytics"
    supported_operations = ["query_report", "get_metrics"]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Google Analytics operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "query_report":
                    return await self._query_report(client, headers, params)
                case "get_metrics":
                    return await self._get_metrics(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Google Analytics does not support '{operation}'",
                    )

    async def _query_report(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute query_report operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/query_report",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()

    async def _get_metrics(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute get_metrics operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/get_metrics",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()
