"""Klaviyo native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://a.klaviyo.com/api"


class KlaviyoConnector(IConnector):
    provider = "klaviyo"
    supported_operations = [
        "list_lists",
        "add_profile_to_list",
        "create_profile",
        "track_event",
        "list_campaigns",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        headers = {
            "Authorization": f"Klaviyo-API-Key {access_token}",
            "Content-Type": "application/json",
            "revision": "2024-02-15",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_lists":
                    return await self._list_lists(client, headers, params)
                case "add_profile_to_list":
                    return await self._add_profile_to_list(client, headers, params)
                case "create_profile":
                    return await self._create_profile(client, headers, params)
                case "track_event":
                    return await self._track_event(client, headers, params)
                case "list_campaigns":
                    return await self._list_campaigns(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Klaviyo does not support '{operation}'",
                    )

    async def _list_lists(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        r = await request_with_rate_limit(client, "GET", f"{_BASE}/lists", headers=headers)
        _raise_for_status(r, "list_lists")
        return {"lists": r.json().get("data", [])}

    async def _add_profile_to_list(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        list_id = params.get("list_id")
        profile_id = params.get("profile_id")
        if not list_id or not profile_id:
            raise ConnectorError("MISSING_PARAM", "add_profile_to_list requires 'list_id' and 'profile_id'")
        body = {"data": [{"type": "profile", "id": profile_id}]}
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/lists/{list_id}/relationships/profiles",
            headers=headers,
            json=body,
        )
        _raise_for_status(r, "add_profile_to_list")
        return {"added": True, "list_id": list_id, "profile_id": profile_id}

    async def _create_profile(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        email = params.get("email")
        if not email:
            raise ConnectorError("MISSING_PARAM", "create_profile requires 'email'")
        attributes: dict[str, Any] = {"email": email}
        for field in ("first_name", "last_name", "phone_number", "properties"):
            if params.get(field):
                attributes[field] = params[field]
        body = {"data": {"type": "profile", "attributes": attributes}}
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/profiles",
            headers=headers,
            json=body,
        )
        _raise_for_status(r, "create_profile")
        return r.json().get("data", {})

    async def _track_event(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        event_name = params.get("event")
        email = params.get("email")
        if not event_name or not email:
            raise ConnectorError("MISSING_PARAM", "track_event requires 'event' and 'email'")
        body = {
            "data": {
                "type": "event",
                "attributes": {
                    "properties": params.get("properties", {}),
                    "metric": {"data": {"type": "metric", "attributes": {"name": event_name}}},
                    "profile": {"data": {"type": "profile", "attributes": {"email": email}}},
                },
            }
        }
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/events",
            headers=headers,
            json=body,
        )
        _raise_for_status(r, "track_event")
        return {"tracked": True, "event": event_name}

    async def _list_campaigns(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/campaigns",
            headers=headers,
            params={"filter": "equals(messages.channel,'email')"},
        )
        _raise_for_status(r, "list_campaigns")
        return {"campaigns": r.json().get("data", [])}


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError("TOKEN_EXPIRED", f"Klaviyo {operation}: token expired")
    if r.status_code >= 400:
        raise ConnectorError(
            "KLAVIYO_ERROR",
            f"Klaviyo {operation} ({r.status_code}): {r.text[:300]}",
        )
