"""DocuSign connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.docusign.com/v1"


class DocusignConnector(IConnector):
    """
    DocuSign connector for: list_envelopes, send_envelope.

    API Base: docusign
    """

    provider = "docusign"
    supported_operations = ["list_envelopes", "send_envelope"]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a DocuSign operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_envelopes":
                    return await self._list_envelopes(client, headers, params)
                case "send_envelope":
                    return await self._send_envelope(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"DocuSign does not support '{operation}'",
                    )

    async def _list_envelopes(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute list_envelopes operation."""
        limit = int(params.get("limit", 50))
        offset = int(params.get("offset", 0))
        query_params = {"limit": limit, "offset": offset}
        for key in ["filter", "sort", "search"]:
            if key in params:
                query_params[key] = params[key]

        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/envelopes",
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

    async def _send_envelope(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute send_envelope operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/send_envelope",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()
