"""Webflow connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.webflow.com/v1"


class WebflowConnector(IConnector):
    """
    Webflow connector for: list_sites, query_cms.

    API Base: webflow
    """

    provider = "webflow"
    supported_operations = ["list_sites", "query_cms"]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Webflow operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_sites":
                    return await self._list_sites(client, headers, params)
                case "query_cms":
                    return await self._query_cms(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Webflow does not support '{operation}'",
                    )

    async def _list_sites(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute list_sites operation."""
        limit = int(params.get("limit", 50))
        offset = int(params.get("offset", 0))
        query_params = {"limit": limit, "offset": offset}
        for key in ["filter", "sort", "search"]:
            if key in params:
                query_params[key] = params[key]

        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/sites",
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

    async def _query_cms(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute query_cms operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/query_cms",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()
