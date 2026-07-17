"""Hunter.io connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.hunter.com/v1"


class HunterConnector(IConnector):
    """
    Hunter.io connector for: find_email, verify_email.

    API Base: hunter
    """

    provider = "hunter"
    supported_operations = ["find_email", "verify_email"]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Hunter.io operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "find_email":
                    return await self._find_email(client, headers, params)
                case "verify_email":
                    return await self._verify_email(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Hunter.io does not support '{operation}'",
                    )

    async def _find_email(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute find_email operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/find_email",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()

    async def _verify_email(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute verify_email operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/verify_email",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()
