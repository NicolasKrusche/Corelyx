"""Stripe native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.stripe.com/v1"


class StripeConnector(IConnector):
    provider = "stripe"
    supported_operations = [
        "list_customers",
        "create_customer",
        "list_payments",
        "create_payment_link",
        "list_subscriptions",
        "retrieve_invoice",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_customers":
                    return await self._list_customers(client, headers, params)
                case "create_customer":
                    return await self._create_customer(client, headers, params)
                case "list_payments":
                    return await self._list_payments(client, headers, params)
                case "create_payment_link":
                    return await self._create_payment_link(client, headers, params)
                case "list_subscriptions":
                    return await self._list_subscriptions(client, headers, params)
                case "retrieve_invoice":
                    return await self._retrieve_invoice(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Stripe does not support '{operation}'",
                    )

    async def _list_customers(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        limit = int(params.get("limit", 20))
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/customers",
            headers=headers,
            params={"limit": limit},
        )
        _raise_for_status(r, "list_customers")
        data = r.json()
        return {"customers": data.get("data", []), "has_more": data.get("has_more", False)}

    async def _create_customer(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        body: dict[str, str] = {}
        for field in ("email", "name", "phone", "description"):
            if params.get(field):
                body[field] = str(params[field])
        if not body.get("email"):
            raise ConnectorError("MISSING_PARAM", "create_customer requires 'email'")
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/customers",
            headers=headers,
            data=body,
        )
        _raise_for_status(r, "create_customer")
        return r.json()

    async def _list_payments(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        limit = int(params.get("limit", 20))
        query_params: dict[str, Any] = {"limit": limit}
        if params.get("customer"):
            query_params["customer"] = params["customer"]
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/payment_intents",
            headers=headers,
            params=query_params,
        )
        _raise_for_status(r, "list_payments")
        data = r.json()
        return {"payments": data.get("data", []), "has_more": data.get("has_more", False)}

    async def _create_payment_link(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        price_id = params.get("price_id")
        quantity = int(params.get("quantity", 1))
        if not price_id:
            raise ConnectorError("MISSING_PARAM", "create_payment_link requires 'price_id'")
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/payment_links",
            headers=headers,
            data={
                "line_items[0][price]": price_id,
                "line_items[0][quantity]": str(quantity),
            },
        )
        _raise_for_status(r, "create_payment_link")
        return r.json()

    async def _list_subscriptions(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        limit = int(params.get("limit", 20))
        query_params: dict[str, Any] = {"limit": limit}
        if params.get("customer"):
            query_params["customer"] = params["customer"]
        if params.get("status"):
            query_params["status"] = params["status"]
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/subscriptions",
            headers=headers,
            params=query_params,
        )
        _raise_for_status(r, "list_subscriptions")
        data = r.json()
        return {"subscriptions": data.get("data", []), "has_more": data.get("has_more", False)}

    async def _retrieve_invoice(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        invoice_id = params.get("invoice_id")
        if not invoice_id:
            raise ConnectorError("MISSING_PARAM", "retrieve_invoice requires 'invoice_id'")
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/invoices/{invoice_id}",
            headers=headers,
        )
        _raise_for_status(r, "retrieve_invoice")
        return r.json()


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Stripe {operation}: token expired or invalid")
    if r.status_code == 404:
        raise ConnectorError("NOT_FOUND", f"Stripe {operation}: resource not found")
    if r.status_code >= 400:
        raise ConnectorError(
            "STRIPE_ERROR",
            f"Stripe {operation} ({r.status_code}): {r.text[:300]}",
        )
