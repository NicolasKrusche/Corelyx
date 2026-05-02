"""Netlify connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.netlify.com/v1"


class NetlifyConnector(IConnector):
    """
    Netlify connector for: list_sites, trigger_build.
    
    API Base: netlify
    """
    
    provider = "netlify"
    supported_operations = [
        "list_sites",
        "trigger_build"
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Netlify operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_sites":
                    return await self._list_sites(client, headers, params)
                case "trigger_build":
                    return await self._trigger_build(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Netlify does not support '{operation}'",
                    )


    async def _list_sites(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute list_sites operation."""
        limit = int(params.get("limit", 50))
        offset = int(params.get("offset", 0))
        query_params = {"limit": limit, "offset": offset}
        for key in ["filter", "sort", "search"]:
            if key in params:
                query_params[key] = params[key]
        
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/sites", 
            headers=headers, params=query_params,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        data = r.json()
        return {
            "items": data.get("data", []) or data.get("items", []),
            "total": data.get("total", 0),
        }

    async def _trigger_build(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute trigger_build operation."""
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/trigger_build",
            headers=headers, json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()
