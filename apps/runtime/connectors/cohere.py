"""Cohere connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.cohere.com/v1"


class CohereConnector(IConnector):
    """
    Cohere connector for: generate_text, embed_text.

    API Base: cohere
    """

    provider = "cohere"
    supported_operations = ["generate_text", "embed_text"]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Cohere operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "generate_text":
                    return await self._generate_text(client, headers, params)
                case "embed_text":
                    return await self._embed_text(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Cohere does not support '{operation}'",
                    )

    async def _generate_text(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute generate_text operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/generate_text",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()

    async def _embed_text(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute embed_text operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/embed_text",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()
