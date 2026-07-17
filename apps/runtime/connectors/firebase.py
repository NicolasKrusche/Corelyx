"""Firebase connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.firebase.com/v1"


class FirebaseConnector(IConnector):
    """
    Firebase connector for: query_database, write_database.

    API Base: firebase
    """

    provider = "firebase"
    supported_operations = ["query_database", "write_database"]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Firebase operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "query_database":
                    return await self._query_database(client, headers, params)
                case "write_database":
                    return await self._write_database(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Firebase does not support '{operation}'",
                    )

    async def _query_database(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute query_database operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/query_database",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()

    async def _write_database(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute write_database operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/write_database",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()
