"""FullStory connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.fullstory.com/v1"


class FullstoryConnector(IConnector):
    """
    FullStory connector for: list_sessions, get_session.

    API Base: fullstory
    """

    provider = "fullstory"
    supported_operations = ["list_sessions", "get_session"]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a FullStory operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_sessions":
                    return await self._list_sessions(client, headers, params)
                case "get_session":
                    return await self._get_session(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"FullStory does not support '{operation}'",
                    )

    async def _list_sessions(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute list_sessions operation."""
        limit = int(params.get("limit", 50))
        offset = int(params.get("offset", 0))
        query_params = {"limit": limit, "offset": offset}
        for key in ["filter", "sort", "search"]:
            if key in params:
                query_params[key] = params[key]

        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/sessions",
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

    async def _get_session(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute get_session operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/get_session",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()
