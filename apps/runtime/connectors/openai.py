"""OpenAI connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.openai.com/v1"


class OpenaiConnector(IConnector):
    """
    OpenAI connector for: create_completion, create_embedding.

    API Base: openai
    """

    provider = "openai"
    supported_operations = ["create_completion", "create_embedding"]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a OpenAI operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "create_completion":
                    return await self._create_completion(client, headers, params)
                case "create_embedding":
                    return await self._create_embedding(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"OpenAI does not support '{operation}'",
                    )

    async def _create_completion(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute create_completion operation."""
        if not params:
            raise ConnectorError("MISSING_PARAM", "request body required")

        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/completion",
            headers=headers,
            json=params,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()

    async def _create_embedding(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute create_embedding operation."""
        if not params:
            raise ConnectorError("MISSING_PARAM", "request body required")

        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/embedding",
            headers=headers,
            json=params,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()
