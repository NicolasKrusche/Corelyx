"""Cisco Webex native connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://webexapis.com/v1"


class WebexConnector(IConnector):
    provider = "webex"
    supported_operations = [
        "send_message",
        "list_rooms",
        "create_room",
        "list_people",
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
                case "send_message":
                    return await self._send_message(client, headers, params)
                case "list_rooms":
                    return await self._list_rooms(client, headers, params)
                case "create_room":
                    return await self._create_room(client, headers, params)
                case "list_people":
                    return await self._list_people(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Webex does not support operation '{operation}'",
                    )

    async def _send_message(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        text = params.get("text", "")
        if not params.get("room_id") and not params.get("to_person_email"):
            raise ConnectorError(
                "MISSING_PARAM", "send_message requires 'room_id' or 'to_person_email'"
            )
        body: dict[str, Any] = {"text": text}
        if params.get("room_id"):
            body["roomId"] = params["room_id"]
        if params.get("to_person_email"):
            body["toPersonEmail"] = params["to_person_email"]
        if params.get("markdown"):
            body["markdown"] = params["markdown"]
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/messages", headers=headers, json=body
        )
        _raise_for_status(r, "send_message")
        data = r.json()
        return {
            "message_id": data.get("id"),
            "room_id": data.get("roomId"),
            "person_email": data.get("personEmail"),
            "created": data.get("created"),
        }

    async def _list_rooms(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        query: dict[str, Any] = {"max": int(params.get("max", 50))}
        if params.get("type"):
            query["type"] = params["type"]
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/rooms", headers=headers, params=query
        )
        _raise_for_status(r, "list_rooms")
        data = r.json()
        return {
            "rooms": [
                {
                    "id": room["id"],
                    "title": room.get("title"),
                    "type": room.get("type"),
                    "created": room.get("created"),
                }
                for room in data.get("items", [])
            ]
        }

    async def _create_room(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        title = params.get("title")
        if not title:
            raise ConnectorError("MISSING_PARAM", "create_room requires 'title'")
        body: dict[str, Any] = {"title": title}
        if params.get("team_id"):
            body["teamId"] = params["team_id"]
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/rooms", headers=headers, json=body
        )
        _raise_for_status(r, "create_room")
        data = r.json()
        return {
            "room_id": data.get("id"),
            "title": data.get("title"),
            "type": data.get("type"),
            "created": data.get("created"),
        }

    async def _list_people(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        query: dict[str, Any] = {"max": int(params.get("max", 25))}
        if params.get("email"):
            query["email"] = params["email"]
        if params.get("display_name"):
            query["displayName"] = params["display_name"]
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/people", headers=headers, params=query
        )
        _raise_for_status(r, "list_people")
        data = r.json()
        return {
            "people": [
                {
                    "id": p["id"],
                    "display_name": p.get("displayName"),
                    "emails": p.get("emails", []),
                    "status": p.get("status"),
                }
                for p in data.get("items", [])
            ]
        }


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError(
            "TOKEN_EXPIRED",
            f"Webex {operation} failed: token expired",
        )
    if r.status_code == 403:
        raise ConnectorError(
            "WEBEX_FORBIDDEN",
            f"Webex {operation} failed: insufficient permissions",
        )
    if r.status_code >= 400:
        raise ConnectorError(
            "WEBEX_API_ERROR",
            f"Webex {operation} failed ({r.status_code}): {r.text[:300]}",
        )
