"""Drip native connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit


class DripConnector(IConnector):
    provider = "drip"
    supported_operations = [
        "list_subscribers",
        "create_subscriber",
        "apply_tag",
        "list_campaigns",
        "record_event",
    ]

    def _base(self, params: dict) -> str:
        account_id = params.get("account_id")
        if not account_id:
            raise ConnectorError("MISSING_PARAM", "Drip requires 'account_id' param")
        return f"https://api.getdrip.com/v2/{account_id}"

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
                case "list_subscribers":
                    return await self._list_subscribers(client, headers, params)
                case "create_subscriber":
                    return await self._create_subscriber(client, headers, params)
                case "apply_tag":
                    return await self._apply_tag(client, headers, params)
                case "list_campaigns":
                    return await self._list_campaigns(client, headers, params)
                case "record_event":
                    return await self._record_event(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Drip does not support '{operation}'",
                    )

    async def _list_subscribers(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        base = self._base(params)
        r = await request_with_rate_limit(
            client, "GET", f"{base}/subscribers", headers=headers,
            params={"per_page": int(params.get("per_page", 100))},
        )
        _raise_for_status(r, "list_subscribers")
        return {"subscribers": r.json().get("subscribers", [])}

    async def _create_subscriber(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        base = self._base(params)
        email = params.get("email")
        if not email:
            raise ConnectorError("MISSING_PARAM", "create_subscriber requires 'email'")
        subscriber: dict[str, Any] = {"email": email}
        for field in ("first_name", "last_name", "tags", "custom_fields"):
            if params.get(field):
                subscriber[field] = params[field]
        r = await request_with_rate_limit(
            client, "POST", f"{base}/subscribers", headers=headers,
            json={"subscribers": [subscriber]},
        )
        _raise_for_status(r, "create_subscriber")
        subs = r.json().get("subscribers", [])
        return subs[0] if subs else {}

    async def _apply_tag(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        base = self._base(params)
        email = params.get("email")
        tag = params.get("tag")
        if not email or not tag:
            raise ConnectorError("MISSING_PARAM", "apply_tag requires 'email' and 'tag'")
        body = {"tags": [{"email": email, "tag": tag}]}
        r = await request_with_rate_limit(
            client, "POST", f"{base}/tags", headers=headers, json=body,
        )
        _raise_for_status(r, "apply_tag")
        return {"applied": True, "email": email, "tag": tag}

    async def _list_campaigns(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        base = self._base(params)
        r = await request_with_rate_limit(
            client, "GET", f"{base}/campaigns", headers=headers,
        )
        _raise_for_status(r, "list_campaigns")
        return {"campaigns": r.json().get("campaigns", [])}

    async def _record_event(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        base = self._base(params)
        email = params.get("email")
        action = params.get("action")
        if not email or not action:
            raise ConnectorError("MISSING_PARAM", "record_event requires 'email' and 'action'")
        body: dict[str, Any] = {"events": [{"email": email, "action": action}]}
        if params.get("properties"):
            body["events"][0]["properties"] = params["properties"]
        r = await request_with_rate_limit(
            client, "POST", f"{base}/events", headers=headers, json=body,
        )
        _raise_for_status(r, "record_event")
        return {"recorded": True, "email": email, "action": action}


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Drip {operation}: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "DRIP_ERROR",
            f"Drip {operation} ({r.status_code}): {r.text[:300]}",
        )
