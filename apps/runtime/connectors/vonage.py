"""Vonage connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.vonage.com/v1"


class VonageConnector(IConnector):
    """
    Vonage connector for: send_sms, send_message.
    
    API Base: vonage
    """
    
    provider = "vonage"
    supported_operations = [
        "send_sms",
        "send_message"
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Vonage operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "send_sms":
                    return await self._send_sms(client, headers, params)
                case "send_message":
                    return await self._send_message(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Vonage does not support '{operation}'",
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

    async def _send_message(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute send_message operation."""
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/send_message",
            headers=headers, json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        
        return r.json()
