"""CircleCI connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.circleci.com/v1"


class CircleciConnector(IConnector):
    """
    CircleCI connector for: list_workflows, get_workflow.

    API Base: circleci
    """

    provider = "circleci"
    supported_operations = ["list_workflows", "get_workflow"]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a CircleCI operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_workflows":
                    return await self._list_workflows(client, headers, params)
                case "get_workflow":
                    return await self._get_workflow(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"CircleCI does not support '{operation}'",
                    )

    async def _list_workflows(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute list_workflows operation."""
        limit = int(params.get("limit", 50))
        offset = int(params.get("offset", 0))
        query_params = {"limit": limit, "offset": offset}
        for key in ["filter", "sort", "search"]:
            if key in params:
                query_params[key] = params[key]

        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/workflows",
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

    async def _get_workflow(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute get_workflow operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/get_workflow",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()
