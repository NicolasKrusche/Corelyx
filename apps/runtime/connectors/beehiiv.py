"""Beehiiv connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.beehiiv.com/v1"


class BeehiivConnector(IConnector):
    """
    Beehiiv connector for: list_subscribers, get_subscriber.

    API Base: beehiiv
    """

    provider = "beehiiv"
    supported_operations = ["list_subscribers", "get_subscriber"]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Beehiiv operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_subscribers":
                    return await self._list_subscribers(client, headers, params)
                case "get_subscriber":
                    return await self._get_subscriber(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Beehiiv does not support '{operation}'",
                    )

    async def _list_subscribers(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute list_subscribers operation."""
        limit = int(params.get("limit", 50))
        offset = int(params.get("offset", 0))
        query_params = {"limit": limit, "offset": offset}
        for key in ["filter", "sort", "search"]:
            if key in params:
                query_params[key] = params[key]

        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/subscribers",
            headers=headers,
            params=query_params,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        data = r.json()
        return {
            "items": data.get("data", []) or data.get("items", []),
            "total": data.get("total", 0),
        }

    async def _get_subscriber(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute get_subscriber operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/get_subscriber",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()
