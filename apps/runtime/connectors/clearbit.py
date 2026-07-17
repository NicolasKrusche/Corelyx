"""Clearbit connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.clearbit.com/v1"


class ClearbitConnector(IConnector):
    """
    Clearbit connector for: enrich_company, enrich_person.

    API Base: clearbit
    """

    provider = "clearbit"
    supported_operations = ["enrich_company", "enrich_person"]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        """Execute a Clearbit operation."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "enrich_company":
                    return await self._enrich_company(client, headers, params)
                case "enrich_person":
                    return await self._enrich_person(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Clearbit does not support '{operation}'",
                    )

    async def _enrich_company(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute enrich_company operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/enrich_company",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()

    async def _enrich_person(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        """Execute enrich_person operation."""
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/enrich_person",
            headers=headers,
            json=params or {},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)

        return r.json()
