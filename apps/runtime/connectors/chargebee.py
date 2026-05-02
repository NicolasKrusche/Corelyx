"""Chargebee native connector."""
from __future__ import annotations

import base64
from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit


class ChargebeeConnector(IConnector):
    provider = "chargebee"
    supported_operations = [
        "list_subscriptions",
        "get_subscription",
        "list_customers",
        "list_invoices",
        "create_subscription",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        site = params.get("site")
        if not site:
            raise ConnectorError("MISSING_PARAM", "Chargebee requires 'site' param (your Chargebee subdomain)")
        base = f"https://{site}.chargebee.com/api/v2"
        # access_token is the API key; Chargebee uses HTTP Basic with api_key as username
        encoded = base64.b64encode(f"{access_token}:".encode()).decode()
        headers = {
            "Authorization": f"Basic {encoded}",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_subscriptions":
                    return await self._list_subscriptions(client, headers, base, params)
                case "get_subscription":
                    return await self._get_subscription(client, headers, base, params)
                case "list_customers":
                    return await self._list_customers(client, headers, base, params)
                case "list_invoices":
                    return await self._list_invoices(client, headers, base, params)
                case "create_subscription":
                    return await self._create_subscription(client, headers, base, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Chargebee does not support '{operation}'",
                    )

    async def _list_subscriptions(
        self, client: httpx.AsyncClient, headers: dict, base: str, params: dict
    ) -> dict:
        limit = int(params.get("limit", 20))
        r = await request_with_rate_limit(
            client, "GET", f"{base}/subscriptions",
            headers=headers,
            params={"limit": limit},
        )
        _raise_for_status(r, "list_subscriptions")
        data = r.json()
        return {
            "subscriptions": [item["subscription"] for item in data.get("list", [])],
            "next_offset": data.get("next_offset"),
        }

    async def _get_subscription(
        self, client: httpx.AsyncClient, headers: dict, base: str, params: dict
    ) -> dict:
        subscription_id = params.get("subscription_id")
        if not subscription_id:
            raise ConnectorError("MISSING_PARAM", "get_subscription requires 'subscription_id'")
        r = await request_with_rate_limit(
            client, "GET", f"{base}/subscriptions/{subscription_id}",
            headers=headers,
        )
        _raise_for_status(r, "get_subscription")
        return r.json().get("subscription", r.json())

    async def _list_customers(
        self, client: httpx.AsyncClient, headers: dict, base: str, params: dict
    ) -> dict:
        limit = int(params.get("limit", 20))
        r = await request_with_rate_limit(
            client, "GET", f"{base}/customers",
            headers=headers,
            params={"limit": limit},
        )
        _raise_for_status(r, "list_customers")
        data = r.json()
        return {
            "customers": [item["customer"] for item in data.get("list", [])],
            "next_offset": data.get("next_offset"),
        }

    async def _list_invoices(
        self, client: httpx.AsyncClient, headers: dict, base: str, params: dict
    ) -> dict:
        limit = int(params.get("limit", 20))
        r = await request_with_rate_limit(
            client, "GET", f"{base}/invoices",
            headers=headers,
            params={"limit": limit},
        )
        _raise_for_status(r, "list_invoices")
        data = r.json()
        return {
            "invoices": [item["invoice"] for item in data.get("list", [])],
            "next_offset": data.get("next_offset"),
        }

    async def _create_subscription(
        self, client: httpx.AsyncClient, headers: dict, base: str, params: dict
    ) -> dict:
        plan_id = params.get("plan_id")
        if not plan_id:
            raise ConnectorError("MISSING_PARAM", "create_subscription requires 'plan_id'")
        body: dict[str, str] = {"plan_id": plan_id}
        for field in ("customer_id", "plan_quantity", "billing_cycles"):
            if params.get(field) is not None:
                body[field] = str(params[field])
        r = await request_with_rate_limit(
            client, "POST", f"{base}/subscriptions",
            headers=headers,
            data=body,
        )
        _raise_for_status(r, "create_subscription")
        return r.json().get("subscription", r.json())


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Chargebee {operation}: API key invalid or expired")
    if r.status_code == 404:
        raise ConnectorError("NOT_FOUND", f"Chargebee {operation}: resource not found")
    if r.status_code >= 400:
        raise ConnectorError(
            "CHARGEBEE_ERROR",
            f"Chargebee {operation} ({r.status_code}): {r.text[:300]}",
        )
