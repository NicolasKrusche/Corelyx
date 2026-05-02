"""Telnyx connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.telnyx.com/v1"


class TelnyxConnector(IConnector):
    """
    Telnyx connector for: send_sms, list_messages.
    
    API Base: telnyx
    """
    
    provider = "telnyx"
    supported_operations = [
        "send_sms",
        "list_messages"
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Telnyx operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "send_sms":
                    return await self._send_sms(client, headers, params)
                case "list_messages":
                    return await self._list_messages(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Telnyx does not support '{operation}'",
                    )


    async def _send_sms(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute send_sms operation."""
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/send_sms",
            headers=headers, json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()

    async def _list_messages(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute list_messages operation."""
        limit = int(params.get("limit", 50))
        offset = int(params.get("offset", 0))
        query_params = {"limit": limit, "offset": offset}
        for key in ["filter", "sort", "search"]:
            if key in params:
                query_params[key] = params[key]
        
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/messages", 
            headers=headers, params=query_params,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        data = r.json()
        return {
            "items": data.get("data", []) or data.get("items", []),
            "total": data.get("total", 0),
        }
