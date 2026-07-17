"""Prismic connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.prismic.com/v1"


class PrismicConnector(IConnector):
    """
    Prismic connector for: query_documents, get_document.

    API Base: prismic
    """

    provider = "prismic"
    supported_operations = ["query_documents", "get_document"]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Prismic operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "query_documents":
                    return await self._query_documents(client, headers, params)
                case "get_document":
                    return await self._get_document(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Prismic does not support '{operation}'",
                    )

    async def _query_documents(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute query_documents operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/query_documents",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()

    async def _get_document(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute get_document operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/get_document",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()
