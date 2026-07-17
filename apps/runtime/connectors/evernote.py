"""Evernote connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.evernote.com/v1"


class EvernoteConnector(IConnector):
    """
    Evernote connector for: list_notebooks, create_note.

    API Base: evernote
    """

    provider = "evernote"
    supported_operations = ["list_notebooks", "create_note"]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Evernote operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_notebooks":
                    return await self._list_notebooks(client, headers, params)
                case "create_note":
                    return await self._create_note(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Evernote does not support '{operation}'",
                    )

    async def _list_notebooks(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute list_notebooks operation."""
        limit = int(params.get("limit", 50))
        offset = int(params.get("offset", 0))
        query_params = {"limit": limit, "offset": offset}
        for key in ["filter", "sort", "search"]:
            if key in params:
                query_params[key] = params[key]

        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/notebooks",
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

    async def _create_note(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute create_note operation."""
        if not params:
            raise ConnectorError("MISSING_PARAM", "request body required")

        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/note",
            headers=headers,
            json=params,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()
