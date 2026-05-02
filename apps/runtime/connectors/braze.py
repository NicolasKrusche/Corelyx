"""Braze connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.braze.com/v1"


class BrazeConnector(IConnector):
    """
    Braze connector for: trigger_campaign, get_user.
    
    API Base: braze
    """
    
    provider = "braze"
    supported_operations = [
        "trigger_campaign",
        "get_user"
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Braze operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "trigger_campaign":
                    return await self._trigger_campaign(client, headers, params)
                case "get_user":
                    return await self._get_user(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Braze does not support '{operation}'",
                    )


    async def _trigger_campaign(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute trigger_campaign operation."""
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/trigger_campaign",
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
