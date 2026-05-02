"""Rocket.Chat native connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit


class RocketchatConnector(IConnector):
    provider = "rocketchat"
    supported_operations = [
        "send_message",
        "list_channels",
        "post_message",
        "get_channel_messages",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        server_url = params.get("server_url", "").rstrip("/")
        if not server_url:
            raise ConnectorError("MISSING_PARAM", "All Rocket.Chat operations require 'server_url'")
        base = f"{server_url}/api/v1"
        # Rocket.Chat accepts X-Auth-Token + X-User-Id or Bearer token
        headers = {
            "X-Auth-Token": access_token,
            "Content-Type": "application/json",
        }
        if params.get("user_id"):
            headers["X-User-Id"] = params["user_id"]
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "send_message" | "post_message":
                    return await self._post_message(client, headers, base, params)
                case "list_channels":
                    return await self._list_channels(client, headers, base, params)
                case "get_channel_messages":
                    return await self._get_channel_messages(client, headers, base, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Rocket.Chat does not support operation '{operation}'",
                    )

    async def _post_message(
        self, client: httpx.AsyncClient, headers: dict, base: str, params: dict
    ) -> dict:
        channel = params.get("channel")
        text = params.get("text", "")
        if not channel:
            raise ConnectorError("MISSING_PARAM", "post_message requires 'channel'")
        body: dict[str, Any] = {"channel": channel, "text": text}
        if params.get("alias"):
            body["alias"] = params["alias"]
        r = await request_with_rate_limit(
            client, "POST", f"{base}/chat.postMessage", headers=headers, json=body
        )
        _raise_for_status(r, "post_message")
        data = r.json()
        msg = data.get("message", {})
        return {
            "message_id": msg.get("_id"),
            "channel": msg.get("rid"),
            "timestamp": msg.get("ts"),
        }

    async def _list_channels(
        self, client: httpx.AsyncClient, headers: dict, base: str, params: dict
    ) -> dict:
        query: dict[str, Any] = {
            "count": int(params.get("count", 50)),
            "offset": int(params.get("offset", 0)),
        }
        r = await request_with_rate_limit(
            client, "GET", f"{base}/channels.list", headers=headers, params=query
        )
        _raise_for_status(r, "list_channels")
        data = r.json()
        return {
            "channels": [
                {
                    "id": c["_id"],
                    "name": c.get("name"),
                    "users_count": c.get("usersCount"),
                    "read_only": c.get("ro", False),
                }
                for c in data.get("channels", [])
            ]
        }

    async def _get_channel_messages(
        self, client: httpx.AsyncClient, headers: dict, base: str, params: dict
    ) -> dict:
        room_id = params.get("room_id")
        if not room_id:
            raise ConnectorError("MISSING_PARAM", "get_channel_messages requires 'room_id'")
        query: dict[str, Any] = {
            "roomId": room_id,
            "count": int(params.get("count", 20)),
            "offset": int(params.get("offset", 0)),
        }
        r = await request_with_rate_limit(
            client, "GET", f"{base}/channels.messages", headers=headers, params=query
        )
        _raise_for_status(r, "get_channel_messages")
        data = r.json()
        return {
            "messages": [
                {
                    "id": m["_id"],
                    "text": m.get("msg"),
                    "username": m.get("u", {}).get("username"),
                    "timestamp": m.get("ts"),
                }
                for m in data.get("messages", [])
            ],
            "total": data.get("total", 0),
        }


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError(
            "TOKEN_EXPIRED",
            f"Rocket.Chat {operation} failed: token expired or invalid",
        )
    if r.status_code >= 400:
        raise ConnectorError(
            "ROCKETCHAT_API_ERROR",
            f"Rocket.Chat {operation} failed ({r.status_code}): {r.text[:300]}",
        )
    data = r.json()
    if not data.get("success", True):
        raise ConnectorError(
            "ROCKETCHAT_API_ERROR",
            f"Rocket.Chat {operation} error: {data.get('error', 'unknown')}",
        )
