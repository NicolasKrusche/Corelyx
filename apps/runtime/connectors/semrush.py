"""Semrush connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.semrush.com/v1"


class SemrushConnector(IConnector):
    """
    Semrush connector for: get_domain_analytics, get_keywords.
    
    API Base: semrush
    """
    
    provider = "semrush"
    supported_operations = [
        "get_domain_analytics",
        "get_keywords"
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Semrush operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "get_domain_analytics":
                    return await self._get_domain_analytics(client, headers, params)
                case "get_keywords":
                    return await self._get_keywords(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Semrush does not support '{operation}'",
                    )


    async def _get_domain_analytics(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute get_domain_analytics operation."""
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/get_domain_analytics",
            headers=headers, json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()

    async def _get_keywords(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute get_keywords operation."""
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/get_keywords",
            headers=headers, json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()
