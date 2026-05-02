"""Ahrefs connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.ahrefs.com/v1"


class AhrefsConnector(IConnector):
    """
    Ahrefs connector for: get_site_overview, get_backlinks.
    
    API Base: ahrefs
    """
    
    provider = "ahrefs"
    supported_operations = [
        "get_site_overview",
        "get_backlinks"
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Ahrefs operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "get_site_overview":
                    return await self._get_site_overview(client, headers, params)
                case "get_backlinks":
                    return await self._get_backlinks(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Ahrefs does not support '{operation}'",
                    )


    async def _get_site_overview(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute get_site_overview operation."""
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/get_site_overview",
            headers=headers, json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()

    async def _get_backlinks(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute get_backlinks operation."""
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/get_backlinks",
            headers=headers, json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()
