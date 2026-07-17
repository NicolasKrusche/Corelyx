"""Mixpanel connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.mixpanel.com/v1"


class MixpanelConnector(IConnector):
    """
    Mixpanel connector for: query_data, track_event.

    API Base: mixpanel
    """

    provider = "mixpanel"
    supported_operations = ["query_data", "track_event"]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Mixpanel operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "query_data":
                    return await self._query_data(client, headers, params)
                case "track_event":
                    return await self._track_event(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Mixpanel does not support '{operation}'",
                    )

    async def _query_data(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute query_data operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/query_data",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()

    async def _track_event(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute track_event operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/track_event",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()
