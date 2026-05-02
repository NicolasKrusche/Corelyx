"""PayPal native connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api-m.paypal.com/v2"


class PayPalConnector(IConnector):
    provider = "paypal"
    supported_operations = [
        "list_transactions",
        "create_invoice",
        "get_order",
        "list_subscriptions",
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
                case "list_transactions":
                    return await self._list_transactions(client, headers, params)
                case "create_invoice":
                    return await self._create_invoice(client, headers, params)
                case "get_order":
                    return await self._get_order(client, headers, params)
                case "list_subscriptions":
                    return await self._list_subscriptions(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"PayPal does not support '{operation}'",
                    )

    async def _list_transactions(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        start_date = params.get("start_date", "2024-01-01T00:00:00-0700")
        end_date = params.get("end_date", "2024-12-31T23:59:59-0700")
        r = await request_with_rate_limit(
            client, "GET", "https://api-m.paypal.com/v1/reporting/transactions",
            headers=headers,
            params={"start_date": start_date, "end_date": end_date, "page_size": int(params.get("page_size", 20))},
        )
        _raise_for_status(r, "list_transactions")
        data = r.json()
        return {
            "transactions": data.get("transaction_details", []),
            "total_items": data.get("total_items", 0),
        }

    async def _create_invoice(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        recipient_email = params.get("recipient_email")
        if not recipient_email:
            raise ConnectorError("MISSING_PARAM", "create_invoice requires 'recipient_email'")
        body = {
            "detail": {
                "currency_code": params.get("currency_code", "USD"),
                "note": params.get("note", ""),
                "payment_term": {"term_type": params.get("term_type", "NET_30")},
            },
            "primary_recipients": [
                {"billing_info": {"email_address": recipient_email}}
            ],
            "items": params.get("items", []),
        }
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/invoicing/invoices",
            headers=headers, json=body,
        )
        _raise_for_status(r, "create_invoice")
        return r.json()

    async def _get_order(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        order_id = params.get("order_id")
        if not order_id:
            raise ConnectorError("MISSING_PARAM", "get_order requires 'order_id'")
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/checkout/orders/{order_id}",
            headers=headers,
        )
        _raise_for_status(r, "get_order")
        return r.json()

    async def _list_subscriptions(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        plan_id = params.get("plan_id")
        if not plan_id:
            raise ConnectorError("MISSING_PARAM", "list_subscriptions requires 'plan_id'")
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/billing/subscriptions",
            headers=headers,
            params={"plan_id": plan_id, "page_size": int(params.get("page_size", 20))},
        )
        _raise_for_status(r, "list_subscriptions")
        data = r.json()
        return {
            "subscriptions": data.get("subscriptions", []),
            "total_items": data.get("total_items", 0),
        }


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"PayPal {operation}: token expired or invalid")
    if r.status_code == 404:
        raise ConnectorError("NOT_FOUND", f"PayPal {operation}: resource not found")
    if r.status_code >= 400:
        raise ConnectorError(
            "PAYPAL_ERROR",
            f"PayPal {operation} ({r.status_code}): {r.text[:300]}",
        )
