"""Cloudinary connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.cloudinary.com/v1"


class CloudinaryConnector(IConnector):
    """
    Cloudinary connector for: list_resources, upload_resource.
    
    API Base: cloudinary
    """
    
    provider = "cloudinary"
    supported_operations = [
        "list_resources",
        "upload_resource"
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Cloudinary operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_resources":
                    return await self._list_resources(client, headers, params)
                case "upload_resource":
                    return await self._upload_resource(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Cloudinary does not support '{operation}'",
                    )


    async def _list_resources(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute list_resources operation."""
        limit = int(params.get("limit", 50))
        offset = int(params.get("offset", 0))
        query_params = {"limit": limit, "offset": offset}
        for key in ["filter", "sort", "search"]:
            if key in params:
                query_params[key] = params[key]
        
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/resources", 
            headers=headers, params=query_params,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        data = r.json()
        return {
            "items": data.get("data", []) or data.get("items", []),
            "total": data.get("total", 0),
        }

    async def _upload_resource(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute upload_resource operation."""
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/upload_resource",
            headers=headers, json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()
