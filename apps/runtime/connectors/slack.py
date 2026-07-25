"""Slack native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import ConnectorError
from .rate_limit import request_with_rate_limit
from .sdk.base import BaseConnector
from .sdk.types import FieldKind, FieldSchema, OperationSchema

_BASE = "https://slack.com/api"


class SlackConnector(BaseConnector):
    provider = "slack"
    base_url = "https://slack.com/api"
    supported_operations = [
        "send_message",
        "read_channel",
        "list_channels",
        "create_channel",
    ]

    _operation_schemas = [
        OperationSchema(
            name="send_message",
            description="Send a message to a Slack channel",
            input_fields=[
                FieldSchema(name="channel", kind=FieldKind.STRING, required=True, description="Channel ID or name"),
                FieldSchema(name="text", kind=FieldKind.STRING, description="Message text"),
                FieldSchema(name="blocks", kind=FieldKind.ARRAY, description="Block Kit blocks"),
            ],
            output_fields=[
                FieldSchema(name="ts", kind=FieldKind.STRING, description="Message timestamp"),
                FieldSchema(name="channel", kind=FieldKind.STRING),
                FieldSchema(name="message", kind=FieldKind.OBJECT),
            ],
        ),
        OperationSchema(
            name="read_channel",
            description="Read messages from a Slack channel",
            input_fields=[
                FieldSchema(name="channel", kind=FieldKind.STRING, required=True),
                FieldSchema(name="limit", kind=FieldKind.INTEGER, default=20),
            ],
            output_fields=[
                FieldSchema(name="messages", kind=FieldKind.ARRAY),
                FieldSchema(name="has_more", kind=FieldKind.BOOLEAN),
            ],
        ),
        OperationSchema(
            name="list_channels",
            description="List accessible Slack channels",
            input_fields=[
                FieldSchema(name="limit", kind=FieldKind.INTEGER, default=100),
            ],
            output_fields=[
                FieldSchema(name="channels", kind=FieldKind.ARRAY),
            ],
        ),
        OperationSchema(
            name="create_channel",
            description="Create a new Slack channel",
            input_fields=[
                FieldSchema(name="name", kind=FieldKind.STRING, required=True),
                FieldSchema(name="is_private", kind=FieldKind.BOOLEAN, default=False),
            ],
            output_fields=[
                FieldSchema(name="channel_id", kind=FieldKind.STRING),
                FieldSchema(name="name", kind=FieldKind.STRING),
            ],
        ),
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json; charset=utf-8",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "send_message":
                    return await self._send_message(client, headers, params)
                case "read_channel":
                    return await self._read_channel(client, headers, params)
                case "list_channels":
                    return await self._list_channels(client, headers, params)
                case "create_channel":
                    return await self._create_channel(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Slack does not support operation '{operation}'",
                    )

    async def _send_message(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        channel = params.get("channel")
        text = params.get("text", "")
        if not channel:
            raise ConnectorError("MISSING_PARAM", "send_message requires 'channel'")
        body: dict[str, Any] = {"channel": channel, "text": text}
        if params.get("blocks"):
            body["blocks"] = params["blocks"]
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/chat.postMessage",
            headers=headers,
            json=body,
        )
        data = _raise_for_status(r, "send_message")
        return {
            "ts": data.get("ts"),
            "channel": data.get("channel"),
            "message": data.get("message", {}),
        }

    async def _read_channel(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        channel = params.get("channel")
        if not channel:
            raise ConnectorError("MISSING_PARAM", "read_channel requires 'channel'")
        limit = int(params.get("limit", 20))
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/conversations.history",
            headers=headers,
            params={"channel": channel, "limit": limit},
        )
        data = _raise_for_status(r, "read_channel")
        return {"messages": data.get("messages", []), "has_more": data.get("has_more", False)}

    async def _list_channels(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        limit = int(params.get("limit", 100))
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/conversations.list",
            headers=headers,
            params={"limit": limit, "exclude_archived": True},
        )
        data = _raise_for_status(r, "list_channels")
        channels = [
            {"id": c["id"], "name": c["name"], "is_private": c.get("is_private", False)}
            for c in data.get("channels", [])
        ]
        return {"channels": channels}

    async def _create_channel(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        name = params.get("name")
        if not name:
            raise ConnectorError("MISSING_PARAM", "create_channel requires 'name'")
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/conversations.create",
            headers=headers,
            json={"name": name, "is_private": bool(params.get("is_private", False))},
        )
        data = _raise_for_status(r, "create_channel")
        ch = data.get("channel", {})
        return {"channel_id": ch.get("id"), "name": ch.get("name")}


def _raise_for_status(r: httpx.Response, operation: str) -> dict:
    if r.status_code == 401:
        raise ConnectorError(
            "TOKEN_EXPIRED",
            f"Slack {operation} failed: OAuth access token is invalid or expired",
        )
    if r.status_code >= 400:
        raise ConnectorError(
            "SLACK_HTTP_ERROR",
            f"Slack {operation} failed ({r.status_code}): {r.text[:300]}",
        )
    data = r.json()
    if not data.get("ok"):
        error = data.get("error", "unknown")
        # Slack signals auth failures as HTTP 200 + ok:false. Map the token
        # errors to TOKEN_EXPIRED so the runtime's force-refresh/reconnect path
        # (which keys off the code, not the HTTP status) actually triggers.
        if error in ("invalid_auth", "token_expired", "not_authed", "account_inactive", "token_revoked"):
            raise ConnectorError(
                "TOKEN_EXPIRED",
                f"Slack {operation} failed: OAuth access token is invalid or expired ({error})",
            )
        raise ConnectorError(
            "SLACK_API_ERROR",
            f"Slack {operation} error: {error}",
        )
    return data
