"""Iterable connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.iterable.com/v1"


class IterableConnector(IConnector):
    """
    Iterable connector for: track_event, get_user.
    
    API Base: iterable
    """
    
    provider = "iterable"
    supported_operations = [
        "track_event",
        "get_user"
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Iterable operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "track_event":
                    return await self._track_event(client, headers, params)
                case "get_user":
                    return await self._get_user(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Iterable does not support '{operation}'",
                    )


    async def _track_event(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute track_event operation."""
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/track_event",
            headers=headers, json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()

    async def _get_user(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute get_user operation."""
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/get_user",
            headers=headers, json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()
