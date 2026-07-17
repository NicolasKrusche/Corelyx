"""Lattice connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.lattice.com/v1"


class LatticeConnector(IConnector):
    """
    Lattice connector for: list_reviews, get_review.

    API Base: lattice
    """

    provider = "lattice"
    supported_operations = ["list_reviews", "get_review"]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Lattice operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_reviews":
                    return await self._list_reviews(client, headers, params)
                case "get_review":
                    return await self._get_review(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Lattice does not support '{operation}'",
                    )

    async def _list_reviews(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute list_reviews operation."""
        limit = int(params.get("limit", 50))
        offset = int(params.get("offset", 0))
        query_params = {"limit": limit, "offset": offset}
        for key in ["filter", "sort", "search"]:
            if key in params:
                query_params[key] = params[key]

        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/reviews",
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

    async def _get_review(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute get_review operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/get_review",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()
