"""Discord native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://discord.com/api/v10"


class DiscordConnector(IConnector):
    provider = "discord"
    supported_operations = [
        "send_message",
        "list_channels",
        "create_message",
        "get_guild_members",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        headers = {
            "Authorization": f"Bot {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "send_message":
                    return await self._send_message(client, headers, params)
                case "list_channels":
                    return await self._list_channels(client, headers, params)
                case "create_message":
                    return await self._send_message(client, headers, params)
                case "get_guild_members":
                    return await self._get_guild_members(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Discord does not support operation '{operation}'",
                    )

    async def _send_message(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        channel_id = params.get("channel_id")
        content = params.get("content", "")
        if not channel_id:
            raise ConnectorError("MISSING_PARAM", "send_message requires 'channel_id'")
        body: dict[str, Any] = {"content": content}
        if params.get("embeds"):
            body["embeds"] = params["embeds"]
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/channels/{channel_id}/messages",
            headers=headers,
            json=body,
        )
        _raise_for_status(r, "send_message")
        data = r.json()
        return {
            "message_id": data.get("id"),
            "channel_id": data.get("channel_id"),
            "content": data.get("content"),
            "timestamp": data.get("timestamp"),
        }

    async def _list_channels(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        guild_id = params.get("guild_id")
        if not guild_id:
            raise ConnectorError("MISSING_PARAM", "list_channels requires 'guild_id'")
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/guilds/{guild_id}/channels",
            headers=headers,
        )
        _raise_for_status(r, "list_channels")
        channels = r.json()
        return {
            "channels": [
                {
                    "id": c["id"],
                    "name": c.get("name"),
                    "type": c.get("type"),
                    "position": c.get("position"),
                }
                for c in channels
            ]
        }

    async def _get_guild_members(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        guild_id = params.get("guild_id")
        if not guild_id:
            raise ConnectorError("MISSING_PARAM", "get_guild_members requires 'guild_id'")
        limit = int(params.get("limit", 100))
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/guilds/{guild_id}/members",
            headers=headers,
            params={"limit": limit},
        )
        _raise_for_status(r, "get_guild_members")
        members = r.json()
        return {
            "members": [
                {
                    "user_id": m["user"]["id"],
                    "username": m["user"].get("username"),
                    "discriminator": m["user"].get("discriminator"),
                    "nick": m.get("nick"),
                    "joined_at": m.get("joined_at"),
                }
                for m in members
            ]
        }


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError(
            "TOKEN_EXPIRED",
            f"Discord {operation} failed: token expired or invalid",
        )
    if r.status_code == 403:
        raise ConnectorError(
            "DISCORD_FORBIDDEN",
            f"Discord {operation} failed: missing permissions",
        )
    if r.status_code == 404:
        raise ConnectorError(
            "DISCORD_NOT_FOUND",
            f"Discord {operation} failed: resource not found",
        )
    if r.status_code >= 400:
        raise ConnectorError(
            "DISCORD_API_ERROR",
            f"Discord {operation} failed ({r.status_code}): {r.text[:300]}",
        )
