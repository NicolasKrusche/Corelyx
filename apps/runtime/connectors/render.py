"""Render connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.render.com/v1"


class RenderConnector(IConnector):
    """
    Render connector for: list_services, trigger_deploy.

    API Base: render
    """

    provider = "render"
    supported_operations = ["list_services", "trigger_deploy"]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Render operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_services":
                    return await self._list_services(client, headers, params)
                case "trigger_deploy":
                    return await self._trigger_deploy(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Render does not support '{operation}'",
                    )

    async def _list_services(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute list_services operation."""
        limit = int(params.get("limit", 50))
        offset = int(params.get("offset", 0))
        query_params = {"limit": limit, "offset": offset}
        for key in ["filter", "sort", "search"]:
            if key in params:
                query_params[key] = params[key]

        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/services",
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

    async def _trigger_deploy(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute trigger_deploy operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/trigger_deploy",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()
