"""RudderStack connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.rudderstack.com/v1"


class RudderstackConnector(IConnector):
    """
    RudderStack connector for: track_event, identify_user.

    API Base: rudderstack
    """

    provider = "rudderstack"
    supported_operations = ["track_event", "identify_user"]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a RudderStack operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "track_event":
                    return await self._track_event(client, headers, params)
                case "identify_user":
                    return await self._identify_user(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"RudderStack does not support '{operation}'",
                    )

    async def _track_event(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute track_event operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/track_event",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()

    async def _identify_user(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute identify_user operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/identify_user",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()
