"""New Relic connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.newrelic.com/v1"


class NewrelicConnector(IConnector):
    """
    New Relic connector for: query_nrql, get_entity.
    
    API Base: newrelic
    """
    
    provider = "newrelic"
    supported_operations = [
        "query_nrql",
        "get_entity"
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a New Relic operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "query_nrql":
                    return await self._query_nrql(client, headers, params)
                case "get_entity":
                    return await self._get_entity(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"New Relic does not support '{operation}'",
                    )


    async def _query_nrql(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute query_nrql operation."""
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/query_nrql",
            headers=headers, json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()

    async def _get_entity(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute get_entity operation."""
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/get_entity",
            headers=headers, json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()
