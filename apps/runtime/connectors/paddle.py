"""Paddle native connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.paddle.com"


class PaddleConnector(IConnector):
    provider = "paddle"
    supported_operations = [
        "list_products",
        "list_subscriptions",
        "list_transactions",
        "get_customer",
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
                case "list_products":
                    return await self._list_products(client, headers, params)
                case "list_subscriptions":
                    return await self._list_subscriptions(client, headers, params)
                case "list_transactions":
                    return await self._list_transactions(client, headers, params)
                case "get_customer":
                    return await self._get_customer(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Paddle does not support '{operation}'",
                    )

    async def _list_products(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        query_params: dict[str, Any] = {"per_page": int(params.get("per_page", 20))}
        if params.get("status"):
            query_params["status"] = params["status"]
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/products",
            headers=headers,
            params=query_params,
        )
        _raise_for_status(r, "list_products")
        data = r.json()
        return {
            "products": data.get("data", []),
            "meta": data.get("meta", {}),
        }

    async def _list_subscriptions(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        query_params: dict[str, Any] = {"per_page": int(params.get("per_page", 20))}
        if params.get("status"):
            query_params["status"] = params["status"]
        if params.get("customer_id"):
            query_params["customer_id"] = params["customer_id"]
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/subscriptions",
            headers=headers,
            params=query_params,
        )
        _raise_for_status(r, "list_subscriptions")
        data = r.json()
        return {
            "subscriptions": data.get("data", []),
            "meta": data.get("meta", {}),
        }

    async def _list_transactions(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        query_params: dict[str, Any] = {"per_page": int(params.get("per_page", 20))}
        if params.get("customer_id"):
            query_params["customer_id"] = params["customer_id"]
        if params.get("status"):
            query_params["status"] = params["status"]
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/transactions",
            headers=headers,
            params=query_params,
        )
        _raise_for_status(r, "list_transactions")
        data = r.json()
        return {
            "transactions": data.get("data", []),
            "meta": data.get("meta", {}),
        }

    async def _get_customer(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        customer_id = params.get("customer_id")
        if not customer_id:
            raise ConnectorError("MISSING_PARAM", "get_customer requires 'customer_id'")
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/customers/{customer_id}",
            headers=headers,
        )
        _raise_for_status(r, "get_customer")
        return r.json().get("data", r.json())


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Paddle {operation}: token expired or invalid")
    if r.status_code == 404:
        raise ConnectorError("NOT_FOUND", f"Paddle {operation}: resource not found")
    if r.status_code >= 400:
        raise ConnectorError(
            "PADDLE_ERROR",
            f"Paddle {operation} ({r.status_code}): {r.text[:300]}",
        )
