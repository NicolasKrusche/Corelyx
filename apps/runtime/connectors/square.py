"""Square native connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://connect.squareup.com/v2"


class SquareConnector(IConnector):
    provider = "square"
    supported_operations = [
        "list_transactions",
        "list_customers",
        "create_customer",
        "list_catalog",
        "list_orders",
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
            "Square-Version": "2024-01-18",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_transactions":
                    return await self._list_transactions(client, headers, params)
                case "list_customers":
                    return await self._list_customers(client, headers, params)
                case "create_customer":
                    return await self._create_customer(client, headers, params)
                case "list_catalog":
                    return await self._list_catalog(client, headers, params)
                case "list_orders":
                    return await self._list_orders(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Square does not support '{operation}'",
                    )

    async def _list_transactions(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        location_id = params.get("location_id")
        if not location_id:
            raise ConnectorError("MISSING_PARAM", "list_transactions requires 'location_id'")
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/locations/{location_id}/transactions",
            headers=headers,
        )
        _raise_for_status(r, "list_transactions")
        data = r.json()
        return {"transactions": data.get("transactions", [])}

    async def _list_customers(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        query_params: dict[str, Any] = {"limit": int(params.get("limit", 20))}
        if params.get("cursor"):
            query_params["cursor"] = params["cursor"]
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/customers",
            headers=headers,
            params=query_params,
        )
        _raise_for_status(r, "list_customers")
        data = r.json()
        return {"customers": data.get("customers", []), "cursor": data.get("cursor")}

    async def _create_customer(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        body: dict[str, Any] = {}
        for field in ("given_name", "family_name", "email_address", "phone_number", "note"):
            if params.get(field):
                body[field] = str(params[field])
        if not body.get("email_address") and not body.get("given_name"):
            raise ConnectorError(
                "MISSING_PARAM", "create_customer requires 'email_address' or 'given_name'"
            )
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/customers",
            headers=headers, json=body,
        )
        _raise_for_status(r, "create_customer")
        return r.json().get("customer", r.json())

    async def _list_catalog(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        types = params.get("types", "ITEM,ITEM_VARIATION,CATEGORY")
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/catalog/list",
            headers=headers,
            params={"types": types},
        )
        _raise_for_status(r, "list_catalog")
        data = r.json()
        return {"objects": data.get("objects", []), "cursor": data.get("cursor")}

    async def _list_orders(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        location_ids = params.get("location_ids", [])
        if not location_ids:
            raise ConnectorError("MISSING_PARAM", "list_orders requires 'location_ids'")
        body: dict[str, Any] = {
            "location_ids": location_ids if isinstance(location_ids, list) else [location_ids],
            "limit": int(params.get("limit", 20)),
        }
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/orders/search",
            headers=headers, json=body,
        )
        _raise_for_status(r, "list_orders")
        data = r.json()
        return {"orders": data.get("orders", []), "cursor": data.get("cursor")}


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Square {operation}: token expired or invalid")
    if r.status_code == 404:
        raise ConnectorError("NOT_FOUND", f"Square {operation}: resource not found")
    if r.status_code >= 400:
        raise ConnectorError(
            "SQUARE_ERROR",
            f"Square {operation} ({r.status_code}): {r.text[:300]}",
        )
