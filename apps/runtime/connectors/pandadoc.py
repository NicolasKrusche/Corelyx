"""PandaDoc connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.pandadoc.com/v1"


class PandadocConnector(IConnector):
    """
    PandaDoc connector for: list_documents, send_document.

    API Base: pandadoc
    """

    provider = "pandadoc"
    supported_operations = ["list_documents", "send_document"]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a PandaDoc operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_documents":
                    return await self._list_documents(client, headers, params)
                case "send_document":
                    return await self._send_document(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"PandaDoc does not support '{operation}'",
                    )

    async def _list_documents(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute list_documents operation."""
        limit = int(params.get("limit", 50))
        offset = int(params.get("offset", 0))
        query_params = {"limit": limit, "offset": offset}
        for key in ["filter", "sort", "search"]:
            if key in params:
                query_params[key] = params[key]

        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/documents",
            headers=headers,
            params=query_params,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        data = r.json()
        return {
            "items": data.get("data", []) or data.get("items", []),
            "total": data.get("total", 0),
        }

    async def _send_document(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute send_document operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/send_document",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()
