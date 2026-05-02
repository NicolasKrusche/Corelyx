"""Deel connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.deel.com/v1"


class DeelConnector(IConnector):
    """
    Deel connector for: list_contractors, get_contractor.
    
    API Base: deel
    """
    
    provider = "deel"
    supported_operations = [
        "list_contractors",
        "get_contractor"
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Deel operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_contractors":
                    return await self._list_contractors(client, headers, params)
                case "get_contractor":
                    return await self._get_contractor(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Deel does not support '{operation}'",
                    )


    async def _list_contractors(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute list_contractors operation."""
        limit = int(params.get("limit", 50))
        offset = int(params.get("offset", 0))
        query_params = {"limit": limit, "offset": offset}
        for key in ["filter", "sort", "search"]:
            if key in params:
                query_params[key] = params[key]
        
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/contractors", 
            headers=headers, params=query_params,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        data = r.json()
        return {
            "items": data.get("data", []) or data.get("items", []),
            "total": data.get("total", 0),
        }

    async def _get_contractor(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute get_contractor operation."""
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/get_contractor",
            headers=headers, json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()
