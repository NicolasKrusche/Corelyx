"""ZoomInfo native connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.zoominfo.com"


class ZoomInfoConnector(IConnector):
    provider = "zoominfo"
    supported_operations = [
        "search_contacts",
        "get_company_intelligence",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "search_contacts":
                    return await self._search_contacts(client, headers, params)
                case "get_company_intelligence":
                    return await self._get_company_intelligence(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"ZoomInfo does not support operation '{operation}'",
                    )

    async def _search_contacts(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        # Placeholder - ZoomInfo API for searching contacts
        query = params.get("query", "")
        if not query:
            raise ConnectorError("MISSING_PARAM", "search_contacts requires 'query'")
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/search/contact",
            headers=headers,
            params={"q": query, "page": params.get("page", 1)},
        )
        _raise_for_status(r, "search_contacts")
        return r.json()

    async def _get_company_intelligence(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        company_name = params.get("company_name")
        if not company_name:
            raise ConnectorError("MISSING_PARAM", "get_company_intelligence requires 'company_name'")
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/lookup/company",
            headers=headers,
            params={"name": company_name},
        )
        _raise_for_status(r, "get_company_intelligence")
        return r.json()


def _raise_for_status(response: httpx.Response, operation: str) -> None:
    if response.status_code >= 400:
        raise ConnectorError(
            "API_ERROR",
            f"ZoomInfo {operation} failed: {response.status_code} {response.text}",
        )