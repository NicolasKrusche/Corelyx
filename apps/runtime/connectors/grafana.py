"""Grafana connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.grafana.com/v1"


class GrafanaConnector(IConnector):
    """
    Grafana connector for: list_dashboards, query_metrics.
    
    API Base: grafana
    """
    
    provider = "grafana"
    supported_operations = [
        "list_dashboards",
        "query_metrics"
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Grafana operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_dashboards":
                    return await self._list_dashboards(client, headers, params)
                case "query_metrics":
                    return await self._query_metrics(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Grafana does not support '{operation}'",
                    )


    async def _list_dashboards(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute list_dashboards operation."""
        limit = int(params.get("limit", 50))
        offset = int(params.get("offset", 0))
        query_params = {"limit": limit, "offset": offset}
        for key in ["filter", "sort", "search"]:
            if key in params:
                query_params[key] = params[key]
        
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/dashboards", 
            headers=headers, params=query_params,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        data = r.json()
        return {
            "items": data.get("data", []) or data.get("items", []),
            "total": data.get("total", 0),
        }

    async def _query_metrics(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute query_metrics operation."""
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/query_metrics",
            headers=headers, json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()
