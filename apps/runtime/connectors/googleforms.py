"""Google Forms connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.googleforms.com/v1"


class GoogleformsConnector(IConnector):
    """
    Google Forms connector for: list_forms, get_responses.

    API Base: googleforms
    """

    provider = "googleforms"
    supported_operations = ["list_forms", "get_responses"]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Google Forms operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_forms":
                    return await self._list_forms(client, headers, params)
                case "get_responses":
                    return await self._get_responses(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Google Forms does not support '{operation}'",
                    )

    async def _list_forms(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute list_forms operation."""
        limit = int(params.get("limit", 50))
        offset = int(params.get("offset", 0))
        query_params = {"limit": limit, "offset": offset}
        for key in ["filter", "sort", "search"]:
            if key in params:
                query_params[key] = params[key]

        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/forms",
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

    async def _get_responses(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute get_responses operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/get_responses",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()
