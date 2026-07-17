"""Auth0 connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.auth0.com/v1"


class Auth0Connector(IConnector):
    """
    Auth0 connector for: list_users, get_user.

    API Base: auth0
    """

    provider = "auth0"
    supported_operations = ["list_users", "get_user"]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Auth0 operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_users":
                    return await self._list_users(client, headers, params)
                case "get_user":
                    return await self._get_user(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Auth0 does not support '{operation}'",
                    )

    async def _list_users(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute list_users operation."""
        limit = int(params.get("limit", 50))
        offset = int(params.get("offset", 0))
        query_params = {"limit": limit, "offset": offset}
        for key in ["filter", "sort", "search"]:
            if key in params:
                query_params[key] = params[key]

        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/users",
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

    async def _get_user(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute get_user operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/get_user",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()
