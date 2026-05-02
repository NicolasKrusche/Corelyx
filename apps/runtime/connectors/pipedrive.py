"""Pipedrive connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.pipedrive.com/v1"


class PipedriveConnector(IConnector):
    """
    Pipedrive connector for: list_deals, create_deal.
    
    API Base: pipedrive
    """
    
    provider = "pipedrive"
    supported_operations = [
        "list_deals",
        "create_deal"
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Pipedrive operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_deals":
                    return await self._list_deals(client, headers, params)
                case "create_deal":
                    return await self._create_deal(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Pipedrive does not support '{operation}'",
                    )


    async def _list_deals(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute list_deals operation."""
        limit = int(params.get("limit", 50))
        offset = int(params.get("offset", 0))
        query_params = {"limit": limit, "offset": offset}
        for key in ["filter", "sort", "search"]:
            if key in params:
                query_params[key] = params[key]
        
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/deals", 
            headers=headers, params=query_params,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        data = r.json()
        return {
            "items": data.get("data", []) or data.get("items", []),
            "total": data.get("total", 0),
        }

    async def _create_deal(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute create_deal operation."""
        if not params:
            raise ConnectorError("MISSING_PARAM", "request body required")
        
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/deal",
            headers=headers, json=params,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()
