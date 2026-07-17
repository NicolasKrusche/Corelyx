"""PagerDuty connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.pagerduty.com/v1"


class PagerdutyConnector(IConnector):
    """
    PagerDuty connector for: list_incidents, create_incident.

    API Base: pagerduty
    """

    provider = "pagerduty"
    supported_operations = ["list_incidents", "create_incident"]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a PagerDuty operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_incidents":
                    return await self._list_incidents(client, headers, params)
                case "create_incident":
                    return await self._create_incident(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"PagerDuty does not support '{operation}'",
                    )

    async def _list_incidents(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute list_incidents operation."""
        limit = int(params.get("limit", 50))
        offset = int(params.get("offset", 0))
        query_params = {"limit": limit, "offset": offset}
        for key in ["filter", "sort", "search"]:
            if key in params:
                query_params[key] = params[key]

        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/incidents",
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

    async def _create_incident(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute create_incident operation."""
        if not params:
            raise ConnectorError("MISSING_PARAM", "request body required")

        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/incident",
            headers=headers,
            json=params,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()
