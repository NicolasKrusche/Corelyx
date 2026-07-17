"""AWS S3 connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.awss3.com/v1"


class Awss3Connector(IConnector):
    """
    AWS S3 connector for: list_objects, upload_object.

    API Base: awss3
    """

    provider = "awss3"
    supported_operations = ["list_objects", "upload_object"]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a AWS S3 operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_objects":
                    return await self._list_objects(client, headers, params)
                case "upload_object":
                    return await self._upload_object(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"AWS S3 does not support '{operation}'",
                    )

    async def _list_objects(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute list_objects operation."""
        limit = int(params.get("limit", 50))
        offset = int(params.get("offset", 0))
        query_params = {"limit": limit, "offset": offset}
        for key in ["filter", "sort", "search"]:
            if key in params:
                query_params[key] = params[key]

        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/objects",
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

    async def _upload_object(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute upload_object operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/upload_object",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()
