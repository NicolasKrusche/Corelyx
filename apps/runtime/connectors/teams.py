"""Microsoft Teams native connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://graph.microsoft.com/v1.0"


class TeamsConnector(IConnector):
    provider = "teams"
    supported_operations = [
        "send_message",
        "list_channels",
        "list_teams",
        "create_channel",
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
                case "list_channels":
                    return await self._list_channels(client, headers, params)
                case "list_teams":
                    return await self._list_teams(client, headers, params)
                case "create_channel":
                    return await self._create_channel(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Teams does not support operation '{operation}'",
                    )

    async def _send_message(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        team_id = params.get("team_id")
        channel_id = params.get("channel_id")
        content = params.get("content", "")
        if not team_id or not channel_id:
            raise ConnectorError(
                "MISSING_PARAM", "send_message requires 'team_id' and 'channel_id'"
            )
        body = {"body": {"content": content, "contentType": params.get("content_type", "text")}}
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/teams/{team_id}/channels/{channel_id}/messages",
            headers=headers,
            json=body,
        )
        _raise_for_status(r, "send_message")
        data = r.json()
        return {
            "message_id": data.get("id"),
            "channel_id": data.get("channelIdentity", {}).get("channelId"),
            "created_at": data.get("createdDateTime"),
        }

    async def _list_channels(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        team_id = params.get("team_id")
        if not team_id:
            raise ConnectorError("MISSING_PARAM", "list_channels requires 'team_id'")
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/teams/{team_id}/channels",
            headers=headers,
        )
        _raise_for_status(r, "list_channels")
        data = r.json()
        return {
            "channels": [
                {
                    "id": c["id"],
                    "display_name": c.get("displayName"),
                    "description": c.get("description"),
                    "membership_type": c.get("membershipType"),
                }
                for c in data.get("value", [])
            ]
        }

    async def _list_teams(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/me/joinedTeams",
            headers=headers,
        )
        _raise_for_status(r, "list_teams")
        data = r.json()
        return {
            "teams": [
                {
                    "id": t["id"],
                    "display_name": t.get("displayName"),
                    "description": t.get("description"),
                }
                for t in data.get("value", [])
            ]
        }

    async def _create_channel(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        team_id = params.get("team_id")
        display_name = params.get("display_name")
        if not team_id or not display_name:
            raise ConnectorError(
                "MISSING_PARAM", "create_channel requires 'team_id' and 'display_name'"
            )
        body: dict[str, Any] = {
            "displayName": display_name,
            "membershipType": params.get("membership_type", "standard"),
        }
        if params.get("description"):
            body["description"] = params["description"]
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/teams/{team_id}/channels",
            headers=headers,
            json=body,
        )
        _raise_for_status(r, "create_channel")
        data = r.json()
        return {
            "channel_id": data.get("id"),
            "display_name": data.get("displayName"),
        }


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError(
            "TOKEN_EXPIRED",
            f"Teams {operation} failed: token expired or invalid",
        )
    if r.status_code == 403:
        raise ConnectorError(
            "TEAMS_FORBIDDEN",
            f"Teams {operation} failed: insufficient permissions",
        )
    if r.status_code >= 400:
        raise ConnectorError(
            "TEAMS_API_ERROR",
            f"Teams {operation} failed ({r.status_code}): {r.text[:300]}",
        )
