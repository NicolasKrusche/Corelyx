"""Twilio connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.twilio.com/v1"


class TwilioConnector(IConnector):
    """
    Twilio connector for: send_sms, send_whatsapp.

    API Base: twilio
    """

    provider = "twilio"
    supported_operations = ["send_sms", "send_whatsapp"]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Twilio operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "send_sms":
                    return await self._send_sms(client, headers, params)
                case "send_whatsapp":
                    return await self._send_whatsapp(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Twilio does not support '{operation}'",
                    )

    async def _send_sms(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute send_sms operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/send_sms",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()

    async def _send_whatsapp(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute send_whatsapp operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/send_whatsapp",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()
