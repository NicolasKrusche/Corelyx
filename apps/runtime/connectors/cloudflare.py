"""Cloudflare connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.cloudflare.com/v1"


class CloudflareConnector(IConnector):
    """
    Cloudflare connector for: list_zones, get_zone.

    API Base: cloudflare
    """

    provider = "cloudflare"
    supported_operations = ["list_zones", "get_zone"]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Cloudflare operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_zones":
                    return await self._list_zones(client, headers, params)
                case "get_zone":
                    return await self._get_zone(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Cloudflare does not support '{operation}'",
                    )

    async def _list_zones(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute list_zones operation."""
        limit = int(params.get("limit", 50))
        offset = int(params.get("offset", 0))
        query_params = {"limit": limit, "offset": offset}
        for key in ["filter", "sort", "search"]:
            if key in params:
                query_params[key] = params[key]

        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/zones",
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

    async def _get_zone(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute get_zone operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/get_zone",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()
