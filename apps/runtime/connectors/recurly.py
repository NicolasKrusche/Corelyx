"""Recurly native connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://v3.recurly.com"


class RecurlyConnector(IConnector):
    provider = "recurly"
    supported_operations = [
        "list_subscriptions",
        "get_subscription",
        "list_accounts",
        "list_invoices",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        headers = {
            "Authorization": f"Basic {_encode_key(access_token)}",
            "Accept": "application/vnd.recurly.v2021-02-25+json",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_subscriptions":
                    return await self._list_subscriptions(client, headers, params)
                case "get_subscription":
                    return await self._get_subscription(client, headers, params)
                case "list_accounts":
                    return await self._list_accounts(client, headers, params)
                case "list_invoices":
                    return await self._list_invoices(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Recurly does not support '{operation}'",
                    )

    async def _list_subscriptions(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        limit = int(params.get("limit", 20))
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/subscriptions",
            headers=headers,
            params={"limit": limit},
        )
        _raise_for_status(r, "list_subscriptions")
        data = r.json()
        return {"subscriptions": data.get("data", []), "has_more": data.get("has_more", False)}

    async def _get_subscription(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        subscription_id = params.get("subscription_id")
        if not subscription_id:
            raise ConnectorError("MISSING_PARAM", "get_subscription requires 'subscription_id'")
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/subscriptions/{subscription_id}",
            headers=headers,
        )
        _raise_for_status(r, "get_subscription")
        return r.json()

    async def _list_accounts(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        limit = int(params.get("limit", 20))
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/accounts",
            headers=headers,
            params={"limit": limit},
        )
        _raise_for_status(r, "list_accounts")
        data = r.json()
        return {"accounts": data.get("data", []), "has_more": data.get("has_more", False)}

    async def _list_invoices(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        limit = int(params.get("limit", 20))
        query_params: dict[str, Any] = {"limit": limit}
        if params.get("account_id"):
            return await self._list_account_invoices(client, headers, params)
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/invoices",
            headers=headers,
            params=query_params,
        )
        _raise_for_status(r, "list_invoices")
        data = r.json()
        return {"invoices": data.get("data", []), "has_more": data.get("has_more", False)}

    async def _list_account_invoices(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        account_id = params["account_id"]
        limit = int(params.get("limit", 20))
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/accounts/{account_id}/invoices",
            headers=headers,
            params={"limit": limit},
        )
        _raise_for_status(r, "list_invoices")
        data = r.json()
        return {"invoices": data.get("data", []), "has_more": data.get("has_more", False)}


def _encode_key(api_key: str) -> str:
    import base64
    return base64.b64encode(f"{api_key}:".encode()).decode()


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Recurly {operation}: API key invalid or expired")
    if r.status_code == 404:
        raise ConnectorError("NOT_FOUND", f"Recurly {operation}: resource not found")
    if r.status_code >= 400:
        raise ConnectorError(
            "RECURLY_ERROR",
            f"Recurly {operation} ({r.status_code}): {r.text[:300]}",
        )
