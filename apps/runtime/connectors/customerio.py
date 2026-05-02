"""Customer.io native connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.customer.io/v1"


class CustomerIOConnector(IConnector):
    provider = "customerio"
    supported_operations = [
        "identify_customer",
        "track_event",
        "send_email",
        "list_campaigns",
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
                case "identify_customer":
                    return await self._identify_customer(client, headers, params)
                case "track_event":
                    return await self._track_event(client, headers, params)
                case "send_email":
                    return await self._send_email(client, headers, params)
                case "list_campaigns":
                    return await self._list_campaigns(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Customer.io does not support '{operation}'",
                    )

    async def _identify_customer(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        identifier = params.get("id") or params.get("email")
        if not identifier:
            raise ConnectorError("MISSING_PARAM", "identify_customer requires 'id' or 'email'")
        body: dict[str, Any] = {}
        if params.get("email"):
            body["email"] = params["email"]
        if params.get("attributes"):
            body.update(params["attributes"])
        r = await request_with_rate_limit(
            client, "PUT", f"{_BASE}/customers/{identifier}",
            headers=headers, json=body,
        )
        _raise_for_status(r, "identify_customer")
        return {"identified": True, "id": identifier}

    async def _track_event(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        customer_id = params.get("customer_id")
        event_name = params.get("event")
        if not customer_id or not event_name:
            raise ConnectorError("MISSING_PARAM", "track_event requires 'customer_id' and 'event'")
        body: dict[str, Any] = {"name": event_name}
        if params.get("data"):
            body["data"] = params["data"]
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/customers/{customer_id}/events",
            headers=headers, json=body,
        )
        _raise_for_status(r, "track_event")
        return {"tracked": True, "event": event_name}

    async def _send_email(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        to = params.get("to")
        transactional_message_id = params.get("transactional_message_id")
        if not to or not transactional_message_id:
            raise ConnectorError(
                "MISSING_PARAM",
                "send_email requires 'to' and 'transactional_message_id'",
            )
        body: dict[str, Any] = {
            "to": to,
            "transactional_message_id": transactional_message_id,
        }
        if params.get("message_data"):
            body["message_data"] = params["message_data"]
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/send/email", headers=headers, json=body,
        )
        _raise_for_status(r, "send_email")
        return r.json()

    async def _list_campaigns(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/campaigns", headers=headers,
        )
        _raise_for_status(r, "list_campaigns")
        return {"campaigns": r.json().get("campaigns", [])}


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Customer.io {operation}: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "CUSTOMERIO_ERROR",
            f"Customer.io {operation} ({r.status_code}): {r.text[:300]}",
        )
