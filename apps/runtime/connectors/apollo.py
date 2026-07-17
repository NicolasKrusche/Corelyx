"""Apollo.io native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.apollo.io/api/v1"


class ApolloConnector(IConnector):
    provider = "apollo"
    supported_operations = [
        "search_contacts",
        "enrich_lead",
        "create_sequence",
        "list_sequences",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        headers = {
            "x-api-key": access_token,
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "search_contacts":
                    return await self._search_contacts(client, headers, params)
                case "enrich_lead":
                    return await self._enrich_lead(client, headers, params)
                case "create_sequence":
                    return await self._create_sequence(client, headers, params)
                case "list_sequences":
                    return await self._list_sequences(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Apollo does not support operation '{operation}'",
                    )

    async def _search_contacts(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        query = params.get("query", "")
        if not query:
            raise ConnectorError("MISSING_PARAM", "search_contacts requires 'query'")
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/mixed_people/api_search",
            headers=headers,
            json={
                "q_keywords": query,
                "page": params.get("page", 1),
                "per_page": params.get("per_page", 25),
            },
        )
        _raise_for_status(r, "search_contacts")
        return r.json()

    async def _enrich_lead(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        email = params.get("email")
        if not email:
            raise ConnectorError("MISSING_PARAM", "enrich_lead requires 'email'")
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/people/match",
            headers=headers,
            json={"email": email},
        )
        _raise_for_status(r, "enrich_lead")
        return r.json()

    async def _create_sequence(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        name = params.get("name")
        if not name:
            raise ConnectorError("MISSING_PARAM", "create_sequence requires 'name'")
        body: dict[str, Any] = {"name": name}
        for field in ("permissions", "active", "emailer_schedule_id", "folder_id"):
            if field in params:
                body[field] = params[field]
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/sequences",
            headers=headers,
            json=body,
        )
        _raise_for_status(r, "create_sequence")
        return r.json()

    async def _list_sequences(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        query = {
            "page": params.get("page", 1),
            "per_page": params.get("per_page", 25),
        }
        if params.get("query"):
            query["q_name"] = params["query"]
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/emailer_campaigns/search",
            headers=headers,
            params=query,
        )
        _raise_for_status(r, "list_sequences")
        return r.json()


def _raise_for_status(response: httpx.Response, operation: str) -> None:
    if response.status_code >= 400:
        raise ConnectorError(
            "API_ERROR",
            f"Apollo {operation} failed: {response.status_code} {response.text}",
        )
